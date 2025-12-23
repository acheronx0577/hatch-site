import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCustomRiskPackageDto {
  @ApiProperty({ description: 'Human-friendly package name.' })
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ description: 'Short package description.' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @ApiPropertyOptional({ description: 'Grouping label used in the dashboard UI.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  group?: string;

  @ApiProperty({
    description: 'Map of SIGNAL_PATTERN -> multiplier (ex: "LICENSE:LICENSE_EXPIRED": 3.5, "*:*": 1.1).',
    type: 'object',
    additionalProperties: { type: 'number' }
  })
  @IsObject()
  signalMultipliers!: Record<string, number>;

  @ApiPropertyOptional({
    description: 'Optional per-category caps (category is signal.category or signal.source).',
    type: 'object',
    additionalProperties: { type: 'number' }
  })
  @IsOptional()
  @IsObject()
  categoryCaps?: Record<string, number>;

  @ApiPropertyOptional({ description: 'Default multiplier applied per category when no explicit categoryMultipliers match.' })
  @IsOptional()
  @IsNumber()
  categoryDefaultMultiplier?: number;

  @ApiPropertyOptional({
    description: 'Optional per-category multipliers (category is signal.category or signal.source).',
    type: 'object',
    additionalProperties: { type: 'number' }
  })
  @IsOptional()
  @IsObject()
  categoryMultipliers?: Record<string, number>;
}

