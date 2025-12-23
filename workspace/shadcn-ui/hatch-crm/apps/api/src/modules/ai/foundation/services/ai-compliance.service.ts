import { Injectable } from '@nestjs/common';

export type ComplianceIssueType = 'fair_housing' | 'no_guarantees';
export type ComplianceSeverity = 'high' | 'medium' | 'low';

export type ComplianceIssue = {
  type: ComplianceIssueType;
  severity: ComplianceSeverity;
  message: string;
  matchedText: string;
  suggestion: string;
};

export type ComplianceCheckResult = {
  passed: boolean;
  issues: ComplianceIssue[];
  checkedAt: string;
};

@Injectable()
export class AiComplianceService {
  async checkListingDescription(content: string): Promise<ComplianceCheckResult> {
    const issues: ComplianceIssue[] = [];
    const text = (content ?? '').toString();

    const fairHousingPatterns: Array<{ pattern: RegExp; message: string; severity?: ComplianceSeverity }> = [
      { pattern: /perfect for (families|couples|singles)/i, message: 'Familial status implication', severity: 'high' },
      { pattern: /great for (kids|children)/i, message: 'Familial status implication', severity: 'high' },
      { pattern: /family(-| )friendly/i, message: 'Familial status implication', severity: 'high' },
      { pattern: /no (kids|children|pets)/i, message: 'Familial status restriction (children/pets)', severity: 'high' },
      { pattern: /adults only/i, message: 'Familial status restriction / age implication', severity: 'high' },
      { pattern: /mature community/i, message: 'Age implication', severity: 'high' },
      { pattern: /young professionals/i, message: 'Age implication', severity: 'high' },
      { pattern: /near (church|mosque|synagogue|temple)/i, message: 'Religious reference', severity: 'high' },
      { pattern: /(christian|jewish|muslim) (community|area)/i, message: 'Religious reference', severity: 'high' },
      { pattern: /exclusive (community|neighborhood)/i, message: 'Potentially exclusionary language', severity: 'medium' },
      { pattern: /walking distance to (school|church)/i, message: 'Potential familial/religious implication', severity: 'medium' }
    ];

    for (const { pattern, message, severity } of fairHousingPatterns) {
      const match = text.match(pattern);
      if (!match) continue;
      issues.push({
        type: 'fair_housing',
        severity: severity ?? 'high',
        message,
        matchedText: match[0],
        suggestion: 'Remove or rephrase this text.'
      });
    }

    const guaranteePatterns: Array<{ pattern: RegExp; message: string; severity?: ComplianceSeverity }> = [
      { pattern: /guaranteed/i, message: 'Cannot guarantee outcomes', severity: 'medium' },
      { pattern: /best investment/i, message: 'Avoid investment claims', severity: 'medium' },
      { pattern: /will (appreciate|increase in value)/i, message: 'Cannot predict appreciation', severity: 'medium' },
      { pattern: /won'?t last/i, message: 'Avoid false urgency', severity: 'low' },
      { pattern: /below market/i, message: 'Requires substantiation', severity: 'low' }
    ];

    for (const { pattern, message, severity } of guaranteePatterns) {
      const match = text.match(pattern);
      if (!match) continue;
      issues.push({
        type: 'no_guarantees',
        severity: severity ?? 'medium',
        message,
        matchedText: match[0],
        suggestion: 'Remove or rephrase this claim.'
      });
    }

    const passed = issues.filter((issue) => issue.severity === 'high').length === 0;

    return {
      passed,
      issues,
      checkedAt: new Date().toISOString()
    };
  }
}

