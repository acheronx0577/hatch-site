import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { IsArray, IsOptional, IsString } from 'class-validator';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { resolveRequestContext } from '@/modules/common/request-context';
import { PropertyDossierService } from './property-dossier.service';

class GenerateDossierDto {
  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  listingId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documentIds?: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}

@ApiTags('ai-property-dossier')
@ApiBearerAuth()
@Controller('ai/property-dossier')
@UseGuards(JwtAuthGuard)
export class PropertyDossierController {
  constructor(private readonly dossiers: PropertyDossierService) {}

  @Post('generate')
  async generate(@Req() req: FastifyRequest, @Body() dto: GenerateDossierDto) {
    const ctx = resolveRequestContext(req);
    return this.dossiers.generate(ctx, dto);
  }

  @Get(':id')
  async get(@Req() req: FastifyRequest, @Param('id') id: string) {
    const ctx = resolveRequestContext(req);
    return this.dossiers.getById(ctx, id);
  }

  @Get(':id/export/:format')
  async export(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Param('format') format: 'pdf' | 'docx',
    @Res() reply: FastifyReply
  ) {
    const ctx = resolveRequestContext(req);
    const buffer = await this.dossiers.exportDossier(ctx, id, format);

    const safeName = `property_dossier_${id}`;
    if (format === 'pdf') {
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `attachment; filename="${safeName}.pdf"`);
      return reply.send(buffer);
    }

    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    reply.header('Content-Disposition', `attachment; filename="${safeName}.docx"`);
    return reply.send(buffer);
  }
}

