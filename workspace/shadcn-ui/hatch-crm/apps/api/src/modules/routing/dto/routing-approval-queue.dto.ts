import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RoutingApprovalCandidateDto {
  @ApiProperty()
  agentId!: string;

  @ApiProperty()
  fullName!: string;

  @ApiPropertyOptional({ nullable: true })
  score?: number | null;

  @ApiProperty({ type: [String] })
  reasons!: string[];
}

export class RoutingApprovalLeadDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  email?: string | null;

  @ApiPropertyOptional({ nullable: true })
  phone?: string | null;

  @ApiProperty()
  leadType!: string;

  @ApiProperty()
  stage!: string;

  @ApiPropertyOptional({ nullable: true })
  source?: string | null;

  @ApiProperty()
  createdAt!: string;
}

export class RoutingApprovalQueueItemDto {
  @ApiProperty()
  assignmentId!: string;

  @ApiProperty()
  personId!: string;

  @ApiProperty()
  assignedAt!: string;

  @ApiProperty({ type: () => RoutingApprovalLeadDto })
  lead!: RoutingApprovalLeadDto;

  @ApiPropertyOptional({ type: () => RoutingApprovalCandidateDto, nullable: true })
  recommended?: RoutingApprovalCandidateDto | null;

  @ApiProperty({ type: () => RoutingApprovalCandidateDto, isArray: true })
  candidates!: RoutingApprovalCandidateDto[];
}

export class RoutingApprovalQueueResponseDto {
  @ApiProperty({ type: () => RoutingApprovalQueueItemDto, isArray: true })
  items!: RoutingApprovalQueueItemDto[];

  @ApiProperty()
  total!: number;
}

export class RoutingApprovalDecisionDto {
  @ApiPropertyOptional({ nullable: true, description: 'Assign to this agent id; if omitted, uses the system recommendation.' })
  @IsOptional()
  @IsString()
  agentId?: string | null;
}

