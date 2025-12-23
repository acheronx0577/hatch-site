import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { resolveRequestContext } from '../common/request-context';
import { ComplianceService } from './compliance.service';
import { CreateOverrideDto } from './dto/create-override.dto';
import { GetComplianceStatusDto } from './dto/get-status.dto';

type ComplianceStatusResult = Awaited<ReturnType<ComplianceService['getStatus']>>;
type ComplianceOverridesResult = Awaited<ReturnType<ComplianceService['getOverrides']>>;
type ComplianceOverrideRecord = Awaited<ReturnType<ComplianceService['createOverride']>>;

@Controller('compliance')
@UseGuards(JwtAuthGuard)
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  private resolveTenantId(query: GetComplianceStatusDto, req: FastifyRequest) {
    const ctx = resolveRequestContext(req);
    if (query.tenantId && ctx.tenantId && query.tenantId !== ctx.tenantId) {
      throw new ForbiddenException('tenantId does not match authenticated tenant');
    }
    const tenantId = query.tenantId ?? ctx.tenantId;
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    return tenantId;
  }

  @Get('status')
  async status(@Query() query: GetComplianceStatusDto, @Req() req: FastifyRequest): Promise<ComplianceStatusResult> {
    const tenantId = this.resolveTenantId(query, req);
    return this.compliance.getStatus(tenantId, query);
  }

  @Get('agreements')
  async agreements(@Query() query: GetComplianceStatusDto, @Req() req: FastifyRequest) {
    const tenantId = this.resolveTenantId(query, req);
    return this.compliance.getAgreements(tenantId, query);
  }

  @Get('consents')
  async consents(@Query() query: GetComplianceStatusDto, @Req() req: FastifyRequest) {
    const tenantId = this.resolveTenantId(query, req);
    return this.compliance.getConsents(tenantId, query);
  }

  @Get('listings')
  async listings(@Query() query: GetComplianceStatusDto, @Req() req: FastifyRequest) {
    const tenantId = this.resolveTenantId(query, req);
    return this.compliance.getListings(tenantId, query);
  }

  @Get('disclaimers')
  async disclaimers(@Query() query: GetComplianceStatusDto, @Req() req: FastifyRequest) {
    const tenantId = this.resolveTenantId(query, req);
    return this.compliance.getDisclaimers(tenantId, query);
  }

  @Get('overrides')
  async overrides(
    @Query() query: GetComplianceStatusDto,
    @Req() req: FastifyRequest,
    @Query('context') context?: string
  ): Promise<ComplianceOverridesResult> {
    const tenantId = this.resolveTenantId(query, req);
    return this.compliance.getOverrides(tenantId, context);
  }

  @Post('overrides')
  async createOverride(@Body() body: CreateOverrideDto, @Req() req: FastifyRequest): Promise<ComplianceOverrideRecord> {
    const ctx = resolveRequestContext(req);
    if (body.tenantId && ctx.tenantId && body.tenantId !== ctx.tenantId) {
      throw new ForbiddenException('tenantId does not match authenticated tenant');
    }
    if (body.actorUserId && ctx.userId && body.actorUserId !== ctx.userId) {
      throw new ForbiddenException('actorUserId does not match authenticated user');
    }
    return this.compliance.createOverride({
      ...body,
      tenantId: ctx.tenantId ?? body.tenantId,
      actorUserId: ctx.userId ?? body.actorUserId
    });
  }

  @Post('export')
  async export(@Body() body: GetComplianceStatusDto, @Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const tenantId = this.resolveTenantId(body, req);
    const pdfBuffer = await this.compliance.exportStatus(tenantId, body);
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', 'attachment; filename="compliance-status.pdf"');
    reply.send(pdfBuffer);
  }
}
