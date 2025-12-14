import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrgEventsModule } from '../org-events/org-events.module';
import { MailModule } from '../mail/mail.module';
import { AuthModule } from '../../platform/auth/auth.module';

@Module({
  imports: [PrismaModule, OrgEventsModule, MailModule, AuthModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService]
})
export class OrganizationsModule {}
