import { ExecutionContext, Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { PlatformModule } from './platform/platform.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { ConsentsModule } from './modules/consents/consents.module';
import { MessagesModule } from './modules/messages/messages.module';
import { EmailModule } from './modules/email/email.module';
import { ToursModule } from './modules/tours/tours.module';
import { AgreementsModule } from './modules/agreements/agreements.module';
import { RoutingModule } from './modules/routing/routing.module';
import { MlsModule } from './modules/mls/mls.module';
import { DashboardsModule } from './modules/dashboards/dashboards.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { JourneysModule } from './modules/journeys/journeys.module';
import { ListingsModule } from './modules/listings/listings.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { TeamModule } from './modules/team/team.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { CommissionPlansModule } from './modules/commission-plans/commission-plans.module';
import { DealDeskModule } from './modules/deal-desk/deal-desk.module';
import { PayoutsModule } from './modules/payouts/payouts.module';
import { CdaModule } from './modules/cda/cda.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { FeatureFlagsModule } from './modules/feature-flags/feature-flags.module';
import { PipelinesModule } from './modules/pipelines/pipelines.module';
import { LeadsModule } from './modules/leads/leads.module';
import { SessionModule } from './modules/session/session.module';
import { ConsumerModule } from './modules/consumer/consumer.module';
import { ConsumerPortalModule } from './modules/consumer-portal/consumer-portal.module';
import { DraftsModule } from './modules/drafts/drafts.module';
import { OpportunitiesModule } from './modules/opportunities/opportunities.module';
import { FilesModule } from './modules/files/files.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { OffersModule } from './modules/re/offers/offers.module';
import { TransactionsModule } from './modules/re/transactions/transactions.module';
import { DealsModule } from './modules/deals/deals.module';
import { ReListingsModule } from './modules/re/listings/listings.module';
import { bootstrapObjectRegistry } from './platform/security/object-registry.bootstrap';
import { CasesModule } from './modules/cases/cases.module';
import { RulesModule } from './modules/rules/rules.module';
import { SearchModule } from './modules/search/search.module';
import { LayoutsModule } from './modules/layouts/layouts.module';
import { ViewsModule } from './modules/views/views.module';
import { AuditModule } from './modules/audit/audit.module';
import { ReadModelsModule } from './modules/read-models/read-models.module';
import { AiModule } from './modules/ai/ai.module';
import { AiBrokerModule } from './modules/ai-broker/ai-broker.module';
import { AiCopilotModule } from './modules/ai-copilot/ai-copilot.module';
import { MarketingModule } from './modules/marketing/marketing.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { OutreachModule } from './modules/outreach/outreach.module';
import { InsightsModule } from './modules/insights/insights.module';
import { SmsModule } from './modules/sms/sms.module';
import { AiEmployeesModule } from './modules/ai-employees/ai-employees.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrgMlsModule } from './modules/org-mls/org-mls.module';
import { MissionControlModule } from './modules/mission-control/mission-control.module';
import { OrgListingsModule } from './modules/org-listings/org-listings.module';
import { OrgTransactionsModule } from './modules/org-transactions/org-transactions.module';
import { JwtStrategy } from './auth/jwt.strategy';
import { BatchModule } from './modules/batch/batch.module';
import { PlaybooksModule } from './modules/playbooks/playbooks.module';
import { PresenceModule } from './gateways/presence/presence.module';
import { TimelineModule } from './modules/timelines/timeline.module';
import { ChatModule } from './modules/chat/chat.module';
import { DocumentsCollabModule } from './modules/documents-collab/documents-collab.module';
import { AgentPerformanceModule } from './modules/agent-performance/agent-performance.module';
import { TransactionCoordinatorModule } from './modules/transaction-coordinator/transaction-coordinator.module';
import { DripCampaignsModule } from './modules/drip-campaigns/drip-campaigns.module';
import { LeadScoringModule } from './modules/lead-scoring/lead-scoring.module';
import { RevenueForecastModule } from './modules/revenue-forecast/revenue-forecast.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { QuickBooksModule } from './modules/integrations/quickbooks/quickbooks.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { OrgLoisModule } from './modules/org-lois/org-lois.module';
import { AgentProfilesModule } from './modules/agent-profiles/agent-profiles.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { AgentInvitesModule } from './modules/agent-invites/agent-invites.module';

const isProd = (process.env.NODE_ENV ?? 'development') === 'production';
const throttlerEnabled =
  (process.env.THROTTLER_ENABLED ?? (isProd ? 'true' : 'false')).toLowerCase() === 'true';
const throttlerLimit = Number(process.env.THROTTLER_LIMIT ?? (isProd ? 30 : 200));
const throttlerTtl = Number(process.env.THROTTLER_TTL_MS ?? 60_000);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env', 'apps/api/.env.local', 'apps/api/.env'],
      load: [() => ({
        app: {
          host: process.env.API_HOST ?? '0.0.0.0',
          port: Number(process.env.API_PORT ?? 4000)
        },
        database: {
          url: process.env.DATABASE_URL
        },
        redis: {
          url: process.env.REDIS_URL ?? 'redis://localhost:6379'
        },
        webhook: {
          secret: process.env.API_WEBHOOK_SECRET ?? 'set-me'
        },
        outbox: {
          maxAttempts: Number(process.env.OUTBOX_MAX_ATTEMPTS ?? 5)
        },
        attachments: {
          tokenSecret: process.env.ATTACHMENT_TOKEN_SECRET ?? 'change-me',
          tokenTtlMs: Number(process.env.ATTACHMENT_TOKEN_TTL_MS ?? 15 * 60 * 1000),
          maxSizeBytes: Number(process.env.ATTACHMENT_MAX_SIZE_BYTES ?? 10 * 1024 * 1024),
          allowedMimeTypes:
            process.env.ATTACHMENT_ALLOWED_MIME_TYPES ?? 'image/png,image/jpeg,image/gif,application/pdf,text/plain'
        },
        features: {
          dealDeskCommission:
            (process.env.FEATURE_DEAL_DESK_COMMISSION ?? 'false').toLowerCase() === 'true'
        }
      })]
    }),
    EventEmitterModule.forRoot(),
    BullModule.forRoot({
      connection: process.env.REDIS_URL
        ? { url: process.env.REDIS_URL }
        : {
            host: process.env.REDIS_HOST ?? '127.0.0.1',
            port: Number(process.env.REDIS_PORT ?? 6379)
          }
    }),
    ThrottlerModule.forRoot([
      {
        ttl: throttlerTtl,
        limit: throttlerLimit,
        skipIf: () => !throttlerEnabled,
        generateKey: (context: ExecutionContext, suffix?: string) => {
          const request = context.switchToHttp().getRequest();
          const tenant = (request?.headers?.['x-tenant-id'] as string | undefined) ?? 'no-tenant';
          const user = (request?.headers?.['x-user-id'] as string | undefined) ?? 'anon';
          return `throttle:${tenant}:${user}:${suffix ?? 'global'}`;
        }
      }
    ]),
    PlatformModule,
    PrismaModule,
    FeatureFlagsModule,
    HealthModule,
    AccountsModule,
    ContactsModule,
    ConsentsModule,
    MessagesModule,
    EmailModule,
    OutreachModule,
    ToursModule,
    AgreementsModule,
    RoutingModule,
    MlsModule,
    DashboardsModule,
    WebhooksModule,
    JourneysModule,
    ListingsModule,
    CalendarModule,
    TeamModule,
    ConversationsModule,
    ComplianceModule,
    CommissionPlansModule,
    DealDeskModule,
    PayoutsModule,
    CdaModule,
    ReportingModule,
    OpportunitiesModule,
    FilesModule,
    OffersModule,
    TransactionsModule,
    DealsModule,
    ReListingsModule,
    ContractsModule,
    PipelinesModule,
    LeadsModule,
    SessionModule,
    ConsumerModule,
    ConsumerPortalModule,
    DraftsModule,
    CasesModule,
    RulesModule,
    SearchModule,
    LayoutsModule,
    ViewsModule,
    AuditModule,
    ReadModelsModule,
    AiModule,
    AiBrokerModule,
    AiCopilotModule,
    MarketingModule,
    SmsModule,
    AiEmployeesModule,
    AnalyticsModule,
    InsightsModule,
    PlaybooksModule,
    PresenceModule,
    TimelineModule,
    ChatModule,
    DocumentsCollabModule,
    AgentPerformanceModule,
    TransactionCoordinatorModule,
    DripCampaignsModule,
    LeadScoringModule,
    RevenueForecastModule,
    BatchModule,
    IngestionModule,
    NotificationsModule,
    OrgMlsModule,
    OrgLoisModule,
    MissionControlModule,
    OrgListingsModule,
    OrgTransactionsModule,
    QuickBooksModule,
    AccountingModule,
    AgentProfilesModule,
    OrganizationsModule,
    AgentInvitesModule
  ],
  controllers: [],
  providers: [
    JwtStrategy,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard
    }
  ]
})
export class AppModule implements OnModuleInit {
  onModuleInit() {
    bootstrapObjectRegistry();
  }
}
