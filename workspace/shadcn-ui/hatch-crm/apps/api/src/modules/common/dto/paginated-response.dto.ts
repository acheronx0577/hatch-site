import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Canonical cursor-based pagination envelope shared across list endpoints.
 */
export class PaginatedResponseDto<TItem> {
  @ApiProperty({
    description: 'Collection of items for the current window',
    isArray: true,
    type: () => Object
  })
  items!: TItem[];

  @ApiPropertyOptional({
    description: 'Opaque cursor to retrieve the next window; null when no more data remains',
    nullable: true,
    type: String
  })
  nextCursor?: string | null;
}
