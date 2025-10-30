import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { AccountsController } from '../modules/accounts/accounts.controller';
import { AccountsService } from '../modules/accounts/accounts.service';

import { OpportunitiesController } from '../modules/opportunities/opportunities.controller';
import { OpportunitiesService } from '../modules/opportunities/opportunities.service';

import { CasesController } from '../modules/cases/cases.controller';
import { CasesService } from '../modules/cases/cases.service';

import { FilesController } from '../modules/files/files.controller';
import { FilesService } from '../modules/files/files.service';

import { ReportingController } from '../modules/reporting/reporting.controller';
import { ReportingService } from '../modules/reporting/reporting.service';

import { LeadsController } from '../modules/leads/leads.controller';
import { LeadsService } from '../modules/leads/leads.service';

import { ContactsController } from '../modules/contacts/contacts.controller';
import { ContactsService } from '../modules/contacts/contacts.service';

import { DealDeskController } from '../modules/deal-desk/deal-desk.controller';
import { DealDeskService } from '../modules/deal-desk/deal-desk.service';

import { CommissionPlansController } from '../modules/commission-plans/commission-plans.controller';
import { CommissionPlansService } from '../modules/commission-plans/commission-plans.service';

import { PayoutsController } from '../modules/payouts/payouts.controller';
import { PayoutsService } from '../modules/payouts/payouts.service';

import { ListingsController as LegacyListingsController } from '../modules/listings/listings.controller';
import { ListingsService as LegacyListingsService } from '../modules/listings/listings.service';

import { ListingsController as ReListingsController } from '../modules/re/listings/listings.controller';
import { ListingsService as ReListingsService } from '../modules/re/listings/listings.service';

import { OffersController } from '../modules/re/offers/offers.controller';
import { OffersService } from '../modules/re/offers/offers.service';

import { TransactionsController } from '../modules/re/transactions/transactions.controller';
import { TransactionsService } from '../modules/re/transactions/transactions.service';

import { AdminRulesController } from '../modules/rules/admin.rules.controller';
import { RulesService } from '../modules/rules/rules.service';

import { MessagesController } from '../modules/messages/messages.controller';
import { MessagesService } from '../modules/messages/messages.service';

import { ToursController } from '../modules/tours/tours.controller';
import { ToursService } from '../modules/tours/tours.service';

import { MlsController } from '../modules/mls/mls.controller';
import { MlsService } from '../modules/mls/mls.service';

import { RoutingController } from '../modules/routing/routing.controller';
import { RoutingService } from '../modules/routing/routing.service';

import { JourneysController } from '../modules/journeys/journeys.controller';
import { JourneysService } from '../modules/journeys/journeys.service';

import { WebhooksController } from '../modules/webhooks/webhooks.controller';
import { OutboxService } from '../modules/outbox/outbox.service';

import { DashboardsController } from '../modules/dashboards/dashboards.controller';
import { DashboardsService } from '../modules/dashboards/dashboards.service';

import {
  StubPrismaService,
  StubFlsService,
  StubCanService,
  StubAuditService,
  StubAuditInterceptor,
  StubConfigService,
  StubTokensService,
  StubStorageAdapter,
  StubOutboxService,
  createAsyncServiceStub
} from './docs-stubs';

import { PrismaService } from '../modules/prisma/prisma.service';
import { FlsService } from '../platform/security/fls.service';
import { CanService } from '../platform/security/can.service';
import { AuditService } from '../platform/audit/audit.service';
import { AuditInterceptor } from '../platform/audit/audit.interceptor';
import { TokensService } from '../platform/auth/tokens.service';

const FILES_ADAPTER_TOKEN = 'FILES_STORAGE_ADAPTER';

