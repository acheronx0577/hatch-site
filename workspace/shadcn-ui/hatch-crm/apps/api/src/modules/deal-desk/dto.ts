import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUUID, Max, Min, IsIn } from 'class-validator';

import { CursorPaginationQueryDto } from '../common/dto/cursor-pagination-query.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';

export class CreateDealDeskRequestDto {
  @ApiProperty({ description: 'Opportunity identifier for the request' })
  @IsUUID()
  opportunityId!: string;

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({ type: Number, description: 'Optional override amount' })
  amount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @ApiPropertyOptional({
    type: Number,
    minimum: 0,
    maximum: 100,
    description: 'Discount percentage suggested by the rep'
  })
  discountPct?: number;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Free-form justification for the request' })
  reason?: string;
}

export class DealDeskListQueryDto extends CursorPaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsIn(['PENDING', 'APPROVED', 'REJECTED'])
  @ApiPropertyOptional({
    description: 'Filter requests by status',
    enum: ['PENDING', 'APPROVED', 'REJECTED']
  })
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export class DealDeskRequestResponseDto {
  @ApiProperty({ description: 'Deal desk request identifier' })
  id!: string;

  @ApiProperty({ description: 'Owning organisation identifier' })
  orgId!: string;

  @ApiProperty({ description: 'Opportunity identifier associated to the request' })
  opportunityId!: string;

  @ApiPropertyOptional({ type: Number })
  amount?: number | null;

  @ApiPropertyOptional({ type: Number })
  discountPct?: number | null;

  @ApiPropertyOptional()
  reason?: string | null;

  @ApiProperty({ description: 'Current status for the request', enum: ['PENDING', 'APPROVED', 'REJECTED'] })
  status!: string;

  @ApiPropertyOptional()
  decidedAt?: string | null;

  @ApiPropertyOptional()
  decidedBy?: string | null;

  @ApiProperty()
  requesterId!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiPropertyOptional()
  updatedAt?: string;
}

export class DealDeskListResponseDto extends PaginatedResponseDto<DealDeskRequestResponseDto> {
  @ApiProperty({ type: () => DealDeskRequestResponseDto, isArray: true })
  declare items: DealDeskRequestResponseDto[];
}
