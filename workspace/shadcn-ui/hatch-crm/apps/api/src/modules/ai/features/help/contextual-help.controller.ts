import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { IsOptional, IsString } from 'class-validator';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { resolveRequestContext } from '@/modules/common/request-context';
import { ContextualHelpService } from './contextual-help.service';

class ExplainFieldDto {
  @IsString()
  fieldPath!: string;

  @IsOptional()
  @IsString()
  question?: string;

  @IsOptional()
  @IsString()
  currentValue?: string;
}

class AskPageDto {
  @IsString()
  pagePath!: string;

  @IsString()
  question!: string;
}

@ApiTags('contextual-help')
@ApiBearerAuth()
@Controller('help')
@UseGuards(JwtAuthGuard)
export class ContextualHelpController {
  constructor(private readonly help: ContextualHelpService) {}

  @Post('explain-field')
  async explainField(@Req() req: FastifyRequest, @Body() dto: ExplainFieldDto) {
    const ctx = resolveRequestContext(req);
    return this.help.explainField(ctx, dto);
  }

  @Post('ask')
  async ask(@Req() req: FastifyRequest, @Body() dto: AskPageDto) {
    const ctx = resolveRequestContext(req);
    return this.help.askAboutPage(ctx, dto);
  }

  @Get('field/:fieldPath')
  async getFieldMeta(@Param('fieldPath') fieldPath: string) {
    return this.help.getFieldMeta(fieldPath);
  }

  @Get('page/:pagePath')
  async getPageHelp(@Param('pagePath') pagePath: string) {
    return this.help.getPageHelp(pagePath);
  }
}
