import { Module } from '@nestjs/common';

import { CasesController } from './cases.controller';
import { CasesEmailIntakeController } from './email-intake.controller';
import { CasesService } from './cases.service';

@Module({
  controllers: [CasesController, CasesEmailIntakeController],
  providers: [CasesService],
  exports: [CasesService]
})
export class CasesModule {}
