/**
 * workRules mock — 공수 계산 정책 표
 *
 * 본 정책 표는 「표준 근로시간 / 반공·만공 / 라운딩 / 휴게」 등을 사업장/현장별로
 * 분리할 수 있도록 한다. 시연용 1건 (전 사업장 공통) 만 등록.
 */

import type { WorkRule } from '../api/workRule.types';

export const WORK_RULES: WorkRule[] = [
  {
    id: 'WR-DEFAULT',
    name: '표준 건설업 공수 규칙 (8시간 = 1.0)',
    standardWorkMinutes: 480,
    halfDayMinMinutes: 240,
    oneDayMinMinutes: 480,
    overtimeMinMinutes: 120,
    maxGongsuPerDay: 1.5,
    roundingUnit: 0.5,
    lunchBreakMinutes: 60,
    nightWorkEnabled: false,
    effectiveFrom: '2024-01-01',
  },
];

/**
 * 사이트/회사에 맞는 work rule 조회.
 * 우선순위: site > company > default.
 */
export function lookupWorkRule(opts: { siteId?: string; companyId?: string } = {}): WorkRule {
  const siteRule = WORK_RULES.find((r) => r.siteId === opts.siteId);
  if (siteRule) return siteRule;
  const companyRule = WORK_RULES.find((r) => r.companyId === opts.companyId && !r.siteId);
  if (companyRule) return companyRule;
  return WORK_RULES[0];
}
