import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class UpdateRiskPackagesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  activePackageIds!: string[];
}

