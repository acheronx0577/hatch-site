import { Controller, Get, Query, Req, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { AuditInterceptor } from '../../platform/audit/audit.interceptor';
import { Permit } from '../../platform/security/permit.decorator';
import { ApiModule, ApiStandardErrors, resolveRequestContext } from '../common';
import type { RequestContext } from '../common/request-context';
import { SearchRequestDto, SearchResponseDto } from './dto';
import { SearchService } from './search.service';

@ApiTags('Search')
@ApiBearerAuth()
@ApiModule('Search')
@ApiStandardErrors()
@UseInterceptors(AuditInterceptor)
@Controller('search')
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @Get()
  @Permit('search', 'read')
  @ApiOkResponse({ type: SearchResponseDto })
  async search(
    @Req() req: FastifyRequest,
    @Query() query: SearchRequestDto
  ): Promise<SearchResponseDto> {
    const ctx: RequestContext = resolveRequestContext(req);
    return this.service.search(ctx, query);
  }
}
