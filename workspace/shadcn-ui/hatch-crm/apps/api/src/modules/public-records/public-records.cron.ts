import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PublicRecordsService } from './public-records.service';

const PUBLIC_RECORDS_CRON_SCHEDULE = '15 7 * * *'; // daily at 07:15 UTC
const PUBLIC_RECORDS_CRON_TIMEZONE = 'UTC';

@Injectable()
export class PublicRecordsCron {
  private readonly logger = new Logger(PublicRecordsCron.name);
  private inFlight = false;

  private cronEnabled() {
    const raw = (process.env.PUBLIC_RECORDS_CRON_ENABLED ?? '').trim().toLowerCase();
    return raw === 'true' || raw === '1' || raw === 'yes';
  }

  private cronFrequency(): 'daily' | 'weekly' {
    const raw = (process.env.PUBLIC_RECORDS_CRON_FREQUENCY ?? 'weekly').trim().toLowerCase();
    return raw === 'daily' ? 'daily' : 'weekly';
  }

  private cronWeekday(): number {
    const raw = (process.env.PUBLIC_RECORDS_CRON_WEEKDAY ?? '1').trim(); // 1 = Monday
    const value = Number(raw);
    if (!Number.isFinite(value)) return 1;
    return Math.min(6, Math.max(0, Math.floor(value)));
  }

  constructor(private readonly publicRecords: PublicRecordsService) {}

  @Cron(PUBLIC_RECORDS_CRON_SCHEDULE, { timeZone: PUBLIC_RECORDS_CRON_TIMEZONE })
  async run() {
    if (!this.cronEnabled()) return;

    if (this.cronFrequency() === 'weekly') {
      const now = new Date();
      const weekday = now.getUTCDay();
      if (weekday !== this.cronWeekday()) return;
    }

    if (this.inFlight) return;
    this.inFlight = true;
    try {
      const result = await this.publicRecords.syncOnce({ reason: 'cron' });
      if (result.status === 'SKIPPED_LOCKED') {
        this.logger.log('Public records sync skipped (another instance holds the lock).');
      } else {
        this.logger.log(
          `Public records sync finished: status=${result.status} datasets=${result.datasetsProcessed} updated=${result.datasetsUpdated}`
        );
      }
    } catch (error) {
      this.logger.error(`Public records sync failed: ${error instanceof Error ? error.message : error}`);
    } finally {
      this.inFlight = false;
    }
  }
}

