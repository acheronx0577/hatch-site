import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdateMilestoneDto {
  @ApiProperty({ description: 'Milestone name to update' })
  @IsString()
  name!: string;

  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional({ description: 'Completion timestamp (ISO-8601)' })
  completedAt?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Additional notes for the milestone' })
  notes?: string;
}

export class TransactionListingSummaryDto {
  @ApiProperty({ description: 'Listing identifier' })
  id!: string;

  @ApiPropertyOptional()
  status?: string | null;

  @ApiPropertyOptional()
  opportunityId?: string | null;

  @ApiPropertyOptional({ type: Number })
  price?: number | null;

  @ApiPropertyOptional()
  addressLine1?: string | null;

  @ApiPropertyOptional()
  city?: string | null;

  @ApiPropertyOptional()
  state?: string | null;

  @ApiPropertyOptional()
  postalCode?: string | null;
}

export class MilestoneChecklistItemDto {
  @ApiProperty({ description: 'Milestone name' })
  name!: string;

  @ApiPropertyOptional({ description: 'Completion timestamp (ISO-8601)' })
  completedAt?: string | null;

  @ApiPropertyOptional({ description: 'Milestone notes' })
  notes?: string | null;

  @ApiPropertyOptional({ description: 'User identifier who last updated the milestone' })
  updatedBy?: string | null;

  @ApiPropertyOptional({ description: 'Timestamp of last update' })
  updatedAt?: string | null;
}

export class MilestoneChecklistDto {
  @ApiProperty({ type: () => MilestoneChecklistItemDto, isArray: true })
  items!: MilestoneChecklistItemDto[];
}

export class TransactionResponseDto {
  @ApiProperty({ description: 'Transaction identifier' })
  id!: string;

  @ApiProperty({ description: 'Stage within the transaction workflow' })
  stage!: string;

  @ApiPropertyOptional()
  listingId?: string | null;

  @ApiPropertyOptional()
  personId?: string | null;

  @ApiPropertyOptional()
  opportunityId?: string | null;

  @ApiProperty({ type: () => MilestoneChecklistDto })
  milestoneChecklist!: MilestoneChecklistDto;

  @ApiPropertyOptional({ description: 'Snapshot of commission data' })
  commissionSnapshot?: unknown;

  @ApiPropertyOptional({ type: () => TransactionListingSummaryDto })
  listing?: TransactionListingSummaryDto | null;
}

export class CommissionScheduleEntryDto {
  @ApiProperty({ enum: ['BROKER', 'AGENT'] })
  payee!: string;

  @ApiProperty({ type: Number })
  amount!: number;
}

export class CommissionPreviewDto {
  @ApiProperty({ type: Number })
  gross!: number;

  @ApiProperty({ type: Number })
  brokerAmount!: number;

  @ApiProperty({ type: Number })
  agentAmount!: number;

  @ApiProperty({ type: () => CommissionScheduleEntryDto, isArray: true })
  schedule!: CommissionScheduleEntryDto[];

  @ApiPropertyOptional({ description: 'Commission plan identifier used to compute the preview' })
  planId?: string | null;
}
