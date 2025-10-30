import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { Permit } from '../../platform/security/permit.decorator';
import { ApiModule, ApiStandardErrors } from '../common/openapi/decorators';
import { resolveRequestContext } from '../common/request-context';
import type { RequestContext } from '../common/request-context';
import { AuditLogService } from './audit.service';
import { AuditListQueryDto, AuditListResponseDto } from './dto';

@ApiTags('Admin/Audit')
@ApiModule('Admin/Audit')
@ApiBearerAuth()
@ApiStandardErrors()
@Controller('admin/audit')
export class AuditController {
  constructor(private readonly service: AuditLogService) {}

  @Get()
  @Permit('audit', 'read')
  @ApiOkResponse({ type: AuditListResponseDto })
  async list(@Req() req: FastifyRequest, @Query() query: AuditListQueryDto): Promise<AuditListResponseDto> {
    const ctx: RequestContext = resolveRequestContext(req);
    const result = await this.service.list(ctx.orgId, query);
    return {
      items: result.items,
      nextCursor: result.nextCursor
    };
  }
}
