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
import { SearchController } from '../modules/search/search.controller';
import { SearchService } from '../modules/search/search.service';
import { LayoutsController } from '../modules/layouts/layouts.controller';
import { LayoutsService } from '../modules/layouts/layouts.service';
import { AuditController } from '../modules/audit/audit.controller';
import { AuditLogService } from '../modules/audit/audit.service';

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

const CORE_CONTROLLERS = [
  AccountsController,
  OpportunitiesController,
  CasesController,
  FilesController,
  ReportingController,
  LeadsController,
  ContactsController
];

const REVENUE_OPS_CONTROLLERS = [
  DealDeskController,
  CommissionPlansController,
  PayoutsController
];

const RE_CONTROLLERS = [
  LegacyListingsController,
  ReListingsController,
  OffersController,
  TransactionsController,
  ToursController,
  MlsController
];

const PLATFORM_AUTOMATION_CONTROLLERS = [
  AdminRulesController,
  MessagesController,
  RoutingController,
  JourneysController,
  WebhooksController
];

const DASHBOARD_CONTROLLERS = [DashboardsController];
const SEARCH_CONTROLLERS = [SearchController];
const ADMIN_LAYOUT_CONTROLLERS = [LayoutsController];
const ADMIN_AUDIT_CONTROLLERS = [AuditController];

@Module({
  controllers: [
    ...CORE_CONTROLLERS,
    ...REVENUE_OPS_CONTROLLERS,
    ...RE_CONTROLLERS,
    ...PLATFORM_AUTOMATION_CONTROLLERS,
    ...DASHBOARD_CONTROLLERS,
    ...SEARCH_CONTROLLERS,
    ...ADMIN_LAYOUT_CONTROLLERS,
    ...ADMIN_AUDIT_CONTROLLERS
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
    { provide: LayoutsService, useValue: createAsyncServiceStub<LayoutsService>({
      upsert: async () => ({ object: 'accounts', kind: 'detail', fields: [] }),
      resolve: async () => ({ object: 'accounts', kind: 'detail', fields: [] })
    }) },
    { provide: AuditLogService, useValue: createAsyncServiceStub<AuditLogService>({
      list: async () => ({ items: [], nextCursor: null })
    }) },
    { provide: DealDeskService, useValue: createAsyncServiceStub<DealDeskService>({
      create: async () => ({}),
      list: async () => ({ items: [], nextCursor: null }),
      approve: async () => ({}),
      reject: async () => ({})
    }) },
    { provide: CommissionPlansService, useValue: createAsyncServiceStub<CommissionPlansService>({
      list: async () => ({ items: [], nextCursor: null }),
      get: async () => ({}),
      create: async () => ({}),
      update: async () => ({})
    }) },
    { provide: PayoutsService, useValue: createAsyncServiceStub<PayoutsService>({
      list: async () => ({ items: [], nextCursor: null }),
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
      list: async () => ({ items: [], nextCursor: null }),
      decide: async () => ({})
    }) },
    { provide: TransactionsService, useValue: createAsyncServiceStub<TransactionsService>({
      get: async () => ({}),
      updateMilestone: async () => ({}),
      computeCommission: async () => ({}),
      generatePayouts: async () => []
    }) },
    { provide: RulesService, useValue: createAsyncServiceStub<RulesService>({
      listValidation: async () => ({ items: [], nextCursor: null }),
      createValidationRule: async () => ({}),
      updateValidationRule: async () => ({}),
      deleteValidationRule: async () => ({ id: 'deleted' }),
      listAssignment: async () => ({ items: [], nextCursor: null }),
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
      requestTour: async () => ({ tourId: 'tour', status: 'REQUESTED', assignedAgent: null, routingResult: null }),
      markKept: async () => ({ tourId: 'tour', status: 'KEPT' })
    }) },
    { provide: MlsService, useValue: createAsyncServiceStub<MlsService>({
      preflight: async () => ({ status: 'ok' }),
      recordClearCooperation: async () => ({
        timer: {
          id: 'timer-1',
          tenantId: 'tenant-1',
          listingId: null,
          status: 'GREEN',
          startedAt: new Date(),
          deadlineAt: new Date(),
          lastEventAt: new Date()
        },
        risk: { status: 'GREEN', hoursElapsed: 0, hoursRemaining: 4 }
      }),
      listProfiles: async () => ([
        {
          id: 'profile-1',
          tenantId: 'tenant-1',
          name: 'Sample MLS',
          disclaimerText: null,
          compensationDisplayRule: null,
          clearCooperationRequired: true,
          slaHours: 24,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]),
      getDashboard: async () => []
    }) },
    { provide: RoutingService, useValue: createAsyncServiceStub<RoutingService>({
      listRules: async () => ({ items: [], nextCursor: null }),
      createRule: async () => ({
        id: 'rule-1',
        tenantId: 'tenant-1',
        name: 'Round robin',
        priority: 1,
        mode: 'ROUND_ROBIN',
        enabled: true,
        conditions: {},
        targets: [],
        fallback: null,
        slaFirstTouchMinutes: null,
        slaKeptAppointmentMinutes: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }),
      updateRule: async () => ({
        id: 'rule-1',
        tenantId: 'tenant-1',
        name: 'Round robin',
        priority: 1,
        mode: 'ROUND_ROBIN',
        enabled: true,
        conditions: {},
        targets: [],
        fallback: null,
        slaFirstTouchMinutes: null,
        slaKeptAppointmentMinutes: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }),
      deleteRule: async () => ({ id: 'rule-1' }),
      getCapacityView: async () => ([
        {
          agentId: 'agent-1',
          name: 'Agent One',
          activePipeline: 'default',
          capacityTarget: 10,
          capacityRemaining: 5,
          keptApptRate: 0.75,
          teamIds: ['team-1']
        }
      ]),
      listRouteEvents: async () => ({ items: [], nextCursor: null }),
      getSlaDashboard: async () => ({
        summary: { total: 0, pending: 0, breached: 0, satisfied: 0 },
        timers: []
      }),
      processSlaTimers: async () => ({ processed: 0 }),
      getMetrics: async () => ({
        firstTouch: { count: 0, averageMinutes: null },
        breach: {
          firstTouch: { total: 0, breached: 0, percentage: 0 },
          keptAppointment: { total: 0, breached: 0, percentage: 0 }
        },
        rules: [],
        agents: []
      })
    }) },
    { provide: JourneysService, useValue: createAsyncServiceStub<JourneysService>({
      simulate: async () => ({ status: 'simulated' })
    }) },
    { provide: DashboardsService, useValue: createAsyncServiceStub<DashboardsService>({
      brokerSummary: async () => ({
        leadToKeptRate: 0.5,
        toursWithBbaRate: 0.6,
        deliverability: [{ channel: 'EMAIL', accepted: 10, delivered: 9, bounced: 1, optOuts: 0 }],
        deals: [{ stage: 'Negotiation', forecastGci: 5000, actualGci: 2500 }],
        clearCooperation: [{ timerId: 'timer-1', status: 'GREEN', startedAt: new Date(), deadlineAt: new Date() }]
      })
    }) },
    { provide: SearchService, useValue: createAsyncServiceStub<SearchService>({
      search: async () => ({ items: [], nextCursor: null, facets: { byType: {} } })
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
