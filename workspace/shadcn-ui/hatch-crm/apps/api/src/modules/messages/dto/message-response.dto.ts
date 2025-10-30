import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { MessageChannel } from '@hatch/db';
import { PaginatedResponseDto } from '../../common';

export class MessageResponseDto {
  @ApiProperty({ description: 'Message identifier' })
  id!: string;

  @ApiProperty({ description: 'Tenant identifier' })
  tenantId!: string;

  @ApiPropertyOptional({ description: 'Recipient (person) identifier', nullable: true })
  personId?: string | null;

  @ApiPropertyOptional({ description: 'User identifier who authored the message', nullable: true })
  userId?: string | null;

  @ApiProperty({ enum: MessageChannel })
  channel!: MessageChannel;

  @ApiProperty({ enum: ['INBOUND', 'OUTBOUND'] })
  direction!: 'INBOUND' | 'OUTBOUND';

  @ApiPropertyOptional({ description: 'Message subject (email only)', nullable: true })
  subject?: string | null;

  @ApiPropertyOptional({ description: 'Message body', nullable: true })
  body?: string | null;

  @ApiPropertyOptional({ description: 'Recipient address (email or phone)', nullable: true })
  toAddress?: string | null;

  @ApiPropertyOptional({ description: 'Sender address (email or phone)', nullable: true })
  fromAddress?: string | null;

  @ApiProperty({ description: 'Delivery status', enum: ['SENT', 'DELIVERED', 'FAILED', 'QUEUED'] })
  status!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiPropertyOptional()
  updatedAt?: string | null;
}

export class MessageListResponseDto extends PaginatedResponseDto<MessageResponseDto> {
  @ApiProperty({ type: () => MessageResponseDto, isArray: true })
  declare items: MessageResponseDto[];
}
