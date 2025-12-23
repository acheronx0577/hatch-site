import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsOptional, IsString, ValidateIf, ValidateNested } from 'class-validator';

import { AiConfig } from '@/config/ai.config';
import { getAiMetrics } from '@/modules/ai/interceptors/ai-circuit.interceptor';
import { AiService } from './ai.service';
import { AiEmailDraftService } from './ai-email.service';
import type { PersonaId } from './personas/ai-personas.types';
import {
  AUDIENCE_SEGMENT_KEYS,
  type AudienceSegmentKey
} from './ai-email.types';
import { resolveRequestContext } from '@/modules/common';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';

class AiEmailDraftDto {
  @IsIn(['agent_copilot', 'lead_nurse', 'listing_concierge', 'market_analyst', 'transaction_coordinator'])
  personaId!: PersonaId;

  @IsIn(['segment', 'singleLead'])
  contextType!: 'segment' | 'singleLead';

  @ValidateIf((dto) => dto.contextType === 'segment')
  @IsIn(AUDIENCE_SEGMENT_KEYS)
  segmentKey?: AudienceSegmentKey;

  @ValidateIf((dto) => dto.contextType === 'singleLead')
  @IsString()
  leadId?: string;

  @IsOptional()
  @IsString()
  prompt?: string;
}

class FieldMappingAvailableFieldDto {
  @IsString()
  field!: string;

  @IsString()
  label!: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

class AiFieldMappingDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  sourceFields!: string[];

  @IsOptional()
  sampleValues?: Record<string, Array<string | number>>;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => FieldMappingAvailableFieldDto)
  availableFields!: FieldMappingAvailableFieldDto[];
}

@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly emailDrafts: AiEmailDraftService
  ) {}

  @Get('health')
  health() {
    const status = this.ai.getProviderStatus();
    return {
      ok: true,
      provider: status.provider,
      hasKey: status.isConfigured,
      model: status.model,
      resolvedModel: status.resolvedModel,
      timeoutMs: AiConfig.timeoutMs,
      metrics: getAiMetrics()
    };
  }

  @Post('email-draft')
  @UseGuards(JwtAuthGuard)
  async draftEmail(@Body() dto: AiEmailDraftDto, @Req() req: FastifyRequest) {
    const ctx = resolveRequestContext(req);
    return this.emailDrafts.draftEmail({
      tenantId: ctx.tenantId,
      personaId: dto.personaId,
      contextType: dto.contextType,
      segmentKey: dto.segmentKey,
      leadId: dto.leadId,
      prompt: dto.prompt
    });
  }

  @Post('field-mapping')
  @UseGuards(JwtAuthGuard)
  async fieldMapping(@Body() dto: AiFieldMappingDto) {
    const sourceFields = Array.from(
      new Set((dto.sourceFields ?? []).map((field) => (field ?? '').trim()).filter(Boolean))
    );
    if (sourceFields.length === 0) {
      throw new BadRequestException('sourceFields is required');
    }

    const available = Array.from(
      new Map(
        (dto.availableFields ?? [])
          .map((entry) => ({
            field: (entry.field ?? '').trim(),
            label: (entry.label ?? '').trim(),
            required: Boolean(entry.required)
          }))
          .filter((entry) => entry.field.length > 0 && entry.label.length > 0)
          .map((entry) => [entry.field, entry])
      ).values()
    );
    if (available.length === 0) {
      throw new BadRequestException('availableFields is required');
    }

    const allowedFields = new Set(available.map((entry) => entry.field));
    const sampleValues = dto.sampleValues ?? {};

    const providerStatus = this.ai.getProviderStatus();
    if (!providerStatus.isConfigured) {
      return {
        suggestions: sourceFields.map((sourceField) => ({
          sourceField,
          hatchField: null,
          confidence: 0,
          reasoning: 'AI provider not configured',
          possibleMatches: []
        }))
      };
    }

    const systemPrompt = `You are an expert at mapping real-estate listing spreadsheet columns to Hatch MLS fields.

Return ONLY a JSON object with the shape:
{
  "suggestions": [
    {
      "sourceField": "original source column name",
      "hatchField": "one of the available Hatch fields, or null",
      "confidence": 0.0,
      "reasoning": "short explanation",
      "possibleMatches": ["optional alternatives when hatchField is null or confidence < 0.8"]
    }
  ]
}

Rules:
- hatchField must be exactly one of the provided availableFields[].field values, or null.
- Only set hatchField when you are confident (>= 0.8). Otherwise set hatchField to null and provide possibleMatches.
- Use sample values to infer types (money, integer counts, address parts, boolean flags, URLs, etc.).
- Be conservative; avoid incorrect mappings.`;

    const userPrompt = [
      'Map these source columns to Hatch fields.',
      '',
      `Source fields (with sample values):`,
      JSON.stringify(
        sourceFields.map((field) => ({
          sourceField: field,
          sampleValues: Array.isArray(sampleValues[field]) ? sampleValues[field].slice(0, 5) : []
        })),
        null,
        2
      ),
      '',
      'Available Hatch fields:',
      JSON.stringify(available, null, 2)
    ].join('\n');

    const response = await this.ai.runStructuredChat({
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      responseFormat: 'json_object',
      temperature: 0.2
    });

    const parsed = safeParseJsonObject(response.text ?? '');
    const rawSuggestions = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];

    const suggestions = rawSuggestions
      .map((entry: any) => {
        const sourceField = typeof entry?.sourceField === 'string' ? entry.sourceField.trim() : '';
        if (!sourceField) return null;

        const rawField = typeof entry?.hatchField === 'string' ? entry.hatchField.trim() : null;
        const hatchField = rawField && allowedFields.has(rawField) ? rawField : null;

        const confidenceRaw = typeof entry?.confidence === 'number' ? entry.confidence : Number(entry?.confidence);
        const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0;

        const reasoning = typeof entry?.reasoning === 'string' ? entry.reasoning.trim() : undefined;

        const possibleMatches = Array.isArray(entry?.possibleMatches)
          ? entry.possibleMatches
              .map((value: any) => (typeof value === 'string' ? value.trim() : ''))
              .filter((value: string) => value.length > 0 && allowedFields.has(value))
              .slice(0, 8)
          : [];

        return {
          sourceField,
          hatchField: hatchField && confidence >= 0.8 ? hatchField : null,
          confidence,
          reasoning,
          possibleMatches
        };
      })
      .filter(Boolean);

    const byField = new Map<string, any>();
    for (const suggestion of suggestions) {
      const prior = byField.get(suggestion.sourceField);
      if (!prior || suggestion.confidence > prior.confidence) {
        byField.set(suggestion.sourceField, suggestion);
      }
    }

    // Ensure we always return a suggestion per source field.
    const ordered = sourceFields.map((sourceField) => {
      return (
        byField.get(sourceField) ?? {
          sourceField,
          hatchField: null,
          confidence: 0,
          reasoning: 'No confident match',
          possibleMatches: []
        }
      );
    });

    return { suggestions: ordered };
  }
}

function safeParseJsonObject(text: string): any {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Attempt to recover by extracting the first {...} block.
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}
