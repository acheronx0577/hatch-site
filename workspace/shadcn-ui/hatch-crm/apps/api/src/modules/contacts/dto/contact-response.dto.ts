import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';

export class ContactOwnerDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional()
  firstName?: string | null;

  @ApiPropertyOptional()
  lastName?: string | null;

  @ApiPropertyOptional()
  email?: string | null;
}

export class ContactSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional()
  firstName?: string | null;

  @ApiPropertyOptional()
  lastName?: string | null;

  @ApiPropertyOptional()
  primaryEmail?: string | null;

  @ApiPropertyOptional()
  primaryPhone?: string | null;

  @ApiPropertyOptional()
  stage?: string | null;

  @ApiPropertyOptional({ type: [String] })
  tags?: string[] | null;

  @ApiProperty()
  doNotContact!: boolean;

  @ApiPropertyOptional({ type: ContactOwnerDto })
  owner?: ContactOwnerDto | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class SavedViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ type: Object })
  filters?: Record<string, unknown> | null;

  @ApiPropertyOptional()
  isDefault?: boolean | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class ContactListResponseDto extends PaginatedResponseDto<ContactSummaryDto> {
  @ApiProperty({ type: ContactSummaryDto, isArray: true })
  declare items: ContactSummaryDto[];

  @ApiPropertyOptional({ type: SavedViewDto, nullable: true })
  savedView?: SavedViewDto | null;
}

export class ContactTimelineEntryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  type!: string;

  @ApiProperty()
  occurredAt!: string;

  @ApiPropertyOptional({ description: 'Event payload (structure varies per event)' })
  payload?: Record<string, unknown>;
}

export class ContactDetailsDto extends ContactSummaryDto {
  @ApiPropertyOptional({ type: [String] })
  secondaryEmails?: string[] | null;

  @ApiPropertyOptional({ type: [String] })
  secondaryPhones?: string[] | null;

  @ApiPropertyOptional()
  address?: string | null;

  @ApiPropertyOptional()
  notes?: string | null;

  @ApiPropertyOptional({ type: ContactTimelineEntryDto, isArray: true })
  timeline?: ContactTimelineEntryDto[];
}
