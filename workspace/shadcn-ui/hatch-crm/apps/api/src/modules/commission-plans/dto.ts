import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

import { CursorPaginationQueryDto } from '../common/dto/cursor-pagination-query.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';

export class CreateCommissionPlanDto {
  @ApiProperty({ description: 'Display name for the commission plan' })
  @IsString()
  name!: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  @ApiProperty({
    description: 'Broker split (0-1)',
    minimum: 0,
    maximum: 1,
    type: Number
  })
  brokerSplit!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  @ApiProperty({
    description: 'Agent split (0-1)',
    minimum: 0,
    maximum: 1,
    type: Number
  })
  agentSplit!: number;

  @IsOptional()
  @IsArray()
  @ApiPropertyOptional({
    description: 'Optional tier configuration payload',
    type: Array,
    example: [{ threshold: 500000, brokerSplit: 0.4 }]
  })
  tiers?: Array<Record<string, unknown>>;
}

export class UpdateCommissionPlanDto {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Updated plan name' })
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  @ApiPropertyOptional({
    minimum: 0,
    maximum: 1,
    type: Number,
    description: 'Updated broker split'
  })
  brokerSplit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  @ApiPropertyOptional({
    minimum: 0,
    maximum: 1,
    type: Number,
    description: 'Updated agent split'
  })
  agentSplit?: number;

  @IsOptional()
  @IsArray()
  @ApiPropertyOptional({
    description: 'Updated tier configuration payload',
    type: Array
  })
  tiers?: Array<Record<string, unknown>>;
}

export class CommissionPlanResponseDto {
  @ApiProperty({ description: 'Commission plan identifier' })
  id!: string;

  @ApiProperty({ description: 'Organisation identifier for the plan' })
  orgId!: string;

  @ApiProperty({ description: 'Display name for the plan' })
  name!: string;

  @ApiProperty({ type: Number })
  brokerSplit!: number;

  @ApiProperty({ type: Number })
  agentSplit!: number;

  @ApiPropertyOptional({ type: Array })
  tiers?: Array<Record<string, unknown>> | null;

  @ApiProperty()
  createdAt!: string;

  @ApiPropertyOptional()
  updatedAt?: string;
}

export class CommissionPlanListQueryDto extends CursorPaginationQueryDto {}

export class CommissionPlanListResponseDto extends PaginatedResponseDto<CommissionPlanResponseDto> {
  @ApiProperty({ type: () => CommissionPlanResponseDto, isArray: true })
  declare items: CommissionPlanResponseDto[];
}
