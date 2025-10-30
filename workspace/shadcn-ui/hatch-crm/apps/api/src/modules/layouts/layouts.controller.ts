import { Body, Controller, Get, Post, Query, Req, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { AuditInterceptor } from '../../platform/audit/audit.interceptor';
import { Permit } from '../../platform/security/permit.decorator';
import { ApiModule, ApiStandardErrors } from '../common/openapi/decorators';
import { resolveRequestContext } from '../common/request-context';
import type { RequestContext } from '../common/request-context';
import { LayoutManifestDto, ResolveLayoutQueryDto, UpsertLayoutDto } from './dto';
import { LayoutsService } from './layouts.service';

@ApiTags('Admin/Layout')
@ApiBearerAuth()
@ApiModule('Admin/Layout')
@ApiStandardErrors()
@UseInterceptors(AuditInterceptor)
@Controller('admin/layouts')
export class LayoutsController {
  constructor(private readonly service: LayoutsService) {}

  @Post('upsert')
  @Permit('layouts', 'update')
  @ApiOkResponse({ type: LayoutManifestDto })
  async upsert(@Req() req: FastifyRequest, @Body() dto: UpsertLayoutDto): Promise<LayoutManifestDto> {
    const ctx: RequestContext = resolveRequestContext(req);
    return this.service.upsert(ctx, dto);
  }

  @Get('resolve')
  @Permit('layouts', 'read')
  @ApiOkResponse({ type: LayoutManifestDto })
  async resolve(
    @Req() req: FastifyRequest,
    @Query() query: ResolveLayoutQueryDto
  ): Promise<LayoutManifestDto> {
    const ctx: RequestContext = resolveRequestContext(req);
    return this.service.resolve(ctx, query);
  }
}
