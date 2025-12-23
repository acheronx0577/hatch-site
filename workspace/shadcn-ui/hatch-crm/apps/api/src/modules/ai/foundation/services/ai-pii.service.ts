import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

export type RedactionStrategy = 'placeholder' | 'hash' | 'mask';

export interface RedactionOptions {
  redactNames?: boolean;
  redactEmails?: boolean;
  redactPhones?: boolean;
  redactAddresses?: boolean;
  redactSsn?: boolean;
  redactLicenseNumbers?: boolean;
  redactAccountNumbers?: boolean;
  strategy?: RedactionStrategy;
  preserveFormat?: boolean;
  allowlist?: Array<string | RegExp>;
}

export type PiiType =
  | 'NAME'
  | 'EMAIL'
  | 'PHONE'
  | 'ADDRESS'
  | 'SSN'
  | 'LICENSE'
  | 'ACCOUNT'
  | 'CREDIT_CARD';

export type PiiMatch = {
  type: PiiType;
  value: string;
  start: number;
  end: number;
};

export type RedactionMap = Record<string, string>;

export type RedactionState = {
  redactionMap: RedactionMap;
  counters: Record<PiiType, number>;
  piiFound: PiiMatch[];
};

export interface RedactionResult {
  redactedText: string;
  redactionMap: RedactionMap;
  piiFound: PiiMatch[];
}

export interface PiiDetectionResult {
  found: boolean;
  matches: PiiMatch[];
}

@Injectable()
export class AiPiiService {
  createRedactionState(): RedactionState {
    return {
      redactionMap: {},
      counters: {
        NAME: 0,
        EMAIL: 0,
        PHONE: 0,
        ADDRESS: 0,
        SSN: 0,
        LICENSE: 0,
        ACCOUNT: 0,
        CREDIT_CARD: 0
      },
      piiFound: []
    };
  }

  redact(text: string, options?: RedactionOptions): RedactionResult {
    const state = this.createRedactionState();
    return this.redactWithState(text, state, options);
  }

  redactWithState(text: string, state: RedactionState, options?: RedactionOptions): RedactionResult {
    const value = text ?? '';
    const opts = this.normalizeOptions(options);

    const matches = this.detect(value, opts).filter((match) => !this.isAllowlisted(match.value, opts.allowlist));
    if (!matches.length) {
      return { redactedText: value, redactionMap: state.redactionMap, piiFound: state.piiFound };
    }

    // Replace from end -> start to keep indexes stable.
    const sorted = [...matches].sort((a, b) => b.start - a.start);
    let out = value;

    for (const match of sorted) {
      const replacement = this.buildReplacement(match, opts, state.counters);
      if (!replacement) {
        continue;
      }

      out = out.slice(0, match.start) + replacement + out.slice(match.end);
      state.redactionMap[replacement] = match.value;
    }

    state.piiFound.push(...matches);
    return { redactedText: out, redactionMap: state.redactionMap, piiFound: state.piiFound };
  }

  restore(text: string, redactionMap: RedactionMap): string {
    let out = text ?? '';
    const entries = Object.entries(redactionMap ?? {});
    // Restore in longest-first order to avoid partial overlaps.
    entries.sort(([a], [b]) => b.length - a.length);
    for (const [placeholder, original] of entries) {
      out = out.split(placeholder).join(original);
    }
    return out;
  }

  containsPii(text: string): PiiDetectionResult {
    const opts = this.normalizeOptions({});
    const matches = this.detect(text ?? '', opts);
    return { found: matches.length > 0, matches };
  }

  private normalizeOptions(options?: RedactionOptions): Required<RedactionOptions> {
    return {
      redactNames: options?.redactNames ?? true,
      redactEmails: options?.redactEmails ?? true,
      redactPhones: options?.redactPhones ?? true,
      redactAddresses: options?.redactAddresses ?? true,
      redactSsn: options?.redactSsn ?? true,
      redactLicenseNumbers: options?.redactLicenseNumbers ?? true,
      redactAccountNumbers: options?.redactAccountNumbers ?? true,
      strategy: options?.strategy ?? 'placeholder',
      preserveFormat: options?.preserveFormat ?? false,
      allowlist: options?.allowlist ?? []
    };
  }

