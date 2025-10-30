import { ApiProperty } from '@nestjs/swagger';

export class DeliverabilityMetricDto {
  @ApiProperty()
  channel!: string;

  @ApiProperty()
  accepted!: number;

  @ApiProperty()
  delivered!: number;

  @ApiProperty()
  bounced!: number;

  @ApiProperty()
  optOuts!: number;
}

export class DealStageMetricDto {
  @ApiProperty()
  stage!: string;

  @ApiProperty()
  forecastGci!: number;

  @ApiProperty()
  actualGci!: number;
}

export class ClearCooperationTimerSummaryDto {
  @ApiProperty()
  timerId!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  startedAt!: string;

  @ApiProperty({ nullable: true })
  deadlineAt!: string | null;
}

export class BrokerDashboardSummaryDto {
  @ApiProperty({ description: 'Ratio of leads that resulted in kept tours', example: 0.42 })
  leadToKeptRate!: number;

  @ApiProperty({ description: 'Ratio of tours with an active buyer-broker agreement', example: 0.55 })
  toursWithBbaRate!: number;

  @ApiProperty({ type: () => DeliverabilityMetricDto, isArray: true })
  deliverability!: DeliverabilityMetricDto[];

  @ApiProperty({ type: () => DealStageMetricDto, isArray: true })
  deals!: DealStageMetricDto[];

  @ApiProperty({ type: () => ClearCooperationTimerSummaryDto, isArray: true })
  clearCooperation!: ClearCooperationTimerSummaryDto[];
}
