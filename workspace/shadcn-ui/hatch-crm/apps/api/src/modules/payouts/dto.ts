import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';

import { CursorPaginationQueryDto } from '../common/dto/cursor-pagination-query.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';

export class GeneratePayoutDto {
  @ApiProperty({ description: 'Identifier for the opportunity generating payouts' })
  @IsUUID()
  opportunityId!: string;
}

export class MarkPaidDto {
  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional({ description: 'ISO timestamp representing when the payout was paid' })
  paidAt?: string;
}

export class PayoutListQueryDto extends CursorPaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsIn(['PENDING', 'PAID'])
  @ApiPropertyOptional({ description: 'Filter payouts by status', enum: ['PENDING', 'PAID'] })
  status?: 'PENDING' | 'PAID';
}

export class PayoutResponseDto {
  @ApiProperty({ description: 'Payout identifier' })
  id!: string;

  @ApiProperty()
  orgId!: string;

  @ApiPropertyOptional()
  transactionId?: string | null;

  @ApiPropertyOptional()
  opportunityId?: string | null;

  @ApiProperty()
  payeeId!: string;

  @ApiProperty({ type: Number })
  grossAmount!: number;

  @ApiProperty({ type: Number })
  brokerAmount!: number;

  @ApiProperty({ type: Number })
  agentAmount!: number;

  @ApiProperty({ description: 'Current status', enum: ['PENDING', 'PAID'] })
  status!: string;

  @ApiPropertyOptional()
  dueOn?: string | null;

  @ApiPropertyOptional()
  paidAt?: string | null;

  @ApiProperty()
  createdAt!: string;
}

export class PayoutListResponseDto extends PaginatedResponseDto<PayoutResponseDto> {
  @ApiProperty({ type: () => PayoutResponseDto, isArray: true })
  declare items: PayoutResponseDto[];
}