@Module({
  controllers: [
    AccountsController,
    OpportunitiesController,
    CasesController,
    FilesController,
    ReportingController,
    LeadsController,
    ContactsController,
    DealDeskController,
    CommissionPlansController,
    PayoutsController,
    LegacyListingsController,
    ReListingsController,
    OffersController,
    TransactionsController,
    AdminRulesController,
    MessagesController,
    ToursController,
    MlsController,
    RoutingController,
    JourneysController,
    WebhooksController,
    DashboardsController
  ],
  providers: [
    { provide: AccountsService, useValue: createAsyncServiceStub<AccountsService>({
      list: async () => [],
      get: async () => ({}),
      create: async () => ({}),
      update: async () => ({}),
      softDelete: async () => ({})
    }) },
    { provide: OpportunitiesService, useValue: createAsyncServiceStub<OpportunitiesService>({
      list: async () => [],
      get: async () => ({}),
      create: async () => ({}),
      update: async () => ({}),
      softDelete: async () => ({})
    }) },
    { provide: CasesService, useValue: createAsyncServiceStub<CasesService>({
      list: async () => ({ items: [], nextCursor: null }),
      get: async () => ({}),
      create: async () => ({}),
      update: async () => ({}),
      remove: async () => ({})
    }) },
    { provide: FilesService, useValue: createAsyncServiceStub<FilesService>({
      createUploadUrl: async () => ({
        fileId: 'stub',
        storageKey: 'stub/key',
        uploadUrl: 'https://example/upload',
        metadata: {}
      }),
      link: async () => ({}),
      listForRecord: async () => [],
      softDelete: async () => ({})
    }) },
    { provide: ReportingService, useValue: createAsyncServiceStub<ReportingService>({
      series: async () => [],
      recompute: async () => ({ keys: [], range: { from: new Date().toISOString(), to: new Date().toISOString() } })
    }) },
    { provide: LeadsService, useValue: createAsyncServiceStub<LeadsService>({
      list: async () => ({ items: [], nextCursor: null }),
      create: async () => ({}),
      getById: async () => ({}),
      update: async () => ({}),
      addNote: async () => ({}),
      addTask: async () => ({}),
      recordTouchpoint: async () => ({}),
      updateTask: async () => ({}),
      identify: async () => ({})
    }) },
    { provide: ContactsService, useValue: createAsyncServiceStub<ContactsService>({
      list: async () => ({ items: [], nextCursor: null }),
      create: async () => ({}),
      listViews: async () => [],
      saveView: async () => ({}),
      deleteView: async () => undefined,
      getById: async () => ({}),
      update: async () => ({}),
      remove: async () => undefined,
      restore: async () => ({}),
      assignOwner: async () => ({})
    }) },
    { provide: DealDeskService, useValue: createAsyncServiceStub<DealDeskService>({
      create: async () => ({}),
      list: async () => [],
      approve: async () => ({}),
      reject: async () => ({})
    }) },
    { provide: CommissionPlansService, useValue: createAsyncServiceStub<CommissionPlansService>({
      list: async () => [],
      get: async () => ({}),
      create: async () => ({}),
      update: async () => ({})
    }) },
    { provide: PayoutsService, useValue: createAsyncServiceStub<PayoutsService>({
      list: async () => [],
      generateForOpportunity: async () => [],
      markPaid: async () => ({})
    }) },
    { provide: LegacyListingsService, useValue: createAsyncServiceStub<LegacyListingsService>({
      list: async () => [],
      promote: async () => ({})
    }) },
    { provide: ReListingsService, useValue: createAsyncServiceStub<ReListingsService>({
      get: async () => ({}),
      updateStatus: async () => ({})
    }) },
    { provide: OffersService, useValue: createAsyncServiceStub<OffersService>({
      create: async () => ({}),
      list: async () => [],
      decide: async () => ({})
    }) },
    { provide: TransactionsService, useValue: createAsyncServiceStub<TransactionsService>({
      get: async () => ({}),
      updateMilestone: async () => ({}),
      computeCommission: async () => ({}),
      generatePayouts: async () => []
    }) },
    { provide: RulesService, useValue: createAsyncServiceStub<RulesService>({
      listValidation: async () => [],
      createValidationRule: async () => ({}),
      updateValidationRule: async () => ({}),
      deleteValidationRule: async () => ({ id: 'deleted' }),
      listAssignment: async () => [],
      createAssignmentRule: async () => ({}),
      updateAssignmentRule: async () => ({}),
      deleteAssignmentRule: async () => ({ id: 'deleted' })
    }) },
    { provide: MessagesService, useValue: createAsyncServiceStub<MessagesService>({
      sendSms: async () => ({}),
      sendEmail: async () => ({}),
      ingestInbound: async () => ({})
    }) },
    { provide: ToursService, useValue: createAsyncServiceStub<ToursService>({
      requestTour: async () => ({}),
      markKept: async () => ({})
    }) },
    { provide: MlsService, useValue: createAsyncServiceStub<MlsService>({
      preflight: async () => ({ status: 'ok' }),
      recordClearCooperation: async () => ({ status: 'recorded' }),
      listProfiles: async () => [],
      getDashboard: async () => []
    }) },
    { provide: RoutingService, useValue: createAsyncServiceStub<RoutingService>({
      listRules: async () => [],
      createRule: async () => ({}),
      updateRule: async () => ({}),
      deleteRule: async () => undefined,
      getCapacityView: async () => ({}),
      listRouteEvents: async () => ({ items: [], nextCursor: null }),
      getSlaDashboard: async () => ({}),
      processSlaTimers: async () => ({ processed: 0 }),
      getMetrics: async () => ({})
    }) },
    { provide: JourneysService, useValue: createAsyncServiceStub<JourneysService>({
      simulate: async () => ({ status: 'simulated' })
    }) },
    { provide: DashboardsService, useValue: createAsyncServiceStub<DashboardsService>({
      brokerSummary: async () => ({})
    }) },

    { provide: PrismaService, useClass: StubPrismaService },
    { provide: FlsService, useClass: StubFlsService },
    { provide: CanService, useClass: StubCanService },
    { provide: AuditService, useClass: StubAuditService },
    { provide: ConfigService, useClass: StubConfigService },
    { provide: TokensService, useClass: StubTokensService },
    { provide: AuditInterceptor, useClass: StubAuditInterceptor },
    { provide: APP_INTERCEPTOR, useExisting: AuditInterceptor },
    { provide: FILES_ADAPTER_TOKEN, useClass: StubStorageAdapter },
    { provide: OutboxService, useClass: StubOutboxService }
  ]
})
export class DocsAppModule {}
