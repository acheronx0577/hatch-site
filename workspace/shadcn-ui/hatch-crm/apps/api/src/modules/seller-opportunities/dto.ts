import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const SELLER_OPPORTUNITY_STATUS_VALUES = ['NEW', 'CONVERTED', 'DISMISSED'] as const;

export class ListSellerOpportunitiesQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(SELLER_OPPORTUNITY_STATUS_VALUES)
  status?: (typeof SELLER_OPPORTUNITY_STATUS_VALUES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  minScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}

