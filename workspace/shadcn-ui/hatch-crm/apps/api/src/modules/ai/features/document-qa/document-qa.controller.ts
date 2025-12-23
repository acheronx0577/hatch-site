import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { IsOptional, IsString } from 'class-validator';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { resolveRequestContext } from '@/modules/common/request-context';
import { DocumentQaService } from './document-qa.service';

class AskQuestionDto {
  @IsString()
  question!: string;
}

class UploadQueryDto {
  @IsOptional()
  @IsString()
  documentType?: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;
}

@ApiTags('ai-document-qa')
@ApiBearerAuth()
@Controller('ai/document-qa')
@UseGuards(JwtAuthGuard)
export class DocumentQaController {
  constructor(private readonly documentQa: DocumentQaService) {}

  @Post('upload')
  async upload(@Req() req: FastifyRequest, @Query() query: UploadQueryDto) {
    const ctx = resolveRequestContext(req);

    const file = await this.consumeFile(req);
    if (!file) {
      throw new BadRequestException('file is required');
    }

    const buffer = await file.toBuffer();

    return this.documentQa.uploadDocument(ctx, {
      buffer,
      filename: file.filename,
      mimeType: file.mimetype,
      documentType: query.documentType,
      entityType: query.entityType,
      entityId: query.entityId
    });
  }

  @Post(':documentId/ask')
  async ask(@Req() req: FastifyRequest, @Param('documentId') documentId: string, @Body() dto: AskQuestionDto) {
    const ctx = resolveRequestContext(req);
    return this.documentQa.askQuestion(ctx, { documentId, question: dto.question });
  }

  @Get('suggested-questions')
  async suggestedQuestions(@Query('documentType') documentType?: string) {
    return { documentType: documentType ?? null, questions: this.documentQa.getSuggestedQuestions(documentType) };
  }

  private async consumeFile(req: FastifyRequest): Promise<MultipartFile | undefined> {
    try {
      return await (req as FastifyRequest & { file: () => Promise<MultipartFile> }).file();
    } catch (error) {
      throw new BadRequestException(`Unable to process uploaded file: ${(error as Error).message}`);
    }
  }
}

