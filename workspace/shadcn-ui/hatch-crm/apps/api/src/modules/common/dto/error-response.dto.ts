import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Normalized error structure returned by the API.
 */
export class ErrorResponseDto {
  @ApiProperty({
    description: 'Stable machine-readable error code',
    example: 'permission_denied'
  })
  code!: string;

  @ApiProperty({
    description: 'Human-readable context for the error',
    example: 'You do not have permission to access this resource.'
  })
  message!: string;

  @ApiPropertyOptional({
    description: 'Optional key-value details with extra context',
    type: Object,
    nullable: true
  })
  details?: Record<string, unknown> | null;
}
