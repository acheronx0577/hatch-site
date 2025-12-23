import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { OrgMembershipGuard } from '@/platform/security/org-membership.guard';
import { FinancialsService } from './financials.service';
import { resolveRequestContext } from '@/modules/common';
import { CreateLedgerEntryDto, FinancialsDashboardQueryDto, ListLedgerEntriesQueryDto, UpdateLedgerEntryDto } from './dto';

@ApiTags('financials')
@ApiBearerAuth()
@Controller('organizations/:orgId/financials')
@UseGuards(JwtAuthGuard, OrgMembershipGuard)
export class FinancialsController {
  constructor(private readonly financials: FinancialsService) {}

  @Get('dashboard')
  dashboard(@Param('orgId') orgId: string, @Query() query: FinancialsDashboardQueryDto) {
    return this.financials.getDashboard(orgId, {
      period: query.period ?? 'month',
      source: query.source ?? 'auto'
    });
  }

  @Get('ledger')
  listLedger(
    @Param('orgId') orgId: string,
    @Req() req: FastifyRequest,
    @Query() query: ListLedgerEntriesQueryDto
  ) {
    const ctx = resolveRequestContext(req);
    return this.financials.listLedgerEntries(orgId, ctx.userId, query);
  }

  @Post('ledger')
  createLedger(
    @Param('orgId') orgId: string,
    @Req() req: FastifyRequest,
    @Body() dto: CreateLedgerEntryDto
  ) {
    const ctx = resolveRequestContext(req);
    return this.financials.createLedgerEntry(orgId, ctx.userId, dto);
  }

  @Patch('ledger/:entryId')
  updateLedger(
    @Param('orgId') orgId: string,
    @Param('entryId') entryId: string,
    @Req() req: FastifyRequest,
    @Body() dto: UpdateLedgerEntryDto
  ) {
    const ctx = resolveRequestContext(req);
    return this.financials.updateLedgerEntry(orgId, ctx.userId, entryId, dto);
  }

  @Delete('ledger/:entryId')
  deleteLedger(@Param('orgId') orgId: string, @Param('entryId') entryId: string, @Req() req: FastifyRequest) {
    const ctx = resolveRequestContext(req);
    return this.financials.deleteLedgerEntry(orgId, ctx.userId, entryId);
  }
}
