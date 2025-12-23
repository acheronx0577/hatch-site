import { PartialType } from '@nestjs/mapped-types';

import { CreateCustomRiskPackageDto } from './create-custom-risk-package.dto';

export class UpdateCustomRiskPackageDto extends PartialType(CreateCustomRiskPackageDto) {}

