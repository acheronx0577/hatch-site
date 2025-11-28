import axios from 'axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ContractInstanceStatus, SignatureEnvelopeStatus } from '@hatch/db';

import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';

export interface ContractSigner {
  name: string;
  email: string;
  role: string;
}

@Injectable()
export class ContractsDocuSignService {
  private readonly logger = new Logger(ContractsDocuSignService.name);
  private readonly baseUrl: string;
  private readonly accountId: string;
  private readonly mode: 'stub' | 'live';

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly config: ConfigService
  ) {
    this.baseUrl = this.config.get<string>('DOCUSIGN_BASE_URL', 'https://demo.docusign.net/restapi');
    this.accountId = this.config.get<string>('DOCUSIGN_ACCOUNT_ID', '') ?? '';
    this.mode = (this.config.get<string>('DOCUSIGN_MODE', 'stub') ?? 'stub').toLowerCase() === 'live' ? 'live' : 'stub';
  }

  private async getAccessToken(): Promise<string> {
    if (this.mode === 'stub') return 'stub-token';
    const token = this.config.get<string>('DOCUSIGN_ACCESS_TOKEN');
    if (!token) {
      throw new Error('DOCUSIGN_ACCESS_TOKEN not configured');
    }
    return token;
  }

  private async getAuthHeaders() {
    const accessToken = await this.getAccessToken();
    return {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };
  }

  async createEnvelopeFromInstance(params: {
    contractInstanceId: string;
    draftS3Key: string;
    signers: ContractSigner[];
    emailSubject?: string;
  }): Promise<{ envelopeId: string }> {
    const { contractInstanceId, draftS3Key, signers, emailSubject } = params;

    if (this.mode === 'stub') {
      const envelopeId = `stub-${contractInstanceId}-${Date.now()}`;
      await this.prisma.signatureEnvelope.create({
        data: {
          contractInstanceId,
          provider: 'DOCUSIGN',
          providerEnvelopeId: envelopeId,
          status: SignatureEnvelopeStatus.SENT,
          signers: signers as any
        }
      });

      // Immediately mark as signed in stub mode for happy-path flows
      await this.prisma.contractInstance.update({
        where: { id: contractInstanceId },
        data: {
          status: ContractInstanceStatus.SIGNED,
          signedS3Key: draftS3Key
        }
      });

      return { envelopeId };
    }

    const pdfBytes = await this.s3.getObjectBuffer(draftS3Key);
    const documentBase64 = pdfBytes.toString('base64');
    const headers = await this.getAuthHeaders();

    const recipients = {
      signers: signers.map((s, idx) => ({
        email: s.email,
        name: s.name,
        recipientId: String(idx + 1),
        routingOrder: String(idx + 1)
      }))
    };

    const body = {
      emailSubject: emailSubject ?? 'Please sign your contract',
      documents: [
        {
          documentBase64,
          name: 'Contract.pdf',
          fileExtension: 'pdf',
          documentId: '1'
        }
      ],
      recipients,
      status: 'sent'
    };

    const url = `${this.baseUrl}/v2.1/accounts/${this.accountId}/envelopes`;
    const response = await axios.post(url, body, { headers });
    const envelopeId = response.data.envelopeId as string;

    await this.prisma.signatureEnvelope.create({
      data: {
        contractInstanceId,
        provider: 'DOCUSIGN',
        providerEnvelopeId: envelopeId,
        status: SignatureEnvelopeStatus.SENT,
        signers: signers as any
      }
    });

    return { envelopeId };
  }

  async createRecipientView(params: {
    envelopeId: string;
    returnUrl: string;
    signer: { name: string; email: string };
  }): Promise<{ url: string }> {
    if (this.mode === 'stub') {
      return { url: params.returnUrl };
    }

    const headers = await this.getAuthHeaders();
    const url = `${this.baseUrl}/v2.1/accounts/${this.accountId}/envelopes/${params.envelopeId}/views/recipient`;

    const body = {
      returnUrl: params.returnUrl,
      authenticationMethod: 'none',
      email: params.signer.email,
      userName: params.signer.name,
      clientUserId: '1'
    };

    const response = await axios.post(url, body, { headers });
    return { url: response.data.url as string };
  }

  async downloadCompletedEnvelopePdf(envelopeId: string): Promise<Buffer> {
    if (this.mode === 'stub') {
      throw new Error('downloadCompletedEnvelopePdf not supported in stub mode');
    }
    const headers = await this.getAuthHeaders();
    const url = `${this.baseUrl}/v2.1/accounts/${this.accountId}/envelopes/${envelopeId}/documents/combined`;

    const response = await axios.get(url, {
      headers,
      responseType: 'arraybuffer'
    });

    return Buffer.from(response.data);
  }

  async handleEnvelopeStatusUpdate(params: { envelopeId: string; status: string; isFinal: boolean }) {
    const { envelopeId, status, isFinal } = params;

    const envelope = await this.prisma.signatureEnvelope.findFirst({
      where: { providerEnvelopeId: envelopeId }
    });

    if (!envelope) {
      this.logger.warn(`Unknown DocuSign envelopeId=${envelopeId}`);
      return;
    }

    const normalizedStatus =
      status === 'completed'
        ? SignatureEnvelopeStatus.COMPLETED
        : status === 'voided' || status === 'declined'
          ? SignatureEnvelopeStatus.VOIDED
          : status === 'sent'
            ? SignatureEnvelopeStatus.SENT
            : SignatureEnvelopeStatus.SENT;

    await this.prisma.signatureEnvelope.update({
      where: { id: envelope.id },
      data: { status: normalizedStatus }
    });

    const instance = await this.prisma.contractInstance.findUnique({
      where: { id: envelope.contractInstanceId }
    });
    if (!instance) return;

    if (isFinal) {
      if (this.mode === 'stub') {
        await this.prisma.contractInstance.update({
          where: { id: instance.id },
          data: {
            status: status === 'completed' ? ContractInstanceStatus.SIGNED : ContractInstanceStatus.VOIDED,
            signedS3Key: instance.signedS3Key ?? instance.draftS3Key
          }
        });
        return;
      }

      try {
        const pdf = await this.downloadCompletedEnvelopePdf(envelopeId);
        const signedS3Key = `contracts/${instance.organizationId}/signed/${instance.id}-${Date.now()}.pdf`;

        await this.s3.putObject({
          key: signedS3Key,
          body: pdf,
          contentType: 'application/pdf'
        });

        await this.prisma.contractInstance.update({
          where: { id: instance.id },
          data: {
            status: status === 'completed' ? ContractInstanceStatus.SIGNED : ContractInstanceStatus.VOIDED,
            signedS3Key
          }
        });
      } catch (err) {
        this.logger.error(`Failed to download/store DocuSign PDF for envelope=${envelopeId}`, err as any);
      }
      return;
    }

    if (status === 'voided' || status === 'declined') {
      await this.prisma.contractInstance.update({
        where: { id: instance.id },
        data: { status: ContractInstanceStatus.VOIDED }
      });
    } else if (status === 'sent') {
      await this.prisma.contractInstance.update({
        where: { id: instance.id },
        data: { status: ContractInstanceStatus.OUT_FOR_SIGNATURE }
      });
    }
  }
}
