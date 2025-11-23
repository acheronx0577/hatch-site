import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { PrismaService } from '@/modules/prisma/prisma.service';

@ApiTags('forms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('organizations/:orgId/forms')
export class FormsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Param('orgId') orgId: string) {
    const docs = await this.prisma.knowledgeDocument.findMany({
      where: {
        organizationId: orgId,
        source: { in: ['LAW', 'FORMS_LIBRARY'] }
      },
      include: { orgFile: { select: { id: true, fileId: true, name: true, description: true } } },
      orderBy: { title: 'asc' }
    });

    return docs.map((doc) => ({
      id: doc.id,
      title: doc.title,
      jurisdiction: this.resolveJurisdiction(doc.s3Key, doc.orgFile?.description, doc.source),
      s3Key: doc.s3Key,
      createdAt: doc.createdAt,
      orgFileId: doc.orgFileId,
      fileObjectId: doc.orgFile?.fileId ?? null,
      fileName: doc.orgFile?.name ?? doc.title,
      description: doc.orgFile?.description ?? null,
      downloadPath: doc.orgFile?.fileId ? `/files/${doc.orgFile.fileId}/download` : null
    }));
  }

  private resolveJurisdiction(
    s3Key: string | null,
    description: string | null | undefined,
    fallback?: string | null
  ) {
    const fromDescription = description
      ?.match(/Jurisdiction:\s*([A-Za-z0-9 _-]+)/i)
      ?.[1]
      ?.trim();
    if (fromDescription) return fromDescription;

    const fromKey = s3Key?.split('/')?.[1];
    if (fromKey) {
      const normalized = fromKey.replace(/[-_]/g, ' ').trim();
      if (normalized) return normalized;
    }

    return fallback ?? 'general';
  }
}
