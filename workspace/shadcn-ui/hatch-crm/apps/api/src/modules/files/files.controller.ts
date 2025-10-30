import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseInterceptors
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiParam,
  ApiTags
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { AuditInterceptor } from '../../platform/audit/audit.interceptor';
import { Permit } from '../../platform/security/permit.decorator';
import { resolveRequestContext } from '../common/request-context';
import { FilesService } from './files.service';
import {
  CreateUploadUrlDto,
  FileUploadResponseDto,
  LinkFileDto,
  LinkedFileSummaryDto
} from './dto';

@ApiTags('Files')
@ApiBearerAuth()
@Controller('files')
@UseInterceptors(AuditInterceptor)
export class FilesController {
  constructor(private readonly service: FilesService) {}

  @Post('upload-url')
  @Permit('files', 'create')
  @ApiBody({ type: CreateUploadUrlDto })
  @ApiOkResponse({ type: FileUploadResponseDto })
  async uploadUrl(
    @Req() req: FastifyRequest,
    @Body() body: CreateUploadUrlDto
  ) {
    const ctx = resolveRequestContext(req);
    return this.service.createUploadUrl(ctx, body);
  }

  @Post('link')
  @Permit('files', 'update')
  @ApiBody({ type: LinkFileDto })
  @ApiOkResponse({ type: LinkedFileSummaryDto })
  async link(
    @Req() req: FastifyRequest,
    @Body() body: LinkFileDto
  ) {
    const ctx = resolveRequestContext(req);
    return this.service.link(ctx, body);
  }

  @Get(':object/:id')
  @Permit('files', 'read')
  @ApiParam({ name: 'object', description: 'CRM object key (e.g. accounts, opportunities)' })
  @ApiParam({ name: 'id', description: 'Record identifier' })
  @ApiOkResponse({ type: LinkedFileSummaryDto, isArray: true })
  async listForRecord(
    @Req() req: FastifyRequest,
    @Param('object') object: string,
    @Param('id') id: string
  ) {
    const ctx = resolveRequestContext(req);
    return this.service.listForRecord(ctx, object, id);
  }

  @Delete(':id')
  @Permit('files', 'delete')
  @ApiParam({ name: 'id', description: 'File identifier' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Marked deleted file id' } }
    }
  })
  async remove(@Req() req: FastifyRequest, @Param('id') id: string) {
    const ctx = resolveRequestContext(req);
    return this.service.softDelete(ctx, id);
  }
}
