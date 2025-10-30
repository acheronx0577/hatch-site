import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { SessionController } from './session.controller';

@Module({
  imports: [PrismaModule],
  controllers: [SessionController]
})
export class SessionModule {}
