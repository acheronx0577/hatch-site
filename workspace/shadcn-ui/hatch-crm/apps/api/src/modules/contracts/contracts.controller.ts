import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { resolveRequestContext } from '../common';
import { ContractsService } from './contracts.service';
import {
  CreateContractInstanceDto,
  ListInstancesQueryDto,
  ListTemplatesQueryDto,
  SearchTemplatesQueryDto,
  SendForSignatureDto,
  UpdateContractInstanceDto
} from './dto/contracts.dto';

@ApiTags('contracts')
@ApiBearerAuth()
@Controller('organizations/:orgId/contracts')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get('templates')
  listTemplates(@Param('orgId') orgId: string, @Query() query: ListTemplatesQueryDto) {
    return this.contracts.listTemplates(orgId, query);
  }

  @Get('templates/search')
  searchTemplates(@Param('orgId') orgId: string, @Query() query: SearchTemplatesQueryDto) {
    return this.contracts.searchTemplates(orgId, query);
  }

  @Get('templates/recommendations')
  recommendTemplates(@Param('orgId') orgId: string, @Query() query: ListTemplatesQueryDto) {
    return this.contracts.recommendTemplates(orgId, {
      propertyType: query.propertyType,
      side: query.side,
      jurisdiction: query.jurisdiction
    });
  }

  @Get('instances')
  listInstances(@Param('orgId') orgId: string, @Query() query: ListInstancesQueryDto) {
    return this.contracts.listInstances(orgId, query);
  }

  @Get('instances/:id')
  getInstance(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.contracts.getInstance(orgId, id);
  }

  @Post('instances')
  createInstance(
    @Param('orgId') orgId: string,
    @Req() req: FastifyRequest,
    @Body() dto: CreateContractInstanceDto
  ) {
    const ctx = resolveRequestContext(req);
    return this.contracts.createInstance(orgId, ctx.userId, dto);
  }

  @Patch('instances/:id')
  updateInstance(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateContractInstanceDto
  ) {
    return this.contracts.updateInstance(orgId, id, dto);
  }

  @Post('instances/:id/send-for-signature')
  sendForSignature(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: SendForSignatureDto
  ) {
    return this.contracts.sendForSignature(orgId, id, dto);
  }
}
