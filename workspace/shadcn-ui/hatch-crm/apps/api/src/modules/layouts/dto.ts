import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertFieldDto {
  @ApiProperty({ description: 'API field name (e.g., email)' })
  field!: string;

  @ApiPropertyOptional({ description: 'Override label to display in the layout' })
  label?: string;

  @ApiPropertyOptional({ description: 'Field visibility flag', default: true })
  visible?: boolean = true;

  @ApiProperty({ description: 'Zero-based order used when rendering' })
  order!: number;

  @ApiPropertyOptional({ description: 'Optional width hint for tables' })
  width?: number;
}

export class UpsertLayoutDto {
  @ApiProperty({ description: 'CRM object key (accounts, contacts, opportunities, etc.)' })
  object!: string;

  @ApiProperty({ enum: ['detail', 'list'], description: 'Layout kind' })
  kind!: 'detail' | 'list';

  @ApiPropertyOptional({ description: 'Optional record type identifier' })
  recordTypeId?: string | null;

  @ApiPropertyOptional({ description: 'Optional profile key (admin, manager, agent, viewer)' })
  profile?: string | null;

  @ApiProperty({ type: [UpsertFieldDto], description: 'Ordered list of fields to persist' })
  fields!: UpsertFieldDto[];
}

export class LayoutFieldDto {
  @ApiProperty({ description: 'API field name' })
  field!: string;

  @ApiPropertyOptional({ description: 'Display label, if any' })
  label?: string;

  @ApiProperty({ description: 'Order after layout resolution' })
  order!: number;

  @ApiPropertyOptional({ description: 'Optional width hint' })
  width?: number;
}

export class LayoutManifestDto {
  @ApiProperty({ description: 'CRM object key' })
  object!: string;

  @ApiProperty({ enum: ['detail', 'list'], description: 'Layout kind' })
  kind!: 'detail' | 'list';

  @ApiProperty({ type: [LayoutFieldDto], description: 'Resolved field manifest' })
  fields!: LayoutFieldDto[];
}

export class ResolveLayoutQueryDto {
  @ApiProperty({ description: 'CRM object key to resolve' })
  object!: string;

  @ApiProperty({ enum: ['detail', 'list'], description: 'Layout kind' })
  kind!: 'detail' | 'list';

  @ApiPropertyOptional({ description: 'Optional record type identifier' })
  recordTypeId?: string;

  @ApiPropertyOptional({ description: 'Optional profile key' })
  profile?: string;
}
