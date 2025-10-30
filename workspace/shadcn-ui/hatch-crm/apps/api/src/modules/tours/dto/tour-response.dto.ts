import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TourRequestResponseDto {
  @ApiProperty({ description: 'Tour identifier' })
  tourId!: string;

  @ApiProperty({ enum: ['CONFIRMED', 'REQUESTED'] })
  status!: 'CONFIRMED' | 'REQUESTED';

  @ApiPropertyOptional({
    description: 'Agent that received the tour assignment',
    type: Object,
    nullable: true
  })
  assignedAgent?: Record<string, unknown> | null;

  @ApiPropertyOptional({
    description: 'Full routing evaluation result',
    type: Object,
    nullable: true
  })
  routingResult?: Record<string, unknown> | null;
}

export class TourStatusResponseDto {
  @ApiProperty({ description: 'Tour identifier' })
  tourId!: string;

  @ApiProperty({ enum: ['KEPT', 'REQUESTED', 'CONFIRMED'] })
  status!: 'KEPT' | 'REQUESTED' | 'CONFIRMED';
}
