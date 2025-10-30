import {
  Body,
  Controller,
  Headers,
  Post,
  Req,
  UnauthorizedException,
  UseInterceptors
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { AuditInterceptor } from '../../platform/audit/audit.interceptor';
import { Permit } from '../../platform/security/permit.decorator';
import { resolveRequestContext } from '../common/request-context';
import { CasesService } from './cases.service';
import { CreateCaseDto } from './dto';

interface EmailIntakeDto {
  subject: string;
  description?: string;
  accountId?: string;
  contactId?: string;
  email?: string;
}

@Controller('cases/intake/email')
@UseInterceptors(AuditInterceptor)
export class CasesEmailIntakeController {
  constructor(private readonly cases: CasesService) {}

  @Post()
  @Permit('cases', 'create')
  async intake(
    @Req() req: FastifyRequest,
    @Headers('x-intake-token') token: string | undefined,
    @Body() body: EmailIntakeDto
  ) {
    const expected = process.env.CASES_EMAIL_INTAKE_TOKEN;
    if (expected && token !== expected) {
      throw new UnauthorizedException('Invalid intake token');
    }

    // TODO: Upsert contact by email (body.email) with Contacts service when available.
    const ctx = resolveRequestContext(req);
    await this.cases.create(ctx, {
      subject: body.subject,
      description: body.description,
      accountId: body.accountId,
      contactId: body.contactId,
      origin: 'Email'
    } as CreateCaseDto);

    return { accepted: true };
  }
}
