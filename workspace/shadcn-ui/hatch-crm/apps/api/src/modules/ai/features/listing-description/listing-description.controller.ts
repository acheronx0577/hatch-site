import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { resolveRequestContext } from '@/modules/common/request-context';
import { ListingDescriptionService } from './listing-description.service';

class GenerateListingDescriptionDto {
  @IsString()
  listingId!: string;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsInt()
  @Min(50)
  maxLength?: number;

  @IsOptional()
  @IsString()
  agentNotes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @IsOptional()
  @IsString()
  recentUpdates?: string;

  @IsOptional()
  @IsString()
  neighborhood?: string;

  @IsOptional()
  @IsString()
  views?: string;

  @IsOptional()
  @IsInt()
  @Min(1600)
  yearBuilt?: number;

  @IsOptional()
  @IsString()
  propertyType?: string;
}

class RegenerateDto {
  @IsOptional()
  @IsString()
  feedback?: string;
}

class FeedbackDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  comment?: string;
}

@ApiTags('ai-listing-description')
@ApiBearerAuth()
@Controller('ai/listing-description')
@UseGuards(JwtAuthGuard)
export class ListingDescriptionController {
  constructor(private readonly listingDescriptions: ListingDescriptionService) {}

  @Post('generate')
  async generate(@Req() req: FastifyRequest, @Body() dto: GenerateListingDescriptionDto) {
    const ctx = resolveRequestContext(req);
    return this.listingDescriptions.generate(ctx, dto);
  }

  @Post(':requestId/regenerate')
  async regenerate(@Req() req: FastifyRequest, @Body() dto: RegenerateDto, @Param('requestId') requestId: string) {
    const ctx = resolveRequestContext(req);
    return this.listingDescriptions.regenerate(ctx, requestId, dto.feedback);
  }

  @Post(':requestId/feedback')
  async submitFeedback(@Req() req: FastifyRequest, @Body() dto: FeedbackDto, @Param('requestId') requestId: string) {
    const ctx = resolveRequestContext(req);
    await this.listingDescriptions.submitFeedback(ctx, requestId, dto);
    return { ok: true };
  }
}
