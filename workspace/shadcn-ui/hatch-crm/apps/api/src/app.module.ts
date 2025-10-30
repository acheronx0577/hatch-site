import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { PlatformModule } from './platform/platform.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { ConsentsModule } from './modules/consents/consents.module';
import { MessagesModule } from './modules/messages/messages.module';
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
import { DraftsModule } from './modules/drafts/drafts.module';
import { OpportunitiesModule } from './modules/opportunities/opportunities.module';
import { FilesModule } from './modules/files/files.module';
import { OffersModule } from './modules/re/offers/offers.module';
import { TransactionsModule } from './modules/re/transactions/transactions.module';
import { ReListingsModule } from './modules/re/listings/listings.module';
import { bootstrapObjectRegistry } from './platform/security/object-registry.bootstrap';
import { CasesModule } from './modules/cases/cases.module';
import { RulesModule } from './modules/rules/rules.module';
import { SearchModule } from './modules/search/search.module';
import { LayoutsModule } from './modules/layouts/layouts.module';
import { AuditModule } from './modules/audit/audit.module';

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
    PlatformModule,
    PrismaModule,
    FeatureFlagsModule,
    HealthModule,
    AccountsModule,
    ContactsModule,
    ConsentsModule,
    MessagesModule,
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
    ReListingsModule,
    PipelinesModule,
    LeadsModule,
    SessionModule,
    ConsumerModule,
    DraftsModule,
    CasesModule,
    RulesModule,
    SearchModule,
    LayoutsModule,
    AuditModule
  ],
  controllers: [],
  providers: []
})
export class AppModule implements OnModuleInit {
  onModuleInit() {
    bootstrapObjectRegistry();
  }
}
