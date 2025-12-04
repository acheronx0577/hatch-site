import { Transform, Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SearchRequestDto {
  @ApiProperty({ description: 'Free-text query', example: 'smith escrow' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Object types to include',
    example: ['contacts', 'opportunities']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (Array.isArray(value)) {
      return value
        .flatMap((entry) => entry.split(','))
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
    return undefined;
  })
  types?: string[];

  @ApiPropertyOptional({ description: 'Filter by record owner id' })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiPropertyOptional({ description: 'Filter by stage (opportunities/deals/leads)' })
  @IsOptional()
  @IsString()
  stage?: string;

  @ApiPropertyOptional({ description: 'Filter by status (cases/listings/offers)' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 25;

  @ApiPropertyOptional({ description: 'Opaque cursor from previous page' })
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class SearchHitDto {
  @ApiProperty({ description: 'Object type key', example: 'contacts' })
  object!: string;

  @ApiProperty({ description: 'Record identifier' })
  id!: string;

  @ApiProperty({ description: 'Primary title for the result' })
  title!: string;

  @ApiPropertyOptional({ description: 'Secondary subtitle' })
  subtitle?: string;

  @ApiPropertyOptional({ description: 'Highlighted snippet with <mark> tags' })
  snippet?: string;

  @ApiProperty({ description: 'Relevance score (descending)', example: 0.87 })
  score!: number;

  @ApiProperty({ description: 'ISO timestamp for last update' })
  updatedAt!: string;
}

export class SearchFacetsDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    description: 'Count of results per object type for the current page'
  })
  byType!: Record<string, number>;
}

export class SearchResponseDto {
  @ApiProperty({ type: [SearchHitDto] })
  items!: SearchHitDto[];

  @ApiPropertyOptional({ nullable: true })
  nextCursor?: string | null;

  @ApiProperty({ type: SearchFacetsDto })
  facets!: SearchFacetsDto;
}
