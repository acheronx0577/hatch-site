import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString
} from 'class-validator';

export const METRIC_KEYS = [
  'leads.conversion',
  'messaging.deliverability',
  'cc.risk',
  'pipeline.value'
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];

const METRIC_KEY_SET = new Set<string>(METRIC_KEYS);

const toISODate = (value?: string) => (value ? new Date(value).toISOString() : undefined);

export class GetMetricsQueryDto {
  @ApiProperty({ enum: METRIC_KEYS, description: 'Metric key to fetch' })
  @IsString()
  @IsIn(METRIC_KEYS, { message: `key must be one of: ${METRIC_KEYS.join(', ')}` })
  key!: MetricKey;

  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional({ description: 'Start date (inclusive) for the range filter' })
  from?: string;

  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional({ description: 'End date (inclusive) for the range filter' })
  to?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value ? String(value).toLowerCase() : 'daily'))
  @ApiPropertyOptional({ description: 'Granularity hint for front-end consumption' })
  granularity: string = 'daily';
}

export class RecomputeBodyDto {
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(METRIC_KEYS, { each: true, message: `keys must be within: ${METRIC_KEYS.join(', ')}` })
  @ApiPropertyOptional({ type: [String], enum: METRIC_KEYS })
  keys?: MetricKey[];

  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional({ description: 'Start date (inclusive) to recompute' })
  from?: string;

  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional({ description: 'End date (inclusive) to recompute' })
  to?: string;
}

export const normalizeKeys = (keys?: string[]): MetricKey[] => {
  if (!keys || keys.length === 0) {
    return [...METRIC_KEYS];
  }
  const filtered = Array.from(new Set(keys.filter((key) => METRIC_KEY_SET.has(key)))) as MetricKey[];
  return filtered.length > 0 ? filtered : [...METRIC_KEYS];
};

export class MetricsPointDto {
  @ApiProperty({ description: 'ISO date representing the metric bucket' })
  date!: string;

  @ApiPropertyOptional({ type: Number, description: 'Numeric value for the series' })
  valueNum?: number | null;

  @ApiPropertyOptional({ description: 'JSON payload when the metric stores structured data' })
  valueJson?: unknown;
}

export class MetricsRecomputeResponseDto {
  @ApiProperty({ type: [String], enum: METRIC_KEYS })
  keys!: MetricKey[];

  @ApiProperty({
    type: 'object',
    properties: {
      from: { type: 'string', format: 'date-time' },
      to: { type: 'string', format: 'date-time' }
    }
  })
  range!: { from: string; to: string };

  @ApiProperty({ description: 'Indicates the recompute task has been scheduled' })
  status!: string;
}
