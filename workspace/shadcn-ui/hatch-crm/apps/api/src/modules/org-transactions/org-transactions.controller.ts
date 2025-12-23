import { Body, Controller, Get, Param, Patch, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { OptionalJwtAuthGuard } from '@/auth/optional-jwt-auth.guard';
import { OrgTransactionsService } from './org-transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { AttachTransactionDocumentDto } from './dto/attach-transaction-document.dto';

interface AuthedRequest {
  user?: { userId?: string };
  headers?: Record<string, string | undefined>;
}

@ApiTags('org-transactions')
@ApiBearerAuth()
@Controller('organizations/:orgId/transactions')
export class OrgTransactionsController {
  constructor(private readonly svc: OrgTransactionsService) {}

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  create(@Param('orgId') orgId: string, @Req() req: AuthedRequest, @Body() dto: CreateTransactionDto) {
    const headerUser =
      (req.headers?.['x-user-id'] as string | undefined) ??
      (req.headers?.['x-user'] as string | undefined) ??
      undefined;
    const userId = req.user?.userId ?? headerUser ?? undefined;
    if (!userId) {
      if (process.env.NODE_ENV === 'production') throw new UnauthorizedException();
      throw new Error('Missing user context');
    }
    return this.svc.createTransaction(orgId, userId, dto);
  }

  @Patch(':transactionId')
  @UseGuards(OptionalJwtAuthGuard)
  update(
    @Param('orgId') orgId: string,
    @Param('transactionId') transactionId: string,
    @Req() req: AuthedRequest,
    @Body() dto: UpdateTransactionDto
  ) {
    const headerUser =
      (req.headers?.['x-user-id'] as string | undefined) ??
      (req.headers?.['x-user'] as string | undefined) ??
      undefined;
    const userId = req.user?.userId ?? headerUser ?? undefined;
    if (!userId) {
      if (process.env.NODE_ENV === 'production') throw new UnauthorizedException();
      throw new Error('Missing user context');
    }
    return this.svc.updateTransaction(orgId, userId, transactionId, dto);
  }

  @Post(':transactionId/documents')
  @UseGuards(OptionalJwtAuthGuard)
  attachDocument(
    @Param('orgId') orgId: string,
    @Param('transactionId') transactionId: string,
    @Req() req: AuthedRequest,
    @Body() dto: AttachTransactionDocumentDto
  ) {
    const headerUser =
      (req.headers?.['x-user-id'] as string | undefined) ??
      (req.headers?.['x-user'] as string | undefined) ??
      undefined;
    const userId = req.user?.userId ?? headerUser ?? undefined;
    if (!userId) {
      if (process.env.NODE_ENV === 'production') throw new UnauthorizedException();
      throw new Error('Missing user context');
    }
    return this.svc.attachTransactionDocument(orgId, userId, transactionId, dto);
  }

  @Get()
  list(@Param('orgId') orgId: string, @Req() req: AuthedRequest & { headers?: Record<string, string> }) {
    const headerUser =
      (req.headers?.['x-user-id'] as string | undefined) ??
      (req.headers?.['x-user'] as string | undefined) ??
      undefined;
    const userId = req.user?.userId ?? headerUser ?? 'demo-user';
    return this.svc.listTransactions(orgId, userId);
  }

  @Get(':transactionId/activity')
  @UseGuards(OptionalJwtAuthGuard)
  activity(
    @Param('orgId') orgId: string,
    @Param('transactionId') transactionId: string,
    @Req() req: AuthedRequest & { headers?: Record<string, string> }
  ) {
    const headerUser =
      (req.headers?.['x-user-id'] as string | undefined) ??
      (req.headers?.['x-user'] as string | undefined) ??
      undefined;
    const userId = req.user?.userId ?? headerUser ?? 'demo-user';
    return this.svc.listTransactionActivity(orgId, userId, transactionId);
  }
}
