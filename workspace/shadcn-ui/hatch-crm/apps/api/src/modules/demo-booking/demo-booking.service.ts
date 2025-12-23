import { BadRequestException, ConflictException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { JWT } from 'google-auth-library';
import { v4 as uuid } from 'uuid';

import type { DemoBookingAvailabilityQueryDto, DemoBookingRequestDto } from './dto/demo-booking.dto';

type BusyInterval = { start: Date; end: Date };

const DEFAULT_TIME_ZONE = 'America/New_York';
const DEFAULT_DAYS_AHEAD = 14;
const DEFAULT_SLOT_MINUTES = 30;
const DEFAULT_WORK_START_HOUR = 9;
const DEFAULT_WORK_END_HOUR = 17;
const DEFAULT_MIN_LEAD_MINUTES = 30;
const DEFAULT_EXCLUDE_WEEKENDS = true;

const pad2 = (value: number) => String(value).padStart(2, '0');

const isValidTimeZone = (timeZone: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

const resolveIsoOrNull = (value: unknown) => (typeof value === 'string' && value.trim().length > 0 ? value.trim() : null);

@Injectable()
export class DemoBookingService {
  private readonly logger = new Logger(DemoBookingService.name);
  private readonly enabled: boolean;

  private readonly calendarId: string | null;
  private readonly timeZone: string;
  private readonly daysAhead: number;
  private readonly slotMinutes: number;
  private readonly workStartHour: number;
  private readonly workEndHour: number;
  private readonly minLeadMinutes: number;
  private readonly excludeWeekends: boolean;
  private readonly jwtClient: JWT | null;

  constructor(private readonly config: ConfigService) {
    this.calendarId = (this.config.get<string>('DEMO_BOOKING_GOOGLE_CALENDAR_ID') ?? '').trim() || null;
    this.timeZone = this.resolveTimeZone((this.config.get<string>('DEMO_BOOKING_TIME_ZONE') ?? '').trim());
    this.daysAhead = this.resolveInt(this.config.get<string>('DEMO_BOOKING_DAYS_AHEAD'), DEFAULT_DAYS_AHEAD, { min: 1, max: 30 });
    this.slotMinutes = this.resolveInt(this.config.get<string>('DEMO_BOOKING_SLOT_MINUTES'), DEFAULT_SLOT_MINUTES, { min: 10, max: 120 });
    this.workStartHour = this.resolveInt(this.config.get<string>('DEMO_BOOKING_WORK_START_HOUR'), DEFAULT_WORK_START_HOUR, { min: 0, max: 23 });
    this.workEndHour = this.resolveInt(this.config.get<string>('DEMO_BOOKING_WORK_END_HOUR'), DEFAULT_WORK_END_HOUR, { min: 1, max: 24 });
    this.minLeadMinutes = this.resolveInt(this.config.get<string>('DEMO_BOOKING_MIN_LEAD_MINUTES'), DEFAULT_MIN_LEAD_MINUTES, { min: 0, max: 24 * 60 });
    this.excludeWeekends = (this.config.get<string>('DEMO_BOOKING_EXCLUDE_WEEKENDS') ?? String(DEFAULT_EXCLUDE_WEEKENDS)).toLowerCase() === 'true';

    const clientEmail = (this.config.get<string>('DEMO_BOOKING_GOOGLE_CLIENT_EMAIL') ?? '').trim() || null;
    const privateKeyRaw = (this.config.get<string>('DEMO_BOOKING_GOOGLE_PRIVATE_KEY') ?? '').trim() || null;
    const impersonateUser = (this.config.get<string>('DEMO_BOOKING_GOOGLE_IMPERSONATE_USER') ?? '').trim() || null;

    if (!this.calendarId) {
      this.enabled = false;
      this.jwtClient = null;
      this.logger.warn('DEMO_BOOKING_GOOGLE_CALENDAR_ID is not configured; demo booking endpoints are disabled.');
      return;
    }

    if (!clientEmail || !privateKeyRaw) {
      this.enabled = false;
      this.jwtClient = null;
      this.logger.warn(
        'DEMO_BOOKING_GOOGLE_CLIENT_EMAIL / DEMO_BOOKING_GOOGLE_PRIVATE_KEY are not configured; demo booking endpoints are disabled.'
      );
      return;
    }

    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
    this.jwtClient = new JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/calendar'],
      subject: impersonateUser || undefined
    });
    this.enabled = true;
  }

  async getAvailability(query: DemoBookingAvailabilityQueryDto) {
    this.ensureEnabled();

    const timeZone = this.timeZone;
    const daysAhead =
      typeof query.days === 'number' && Number.isFinite(query.days)
        ? Math.max(1, Math.min(30, query.days))
        : this.daysAhead;

    const now = new Date();
    const minStartTime = this.minLeadMinutes > 0 ? new Date(now.getTime() + this.minLeadMinutes * 60 * 1000) : now;

    const startDateKey = this.getDateKeyInTimeZone(now, timeZone);
    const endDateKey = this.addDaysToDateKey(startDateKey, daysAhead - 1);

    const rangeStartUtc = this.zonedLocalToUtc({ dateKey: startDateKey, hour: this.workStartHour, minute: 0, second: 0 }, timeZone);
    const rangeEndUtc = this.zonedLocalToUtc({ dateKey: endDateKey, hour: this.workEndHour, minute: 0, second: 0 }, timeZone);

    const busyIntervals = await this.queryFreeBusy({
      timeMinIso: rangeStartUtc.toISOString(),
      timeMaxIso: rangeEndUtc.toISOString(),
      timeZone
    });

    const days: Array<{ date: string; slots: string[] }> = [];
    for (let offset = 0; offset < daysAhead; offset += 1) {
      const dateKey = this.addDaysToDateKey(startDateKey, offset);

      if (this.excludeWeekends && this.isWeekend(dateKey, timeZone)) {
        continue;
      }

      const slots: string[] = [];
      const startMinuteOfDay = this.workStartHour * 60;
      const endMinuteOfDay = this.workEndHour * 60;

      for (let minuteOfDay = startMinuteOfDay; minuteOfDay + this.slotMinutes <= endMinuteOfDay; minuteOfDay += this.slotMinutes) {
        const hour = Math.floor(minuteOfDay / 60);
        const minute = minuteOfDay % 60;
        const slotStartUtc = this.zonedLocalToUtc({ dateKey, hour, minute, second: 0 }, timeZone);
        const slotEndUtc = new Date(slotStartUtc.getTime() + this.slotMinutes * 60 * 1000);

        if (slotStartUtc.getTime() < minStartTime.getTime()) continue;
        if (this.overlapsBusy(slotStartUtc, slotEndUtc, busyIntervals)) continue;

        slots.push(slotStartUtc.toISOString());
      }

      days.push({ date: dateKey, slots });
    }

    return {
      ok: true,
      calendarTimeZone: timeZone,
      slotMinutes: this.slotMinutes,
      workStartHour: this.workStartHour,
      workEndHour: this.workEndHour,
      daysAhead,
      days
    };
  }

  async bookDemo(dto: DemoBookingRequestDto, req: { ip?: string; headers?: Record<string, unknown> } = {}) {
    this.ensureEnabled();

    if (dto.website && dto.website.trim().length > 0) {
      throw new BadRequestException('Invalid submission');
    }

    const timeZone = this.timeZone;

    const startIso = resolveIsoOrNull(dto.start);
    if (!startIso) {
      throw new BadRequestException('Missing start time');
    }

    const startUtc = new Date(startIso);
    if (Number.isNaN(startUtc.getTime())) {
      throw new BadRequestException('Invalid start time');
    }

    const now = new Date();
    if (startUtc.getTime() < now.getTime()) {
      throw new BadRequestException('Start time must be in the future');
    }

    const { hour, minute } = this.getTimePartsInZone(startUtc, timeZone);
    if (hour < this.workStartHour || hour >= this.workEndHour) {
      throw new BadRequestException('Start time is outside business hours');
    }
    if (this.slotMinutes > 1 && minute % this.slotMinutes !== 0) {
      throw new BadRequestException('Start time must align to slot duration');
    }

    const endUtc = new Date(startUtc.getTime() + this.slotMinutes * 60 * 1000);

    const busy = await this.queryFreeBusy({
      timeMinIso: startUtc.toISOString(),
      timeMaxIso: endUtc.toISOString(),
      timeZone
    });
    if (this.overlapsBusy(startUtc, endUtc, busy)) {
      throw new ConflictException('That time is no longer available. Please pick another.');
    }

    const descriptionLines: string[] = [
      'Hatch demo booking',
      '',
      `Name: ${dto.fullName}`,
      `Email: ${dto.email}`,
      `Brokerage: ${dto.brokerageName}`,
      dto.agentCount ? `Agents: ${dto.agentCount}` : '',
      dto.challenge ? `Challenge: ${dto.challenge}` : '',
      dto.notes ? `Notes: ${dto.notes}` : '',
      '',
      dto.pageUrl ? `Page: ${dto.pageUrl}` : '',
      dto.referrer ? `Referrer: ${dto.referrer}` : '',
      dto.utmSource ? `UTM Source: ${dto.utmSource}` : '',
      dto.utmMedium ? `UTM Medium: ${dto.utmMedium}` : '',
      dto.utmCampaign ? `UTM Campaign: ${dto.utmCampaign}` : '',
      dto.utmContent ? `UTM Content: ${dto.utmContent}` : '',
      dto.utmTerm ? `UTM Term: ${dto.utmTerm}` : ''
    ].filter(Boolean);

    const eventPayload = {
      summary: `Hatch Demo — ${dto.brokerageName}`.slice(0, 1024),
      description: descriptionLines.join('\n').slice(0, 8192),
      start: { dateTime: startUtc.toISOString(), timeZone },
      end: { dateTime: endUtc.toISOString(), timeZone },
      attendees: [{ email: dto.email, displayName: dto.fullName }],
      guestsCanModify: false,
      guestsCanInviteOthers: false,
      guestsCanSeeOtherGuests: false,
      extendedProperties: {
        private: {
          hatchDemoBooking: 'true',
          brokerageName: dto.brokerageName,
          agentCount: dto.agentCount ?? '',
          challenge: dto.challenge ?? '',
          pageUrl: dto.pageUrl ?? '',
          referrer: dto.referrer ?? '',
          ip: String(req.ip ?? ''),
          userAgent: String((req.headers?.['user-agent' as any] as any) ?? '')
        }
      },
      conferenceData: {
        createRequest: {
          requestId: uuid(),
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      }
    };

    const accessToken = await this.getGoogleAccessToken();
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId!)}/events`;
    const response = await axios.post(url, eventPayload, {
      params: { conferenceDataVersion: 1, sendUpdates: 'all' },
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const created = response.data as any;
    return {
      ok: true,
      event: {
        id: created.id ?? null,
        htmlLink: created.htmlLink ?? null,
        hangoutLink: created.hangoutLink ?? created.conferenceData?.entryPoints?.find((p: any) => p.entryPointType === 'video')?.uri ?? null,
        start: created.start?.dateTime ?? startUtc.toISOString(),
        end: created.end?.dateTime ?? endUtc.toISOString()
      }
    };
  }

  private ensureEnabled() {
    if (!this.enabled || !this.jwtClient || !this.calendarId) {
      throw new ServiceUnavailableException('Demo booking is not configured');
    }
  }

  private resolveTimeZone(candidate: string) {
    const timeZone = candidate || this.config.get<string>('DEMO_BOOKING_TIME_ZONE') || DEFAULT_TIME_ZONE;
    return isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
  }

  private resolveInt(value: string | undefined, fallback: number, limits: { min: number; max: number }) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) return fallback;
    if (parsed < limits.min) return limits.min;
    if (parsed > limits.max) return limits.max;
    return parsed;
  }

  private async getGoogleAccessToken() {
    const token = await this.jwtClient!.getAccessToken();
    if (!token) {
      throw new ServiceUnavailableException('Unable to authenticate with Google Calendar');
    }
    return token;
  }

  private async queryFreeBusy(params: { timeMinIso: string; timeMaxIso: string; timeZone: string }): Promise<BusyInterval[]> {
    const accessToken = await this.getGoogleAccessToken();
    const url = 'https://www.googleapis.com/calendar/v3/freeBusy';
    const payload = {
      timeMin: params.timeMinIso,
      timeMax: params.timeMaxIso,
      timeZone: params.timeZone,
      items: [{ id: this.calendarId }]
    };

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const calendars = (response.data as any)?.calendars ?? {};
    const busyRaw = calendars?.[this.calendarId!]?.busy ?? [];
    if (!Array.isArray(busyRaw)) return [];

    return busyRaw
      .map((interval: any) => {
        const start = resolveIsoOrNull(interval?.start);
        const end = resolveIsoOrNull(interval?.end);
        if (!start || !end) return null;
        const startDate = new Date(start);
        const endDate = new Date(end);
        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
        return { start: startDate, end: endDate } satisfies BusyInterval;
      })
      .filter(Boolean) as BusyInterval[];
  }

  private overlapsBusy(start: Date, end: Date, busy: BusyInterval[]) {
    for (const interval of busy) {
      if (start < interval.end && end > interval.start) return true;
    }
    return false;
  }

  private getDateKeyInTimeZone(date: Date, timeZone: string) {
    const parts = this.getDateTimePartsInZone(date, timeZone);
    return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
  }

  private addDaysToDateKey(dateKey: string, days: number) {
    const [year, month, day] = dateKey.split('-').map((value) => Number.parseInt(value, 10));
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return dateKey;
    const base = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    base.setUTCDate(base.getUTCDate() + days);
    return `${base.getUTCFullYear()}-${pad2(base.getUTCMonth() + 1)}-${pad2(base.getUTCDate())}`;
  }

  private isWeekend(dateKey: string, timeZone: string) {
    const noonUtc = this.zonedLocalToUtc({ dateKey, hour: 12, minute: 0, second: 0 }, timeZone);
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(noonUtc);
    return weekday.startsWith('Sat') || weekday.startsWith('Sun');
  }

  private getTimePartsInZone(date: Date, timeZone: string) {
    const parts = this.getDateTimePartsInZone(date, timeZone);
    return { hour: parts.hour, minute: parts.minute };
  }

  private getDateTimePartsInZone(date: Date, timeZone: string) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const parts = formatter.formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';

    return {
      year: Number.parseInt(get('year'), 10),
      month: Number.parseInt(get('month'), 10),
      day: Number.parseInt(get('day'), 10),
      hour: Number.parseInt(get('hour'), 10),
      minute: Number.parseInt(get('minute'), 10),
      second: Number.parseInt(get('second'), 10)
    };
  }

  private zonedLocalToUtc(
    local: { dateKey: string; hour: number; minute: number; second: number },
    timeZone: string
  ): Date {
    const [year, month, day] = local.dateKey.split('-').map((value) => Number.parseInt(value, 10));
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      throw new BadRequestException('Invalid date');
    }

    const desiredUtcMs = Date.UTC(year, month - 1, day, local.hour, local.minute, local.second);
    const guess = new Date(desiredUtcMs);
    const guessParts = this.getDateTimePartsInZone(guess, timeZone);
    const guessAsUtcMs = Date.UTC(
      guessParts.year,
      guessParts.month - 1,
      guessParts.day,
      guessParts.hour,
      guessParts.minute,
      guessParts.second
    );

    const diffMs = desiredUtcMs - guessAsUtcMs;
    const corrected = new Date(guess.getTime() + diffMs);

    // Second pass to stabilize around DST transitions.
    const correctedParts = this.getDateTimePartsInZone(corrected, timeZone);
    const correctedAsUtcMs = Date.UTC(
      correctedParts.year,
      correctedParts.month - 1,
      correctedParts.day,
      correctedParts.hour,
      correctedParts.minute,
      correctedParts.second
    );
    const diff2Ms = desiredUtcMs - correctedAsUtcMs;
    return diff2Ms ? new Date(corrected.getTime() + diff2Ms) : corrected;
  }
}
