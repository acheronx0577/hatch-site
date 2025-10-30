import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateUploadUrlDto {
  @ApiProperty({ description: 'Original filename for the upload' })
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @ApiPropertyOptional({ description: 'MIME type hint for the file' })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiProperty({ description: 'File size in bytes', minimum: 1, type: Number })
  @IsNumber()
  byteSize!: number;
}

export class LinkFileDto {
  @ApiProperty({ description: 'Identifier of the file object to link' })
  @IsString()
  fileId!: string;

  @ApiProperty({ description: 'CRM object key to attach the file against' })
  @IsString()
  object!: string;

  @ApiProperty({ description: 'Identifier of the record receiving the attachment' })
  @IsString()
  recordId!: string;
}

export class FileMetadataDto {
  @ApiProperty({ description: 'File identifier' })
  id!: string;

  @ApiPropertyOptional()
  fileName?: string | null;

  @ApiPropertyOptional()
  mimeType?: string | null;

  @ApiPropertyOptional({ type: Number })
  byteSize?: number | null;

  @ApiPropertyOptional()
  storageKey?: string | null;

  @ApiPropertyOptional()
  status?: string | null;

  @ApiPropertyOptional()
  createdAt?: string;

  @ApiPropertyOptional()
  updatedAt?: string;
}

export class FileUploadResponseDto {
  @ApiProperty({ description: 'Identifier for the just-created file object' })
  fileId!: string;

  @ApiProperty({ description: 'Storage key assigned to the file' })
  storageKey!: string;

  @ApiProperty({ description: 'Pre-signed URL that accepts the file upload' })
  uploadUrl!: string;

  @ApiProperty({
    description: 'Filtered file metadata the current user can access',
    type: () => FileMetadataDto
  })
  metadata!: Record<string, unknown>;
}

export class LinkedFileSummaryDto {
  @ApiProperty({ description: 'File link identifier' })
  id!: string;

  @ApiProperty({ description: 'CRM object the file is attached to' })
  object!: string;

  @ApiProperty({ description: 'Identifier of the linked record' })
  recordId!: string;

  @ApiPropertyOptional({ description: 'Timestamp when the link was created' })
  createdAt?: string;

  @ApiProperty({
    description: 'Filtered file metadata for the link',
    type: () => FileMetadataDto
  })
  file!: Record<string, unknown>;
}