  private detect(text: string, options: Required<RedactionOptions>): PiiMatch[] {
    const matches: PiiMatch[] = [];

    if (options.redactEmails) {
      matches.push(...this.findAll(text, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, 'EMAIL'));
    }

    if (options.redactPhones) {
      matches.push(
        ...this.findAll(
          text,
          /\b(?:\+?1[\s.-]?)?(?:\(\s*\d{3}\s*\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
          'PHONE'
        )
      );
    }

    if (options.redactSsn) {
      matches.push(...this.findAll(text, /\b\d{3}-\d{2}-\d{4}\b/g, 'SSN'));
    }

    if (options.redactLicenseNumbers) {
      // Florida real estate license formats often show up as: SL1234567, BK 1234567
      matches.push(...this.findAll(text, /\b(?:SL|BK)\s*#?\s*\d{4,}\b/gi, 'LICENSE'));
    }

    if (options.redactAccountNumbers) {
      // Routing/account numbers: conservative match (9-17 digits)
      matches.push(...this.findAll(text, /\b\d{9,17}\b/g, 'ACCOUNT'));
    }

    // Credit cards: validate with Luhn to reduce false positives.
    matches.push(...this.findCreditCards(text));

    if (options.redactAddresses) {
      matches.push(
        ...this.findAll(
          text,
          /\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){1,6}\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Ln|Lane|Dr|Drive|Ct|Court|Pl|Place)\b/gi,
          'ADDRESS'
        )
      );
    }

    if (options.redactNames) {
      // Heuristic: two capitalized tokens (e.g. "Jane Smith"). This is intentionally conservative.
      matches.push(...this.findAll(text, /\b[A-Z][a-z]{1,}\s+[A-Z][a-z]{1,}\b/g, 'NAME'));
    }

    return this.dedupeOverlaps(matches);
  }

  private findAll(text: string, regex: RegExp, type: PiiType): PiiMatch[] {
    const out: PiiMatch[] = [];
    const r = new RegExp(regex.source, regex.flags);
    let match: RegExpExecArray | null;
    while ((match = r.exec(text))) {
      const value = match[0];
      if (!value) continue;
      out.push({ type, value, start: match.index, end: match.index + value.length });
    }
    return out;
  }

  private findCreditCards(text: string): PiiMatch[] {
    const candidates: Array<{ value: string; start: number; end: number }> = [];
    const regex = /\b(?:\d[ -]?){13,19}\b/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text))) {
      const raw = match[0];
      const digits = raw.replace(/[ -]/g, '');
      if (digits.length < 13 || digits.length > 19) continue;
      if (!this.luhnValid(digits)) continue;
      candidates.push({ value: raw, start: match.index, end: match.index + raw.length });
    }

    return candidates.map((candidate) => ({ type: 'CREDIT_CARD', ...candidate }));
  }

  private luhnValid(digits: string): boolean {
    let sum = 0;
    let shouldDouble = false;
    for (let i = digits.length - 1; i >= 0; i -= 1) {
      let digit = Number(digits[i]);
      if (!Number.isFinite(digit)) return false;
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  }

  private dedupeOverlaps(matches: PiiMatch[]): PiiMatch[] {
    const sorted = [...matches].sort((a, b) => a.start - b.start || b.end - a.end);
    const out: PiiMatch[] = [];
    let lastEnd = -1;
    for (const match of sorted) {
      if (match.start < lastEnd) {
        continue;
      }
      out.push(match);
      lastEnd = match.end;
    }
    return out;
  }

  private buildReplacement(
    match: PiiMatch,
    options: Required<RedactionOptions>,
    counters: Record<PiiType, number>
  ): string {
    switch (options.strategy) {
      case 'hash': {
        const hash = createHash('sha256').update(match.value).digest('hex').slice(0, 10);
        return `[${match.type}_${hash}]`;
      }
      case 'mask': {
        if (!options.preserveFormat) {
          return `[${match.type}]`;
        }
        return match.value.replace(/[A-Za-z0-9]/g, '•');
      }
      case 'placeholder':
      default: {
        counters[match.type] += 1;
        return `[${match.type}_${counters[match.type]}]`;
      }
    }
  }

  private isAllowlisted(value: string, allowlist: Array<string | RegExp>): boolean {
    for (const entry of allowlist) {
      if (typeof entry === 'string') {
        if (entry === value) {
          return true;
        }
        continue;
      }
      if (entry.test(value)) {
        return true;
      }
    }
    return false;
  }
}
