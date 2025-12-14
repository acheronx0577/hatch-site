import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';
import {
  AccountingProvider,
  AccountingSyncStatus,
  NotificationType,
  OrgEventType,
  PlaybookTriggerType,
  UserRole
} from '@hatch/db';

import { PrismaService } from '../prisma/prisma.service';
import { OrgEventsService } from '../org-events/org-events.service';
import { IntegrationService } from '../integration/integration.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { accountingSyncErrorEmail } from '../mail/templates';
import { AuditService } from '../audit/audit.service';
import { ConnectAccountingDto } from './dto/connect-accounting.dto';
import { DemoConfig } from '@/config/demo.config';
import { PlaybookRunnerService } from '../playbooks/playbook-runner.service';

@Injectable()
export class OrgAccountingService {
  private readonly dashboardBaseUrl = process.env.DASHBOARD_BASE_URL ?? 'http://localhost:5173/broker';
  private readonly logger = new Logger(OrgAccountingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orgEvents: OrgEventsService,
    private readonly integration: IntegrationService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly playbooks: PlaybookRunnerService
  ) {}

  private isDemoOrg(orgId: string) {
    return DemoConfig.isDemoMode && DemoConfig.demoOrgId === orgId;
  }

  private async assertUserInOrg(userId: string, orgId: string) {
    const membership = await this.prisma.userOrgMembership.findUnique({
      where: { userId_orgId: { userId, orgId } }
    });
    if (!membership) {
      throw new ForbiddenException('User is not part of this organization');
    }
    return membership;
  }

