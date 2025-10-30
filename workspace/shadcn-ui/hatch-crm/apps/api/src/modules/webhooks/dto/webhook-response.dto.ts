import { ApiProperty } from '@nestjs/swagger';

import { PaginatedResponseDto } from '../../common';

export class WebhookSubscriptionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty({ type: [String] })
  eventTypes!: string[];

  @ApiProperty()
  url!: string;

  @ApiProperty({ description: 'Whether the subscription is active' })
  isActive!: boolean;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class WebhookSubscriptionListResponseDto extends PaginatedResponseDto<WebhookSubscriptionDto> {
  @ApiProperty({ type: () => WebhookSubscriptionDto, isArray: true })
  declare items: WebhookSubscriptionDto[];
}

export class WebhookStatusResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: string;
}
