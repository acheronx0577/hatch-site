import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { LeadScoreTier, LeadTouchpointType, MessageChannel } from '@hatch/db';

export class LeadOwnerDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional()
  name?: string | null;

  @ApiPropertyOptional()
  email?: string | null;

  @ApiPropertyOptional()
  role?: string | null;
}

export class LeadStageDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  order!: number;

  @ApiProperty()
  pipelineId!: string;

  @ApiProperty()
  pipelineName!: string;

  @ApiProperty()
  pipelineType!: string;

  @ApiPropertyOptional({ type: Number, nullable: true })
  slaMinutes?: number | null;
}

export class LeadActivityRollupDto {
  @ApiProperty({ type: Number })
  last7dListingViews!: number;

  @ApiProperty({ type: Number })
  last7dSessions!: number;

  @ApiPropertyOptional()
  lastReplyAt?: string | null;

  @ApiPropertyOptional()
  lastEmailOpenAt?: string | null;

  @ApiPropertyOptional()
  lastTouchpointAt?: string | null;
}

export class LeadNoteDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  body!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty({ type: LeadOwnerDto })
  author!: LeadOwnerDto;
}

export class LeadTaskDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ enum: ['PENDING', 'DONE', 'CANCELLED'] })
  status!: string;

  @ApiPropertyOptional()
  dueAt?: string | null;

  @ApiPropertyOptional({ type: LeadOwnerDto })
  assignee?: LeadOwnerDto;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class LeadTouchpointDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: LeadTouchpointType })
  type!: LeadTouchpointType;

  @ApiPropertyOptional({ enum: MessageChannel, nullable: true })
  channel?: MessageChannel | null;

  @ApiProperty()
  occurredAt!: string;

  @ApiPropertyOptional()
  summary?: string | null;

  @ApiPropertyOptional()
  body?: string | null;
}

export class LeadConsentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  channel!: string;

  @ApiProperty()
  scope!: string;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional()
  capturedAt?: string | null;
}

export class LeadSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional()
  firstName?: string | null;

  @ApiPropertyOptional()
  lastName?: string | null;

  @ApiPropertyOptional()
  email?: string | null;

  @ApiPropertyOptional()
  phone?: string | null;

  @ApiProperty({ type: Number })
  score!: number;

  @ApiProperty({ enum: LeadScoreTier })
  scoreTier!: LeadScoreTier;

  @ApiPropertyOptional()
  pipelineId?: string | null;

  @ApiPropertyOptional()
  pipelineName?: string | null;

  @ApiPropertyOptional()
  pipelineType?: string | null;

  @ApiPropertyOptional()
  stageId?: string | null;

  @ApiPropertyOptional({ type: LeadOwnerDto })
  owner?: LeadOwnerDto | null;

  @ApiPropertyOptional({ type: LeadStageDto })
  stage?: LeadStageDto | null;

  @ApiPropertyOptional()
  lastActivityAt?: string | null;

  @ApiPropertyOptional()
  stageEnteredAt?: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiPropertyOptional()
  preapproved?: boolean;

  @ApiPropertyOptional({ type: Number, nullable: true })
  budgetMax?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  budgetMin?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  timeframeDays?: number | null;

  @ApiPropertyOptional({ type: LeadActivityRollupDto })
  activityRollup?: LeadActivityRollupDto;
}

export class LeadListResponseDto {
  @ApiProperty({ type: LeadSummaryDto, isArray: true })
  items!: LeadSummaryDto[];

  @ApiPropertyOptional({ nullable: true })
  nextCursor?: string | null;
}

export class LeadDetailDto extends LeadSummaryDto {
  @ApiProperty({ type: LeadNoteDto, isArray: true })
  notes!: LeadNoteDto[];

  @ApiProperty({ type: LeadTaskDto, isArray: true })
  tasks!: LeadTaskDto[];

  @ApiProperty({ type: LeadTouchpointDto, isArray: true })
  touchpoints!: LeadTouchpointDto[];

  @ApiProperty({ type: LeadConsentDto, isArray: true })
  consents!: LeadConsentDto[];
}
