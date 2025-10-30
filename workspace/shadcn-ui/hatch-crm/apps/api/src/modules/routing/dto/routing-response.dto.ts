import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PaginatedResponseDto } from '../../common';

export class RoutingRuleDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  priority!: number;

  @ApiProperty()
  mode!: string;

  @ApiProperty()
  enabled!: boolean;

  @ApiPropertyOptional({ type: Object, nullable: true })
  conditions?: Record<string, unknown> | null;

  @ApiProperty({ type: Object, isArray: true })
  targets!: Record<string, unknown>[];

  @ApiPropertyOptional({ type: Object, nullable: true })
  fallback?: Record<string, unknown> | null;

  @ApiPropertyOptional({ nullable: true })
  slaFirstTouchMinutes?: number | null;

  @ApiPropertyOptional({ nullable: true })
  slaKeptAppointmentMinutes?: number | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class RoutingRuleListResponseDto extends PaginatedResponseDto<RoutingRuleDto> {
  @ApiProperty({ type: () => RoutingRuleDto, isArray: true })
  declare items: RoutingRuleDto[];
}

export class RoutingRuleIdentifierDto {
  @ApiProperty()
  id!: string;
}

export class RoutingCapacityEntryDto {
  @ApiProperty()
  agentId!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  activePipeline?: number | null;

  @ApiProperty()
  capacityTarget!: number;

  @ApiProperty()
  capacityRemaining!: number;

  @ApiPropertyOptional({ nullable: true })
  keptApptRate?: number | null;

  @ApiProperty({ type: [String] })
  teamIds!: string[];
}

export class RoutingCapacityResponseDto {
  @ApiProperty({ type: () => RoutingCapacityEntryDto, isArray: true })
  items!: RoutingCapacityEntryDto[];
}

export class RoutingEventDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiPropertyOptional({ nullable: true })
  leadId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  ruleId?: string | null;

  @ApiProperty()
  eventType!: string;

  @ApiProperty({ type: Object })
  payload!: Record<string, unknown>;

  @ApiProperty()
  createdAt!: string;
}

export class RoutingEventListResponseDto extends PaginatedResponseDto<RoutingEventDto> {
  @ApiProperty({ type: () => RoutingEventDto, isArray: true })
  declare items: RoutingEventDto[];
}

export class RoutingSlaSummaryDto {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  pending!: number;

  @ApiProperty()
  breached!: number;

  @ApiProperty()
  satisfied!: number;
}

export class RoutingSlaTimerDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  leadId!: string;

  @ApiProperty()
  type!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  dueAt!: string;

  @ApiPropertyOptional()
  satisfiedAt?: string | null;

  @ApiPropertyOptional()
  breachedAt?: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class RoutingSlaDashboardDto {
  @ApiProperty({ type: () => RoutingSlaSummaryDto })
  summary!: RoutingSlaSummaryDto;

  @ApiProperty({ type: () => RoutingSlaTimerDto, isArray: true })
  timers!: RoutingSlaTimerDto[];
}

export class RoutingProcessSlaResponseDto {
  @ApiProperty()
  processed!: number;
}

export class RoutingAverageTimeDto {
  @ApiProperty()
  count!: number;

  @ApiProperty({ nullable: true })
  averageMinutes!: number | null;
}

export class RoutingBreachBreakdownDto {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  breached!: number;

  @ApiProperty()
  percentage!: number;
}

export class RoutingBreachMetricsDto {
  @ApiProperty({ type: () => RoutingBreachBreakdownDto })
  firstTouch!: RoutingBreachBreakdownDto;

  @ApiProperty({ type: () => RoutingBreachBreakdownDto })
  keptAppointment!: RoutingBreachBreakdownDto;
}

export class RoutingRuleMetricDto {
  @ApiProperty()
  ruleId!: string;

  @ApiProperty()
  ruleName!: string;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  keptRate!: number;
}

export class RoutingAgentMetricDto {
  @ApiProperty()
  agentId!: string;

  @ApiProperty()
  agentName!: string;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  keptRate!: number;
}

export class RoutingMetricsResponseDto {
  @ApiProperty({ type: () => RoutingAverageTimeDto })
  firstTouch!: RoutingAverageTimeDto;

  @ApiProperty({ type: () => RoutingBreachMetricsDto })
  breach!: RoutingBreachMetricsDto;

  @ApiProperty({ type: () => RoutingRuleMetricDto, isArray: true })
  rules!: RoutingRuleMetricDto[];

  @ApiProperty({ type: () => RoutingAgentMetricDto, isArray: true })
  agents!: RoutingAgentMetricDto[];
}