  private async getUserRole(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });
    return user?.role ?? null;
  }

  private async assertBroker(userId: string, orgId: string) {
    await this.assertUserInOrg(userId, orgId);
    const role = await this.getUserRole(userId);
    if (role !== UserRole.BROKER) {
      throw new ForbiddenException('Broker access required');
    }
  }

  private async ensureConfig(orgId: string) {
    const config = await this.prisma.accountingIntegrationConfig.findUnique({
      where: { organizationId: orgId }
    });
    if (!config) {
      throw new BadRequestException('Accounting integration is not connected');
    }
    return config;
  }

  private async alertBrokersOfAccountingIssue(
    orgId: string,
    summary: string,
    links: { transactionId?: string; leaseId?: string }
  ) {
    const brokers = await this.prisma.user.findMany({
      where: { organizationId: orgId, role: UserRole.BROKER },
      select: { id: true, email: true, firstName: true, lastName: true }
    });
    if (!brokers.length) {
      return;
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true }
    });
    const financialsLink = `${this.dashboardBaseUrl.replace(/\/+$/, '')}/financials`;

    await Promise.all(
      brokers.map(async (broker) => {
        await this.notifications.createNotification({
          organizationId: orgId,
          userId: broker.id,
          type: NotificationType.ACCOUNTING,
          title: 'Accounting sync error',
          message: summary,
          transactionId: links.transactionId,
          leaseId: links.leaseId
        });
        const shouldEmail = await this.notifications.shouldSendEmail(orgId, broker.id, NotificationType.ACCOUNTING);
        if (shouldEmail && broker.email) {
          const template = accountingSyncErrorEmail({
            brokerName: [broker.firstName, broker.lastName].filter(Boolean).join(' ') || undefined,
            orgName: organization?.name ?? 'Hatch',
            errorSummary: summary,
            financialsLink
          });
          await this.mail.sendMail({ to: broker.email, subject: template.subject, text: template.text, html: template.html });
        }
      })
    );

    void this.playbooks
      .runTrigger(orgId, PlaybookTriggerType.ACCOUNTING_SYNC_FAILED, {
        summary,
        transactionId: links.transactionId,
        leaseId: links.leaseId
      })
      .catch(() => undefined);
  }

  async connectAccounting(orgId: string, brokerUserId: string, dto: ConnectAccountingDto) {
    await this.assertBroker(brokerUserId, orgId);
    const provider = dto.provider as AccountingProvider;
    const config = await this.prisma.accountingIntegrationConfig.upsert({
      where: { organizationId: orgId },
      create: {
        organizationId: orgId,
        provider,
        realmId: dto.realmId,
        connectedAt: new Date()
      },
      update: {
        provider,
        realmId: dto.realmId,
        connectedAt: new Date()
      }
    });

    await this.orgEvents.logOrgEvent({
      organizationId: orgId,
      actorId: brokerUserId,
      type: OrgEventType.ORG_ACCOUNTING_CONNECTED,
      payload: { provider, realmId: dto.realmId }
    });

    return config;
  }

  async syncTransactionToAccounting(orgId: string, brokerUserId: string, transactionId: string) {
    await this.assertBroker(brokerUserId, orgId);
    const transaction = await this.prisma.orgTransaction.findUnique({
      where: { id: transactionId },
      include: {
        listing: {
          select: { listPrice: true, addressLine1: true, city: true, state: true }
        }
      }
    });
    if (!transaction || transaction.organizationId !== orgId) {
      throw new NotFoundException('Transaction not found');
    }

    if (this.isDemoOrg(orgId)) {
      this.logger.log(`Demo mode: ignoring accounting sync for transaction ${transactionId}`);
      return this.prisma.transactionAccountingRecord.findUnique({ where: { transactionId } });
    }

    const config = await this.ensureConfig(orgId);
    const payload = {
      id: transaction.id,
      status: transaction.status,
      closingDate: transaction.closingDate ?? null,
      buyerName: transaction.buyerName ?? null,
      sellerName: transaction.sellerName ?? null,
      amount: transaction.listing?.listPrice ?? null,
      listingAddress: transaction.listing
        ? `${transaction.listing.addressLine1}, ${transaction.listing.city}, ${transaction.listing.state}`
        : null
    };

    const result = await this.integration.sendToAccounting({
      orgId,
      provider: config.provider,
      realmId: config.realmId,
      type: 'TRANSACTION',
      data: payload
    });

    const syncStatus = result.success ? AccountingSyncStatus.SYNCED : AccountingSyncStatus.FAILED;
    const record = await this.prisma.transactionAccountingRecord.upsert({
      where: { transactionId },
      create: {
        organizationId: orgId,
        transactionId,
        provider: config.provider,
        externalId: result.externalId ?? null,
        syncStatus,
        lastSyncAt: new Date(),
        errorMessage: result.errorMessage ?? null
      },
      update: {
        provider: config.provider,
        externalId: result.externalId ?? null,
        syncStatus,
        lastSyncAt: new Date(),
        errorMessage: result.errorMessage ?? null
      }
    });

    await this.orgEvents.logOrgEvent({
      organizationId: orgId,
      actorId: brokerUserId,
      type: OrgEventType.ORG_ACCOUNTING_TRANSACTION_SYNCED,
      payload: {
        transactionId,
        syncStatus,
        externalId: record.externalId
      }
    });

    await this.audit.log({
      organizationId: orgId,
      userId: brokerUserId,
      actionType: 'ACCOUNTING_SYNC_TRIGGERED',
      summary: `Transaction ${transactionId} accounting sync ${syncStatus.toLowerCase()}`,
      metadata: {
        transactionId,
        syncStatus,
        externalId: record.externalId
      }
    });

    if (syncStatus === AccountingSyncStatus.FAILED) {
      await this.alertBrokersOfAccountingIssue(
        orgId,
        result.errorMessage ?? 'A transaction failed to sync with accounting.',
        { transactionId }
      );
    }

    return record;
  }

  async syncRentalLeaseToAccounting(orgId: string, brokerUserId: string, leaseId: string) {
    await this.assertBroker(brokerUserId, orgId);
    const lease = await this.prisma.rentalLease.findUnique({
      where: { id: leaseId },
      include: {
        unit: {
          include: {
            property: {
              select: { addressLine1: true, city: true, state: true }
            }
          }
        }
      }
    });
    if (!lease || lease.organizationId !== orgId) {
      throw new NotFoundException('Rental lease not found');
    }

    if (this.isDemoOrg(orgId)) {
      this.logger.log(`Demo mode: ignoring accounting sync for lease ${leaseId}`);
      return this.prisma.rentalLeaseAccountingRecord.findUnique({ where: { leaseId } });
    }

    const config = await this.ensureConfig(orgId);
    const payload = {
      id: lease.id,
      tenantName: lease.tenantName,
      startDate: lease.startDate,
      endDate: lease.endDate,
      rentAmount: lease.rentAmount ?? null,
      requiresTaxFiling: lease.requiresTaxFiling,
      unit: lease.unit?.name ?? null,
      propertyAddress: lease.unit?.property
        ? `${lease.unit.property.addressLine1}, ${lease.unit.property.city}, ${lease.unit.property.state}`
        : null
    };

    const result = await this.integration.sendToAccounting({
      orgId,
      provider: config.provider,
      realmId: config.realmId,
      type: 'RENTAL_LEASE',
      data: payload
    });

    const syncStatus = result.success ? AccountingSyncStatus.SYNCED : AccountingSyncStatus.FAILED;
    const record = await this.prisma.rentalLeaseAccountingRecord.upsert({
      where: { leaseId },
      create: {
        organizationId: orgId,
        leaseId,
        provider: config.provider,
        externalId: result.externalId ?? null,
        syncStatus,
        lastSyncAt: new Date(),
        errorMessage: result.errorMessage ?? null
      },
      update: {
        provider: config.provider,
        externalId: result.externalId ?? null,
        syncStatus,
        lastSyncAt: new Date(),
        errorMessage: result.errorMessage ?? null
      }
    });

    await this.orgEvents.logOrgEvent({
      organizationId: orgId,
      actorId: brokerUserId,
      type: OrgEventType.ORG_ACCOUNTING_RENTAL_SYNCED,
      payload: {
        leaseId,
        syncStatus,
        externalId: record.externalId
      }
    });

    await this.audit.log({
      organizationId: orgId,
      userId: brokerUserId,
      actionType: 'ACCOUNTING_SYNC_TRIGGERED',
      summary: `Rental lease ${leaseId} accounting sync ${syncStatus.toLowerCase()}`,
      metadata: {
        leaseId,
        syncStatus,
        externalId: record.externalId
      }
    });

    if (syncStatus === AccountingSyncStatus.FAILED) {
      await this.alertBrokersOfAccountingIssue(
        orgId,
        result.errorMessage ?? 'A rental lease failed to sync with accounting.',
        { leaseId }
      );
    }

    return record;
  }

  async listSyncStatusForOrg(orgId: string, brokerUserId: string) {
    await this.assertBroker(brokerUserId, orgId);
    const [config, transactions, rentalLeases] = await Promise.all([
      this.prisma.accountingIntegrationConfig.findUnique({ where: { organizationId: orgId } }),
      this.prisma.transactionAccountingRecord.findMany({
        where: { organizationId: orgId },
        include: {
          transaction: {
            select: {
              id: true,
              status: true,
              closingDate: true,
              listing: {
                select: {
                  addressLine1: true,
                  city: true,
                  state: true,
                  listPrice: true
                }
              }
            }
          }
        },
        orderBy: { updatedAt: 'desc' }
      }),
      this.prisma.rentalLeaseAccountingRecord.findMany({
        where: { organizationId: orgId },
        include: {
          lease: {
            select: {
              id: true,
              startDate: true,
              endDate: true,
              rentAmount: true,
              tenantName: true,
              unit: {
                select: {
                  name: true,
                  property: {
                    select: {
                      addressLine1: true,
                      city: true,
                      state: true
                    }
                  }
                }
              }
            }
          }
        },
        orderBy: { updatedAt: 'desc' }
      })
    ]);

    return {
      config,
      transactions,
      rentalLeases
    };
  }
}
