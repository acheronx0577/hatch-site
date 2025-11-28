import { Injectable, ForbiddenException } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationType,
  Prisma
} from '@hatch/db';

import { PrismaService } from '@/modules/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { UpdateNotificationPreferencesDto } from './dto/update-preferences.dto';

const TYPE_PREF_FIELD: Record<NotificationType, keyof Prisma.NotificationPreferenceUncheckedUpdateInput | null> = {
  [NotificationType.GENERIC]: null,
  [NotificationType.LEAD]: 'leadNotificationsEnabled',
  [NotificationType.OFFER_INTENT]: 'offerIntentNotificationsEnabled',
  [NotificationType.LISTING]: null,
  [NotificationType.TRANSACTION]: null,
  [NotificationType.RENTAL]: 'rentalNotificationsEnabled',
  [NotificationType.COMPLIANCE]: 'aiNotificationsEnabled',
  [NotificationType.ACCOUNTING]: 'accountingNotificationsEnabled',
  [NotificationType.AI]: 'aiNotificationsEnabled'
};

export type CreateNotificationParams = {
  organizationId: string;
  userId?: string | null;
  type?: NotificationType;
  channel?: NotificationChannel;
  title: string;
  message?: string | null;
  leadId?: string | null;
  offerIntentId?: string | null;
  listingId?: string | null;
  transactionId?: string | null;
  leaseId?: string | null;
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  private isMissingSchemaError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2021' || error.code === 'P2022' || error.code === '42P01')
    );
  }

  async createNotification(params: CreateNotificationParams) {
    const {
      organizationId,
      userId,
      type = NotificationType.GENERIC,
      channel = NotificationChannel.IN_APP,
      title,
      message,
      ...rest
    } = params;

    if (userId) {
      const prefs = await this.getOrCreatePreferences(organizationId, userId);
      if (!prefs.inAppEnabled) {
        return null;
      }
      const prefField = TYPE_PREF_FIELD[type];
      if (prefField && prefs[prefField] === false) {
        return null;
      }
    }

    try {
      return await this.prisma.notification.create({
        data: {
          organizationId,
          userId: userId ?? null,
          type,
          channel,
          title,
          message: message ?? null,
          ...rest
        }
      });
    } catch (error) {
      if (this.isMissingSchemaError(error)) {
        return null;
      }
      throw error;
    }
  }

  async listForUser(orgId: string, userId: string, limit = 20, cursor?: string) {
    try {
      return await this.prisma.notification.findMany({
        where: { organizationId: orgId, userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined
      });
    } catch (error) {
      if (this.isMissingSchemaError(error)) {
        return [];
      }
      throw error;
    }
  }

  async markAsRead(notificationId: string, userId: string) {
    try {
      const notification = await this.prisma.notification.findUnique({ where: { id: notificationId } });
      if (!notification || notification.userId !== userId) {
        throw new ForbiddenException('Cannot update this notification');
      }
      return this.prisma.notification.update({
        where: { id: notificationId },
        data: { isRead: true, readAt: new Date() }
      });
    } catch (error) {
      if (this.isMissingSchemaError(error)) {
        return { success: true };
      }
      throw error;
    }
  }

  async markAllAsRead(orgId: string, userId: string) {
    try {
      await this.prisma.notification.updateMany({
        where: { organizationId: orgId, userId, isRead: false },
        data: { isRead: true, readAt: new Date() }
      });
    } catch (error) {
      if (!this.isMissingSchemaError(error)) {
        throw error;
      }
    }
    return { success: true };
  }

  async getOrCreatePreferences(orgId: string, userId: string) {
    try {
      let prefs = await this.prisma.notificationPreference.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId } }
      });
      if (!prefs) {
        prefs = await this.prisma.notificationPreference.create({
          data: { organizationId: orgId, userId }
        });
      }
      return prefs;
    } catch (error) {
      if (this.isMissingSchemaError(error)) {
        // Return permissive defaults when prefs table is absent in a reset DB.
        return {
          organizationId: orgId,
          userId,
          inAppEnabled: true,
          emailEnabled: false,
          leadNotificationsEnabled: true,
          offerIntentNotificationsEnabled: true,
          rentalNotificationsEnabled: true,
          accountingNotificationsEnabled: true,
          aiNotificationsEnabled: true
        } as any;
      }
      throw error;
    }
  }

  async updatePreferences(orgId: string, userId: string, dto: UpdateNotificationPreferencesDto) {
    await this.getOrCreatePreferences(orgId, userId);
    const updated = await this.prisma.notificationPreference.update({
      where: { organizationId_userId: { organizationId: orgId, userId } },
      data: {
        inAppEnabled: dto.inAppEnabled ?? undefined,
        emailEnabled: dto.emailEnabled ?? undefined,
        leadNotificationsEnabled: dto.leadNotificationsEnabled ?? undefined,
        offerIntentNotificationsEnabled: dto.offerIntentNotificationsEnabled ?? undefined,
        rentalNotificationsEnabled: dto.rentalNotificationsEnabled ?? undefined,
        accountingNotificationsEnabled: dto.accountingNotificationsEnabled ?? undefined,
        aiNotificationsEnabled: dto.aiNotificationsEnabled ?? undefined
      }
    });

    await this.audit.log({
      organizationId: orgId,
      userId,
      actionType: 'NOTIFICATION_PREFS_UPDATED',
      summary: `Notification preferences updated for user ${userId}`,
      metadata: dto
    });

    return updated;
  }

  async shouldSendEmail(orgId: string, userId: string, type: NotificationType) {
    const prefs = await this.getOrCreatePreferences(orgId, userId);
    if (!prefs.emailEnabled) {
      return false;
    }
    const prefField = TYPE_PREF_FIELD[type];
    if (!prefField) {
      return true;
    }
    return (prefs as any)[prefField] !== false;
  }
}
