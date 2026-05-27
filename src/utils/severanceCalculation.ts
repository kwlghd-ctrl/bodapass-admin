/**
 * severanceCalculation — 퇴직공제부금 예상액 계산
 *
 * 핵심:
 *   퇴직공제부금 예상액 = severanceWorkDays × appliedDailyFund
 *
 *   ─ 「인건비 × 0.5%」 같은 방식은 절대 사용 X. 출역일 × 일액.
 *   ─ severanceWorkDays 는 출역일수와 동일하게 둘 수 있지만 타입은 분리.
 *   ─ 화면에 「예상 퇴직공제부금」으로만 표시. 「확정 신고금액」 표현 금지.
 *
 * 일액 결정:
 *   resolveSeveranceFundDaily(site, globalSetting) 가 SITE_OVERRIDE → GLOBAL → AUTO 우선순위로.
 *
 * 사용 예:
 *   const result = calculateSeveranceFund({
 *     employmentId: 'E-M-001',
 *     yearMonth: '2026-05',
 *     severanceWorkDays: 22,
 *     site: { bidNoticeDate: '2026-04-01', ... },
 *   });
 *   // → { fundDaily: 8700, amount: 191400, policyVersion, warning: [...] }
 */

import type { SeveranceCalculationResult, CalculationWarning } from '../api/legal.types';
import type { Site } from '../api/site.types';
import {
  loadFundSetting,
  resolveSeveranceFundDaily,
  type SeveranceFundSetting,
} from './severance';
import { lookupPolicy } from '../mock/legalPolicies';

export interface CalculateSeveranceInput {
  employmentId: string;
  yearMonth: string;
  /** 퇴직공제 산정 일수 — 출역일수와 동일하게 둘 수 있지만 타입은 분리 */
  severanceWorkDays: number;
  /** 현장 정보 — 일액 자동 판단용 */
  site?: Pick<Site,
    | 'bidNoticeDate' | 'contractDate'
    | 'severanceFundMode' | 'severanceFundCustomAmount'
    | 'severanceApplicable'
  > | null;
  /** 전역 설정 — 미제공 시 자동으로 loadFundSetting() 호출 */
  globalSetting?: SeveranceFundSetting | null;
}

/**
 * 퇴직공제부금 예상액 계산.
 * 결과의 모든 필드는 「예상값」 으로 사용. 확정 신고 전 검증 필요.
 */
export function calculateSeveranceFund(input: CalculateSeveranceInput): SeveranceCalculationResult {
  const warnings: CalculationWarning[] = [];
  const globalSetting = input.globalSetting ?? loadFundSetting();
  const decision = resolveSeveranceFundDaily({
    site: input.site ?? null,
    globalSetting,
  });

  // 일액 결정 경고 → CalculationWarning 으로 변환
  if (decision.warning) {
    warnings.push({
      code: decision.confidence === 'low' ? 'MISSING_BID_NOTICE_DATE' : 'ESTIMATED_VALUE_USED',
      field: 'site.bidNoticeDate',
      message: decision.warning,
      severity: decision.confidence === 'low' ? 'warning' : 'info',
    });
  }

  // 사이트가 퇴직공제 적용 비대상이면 0
  if (input.site && input.site.severanceApplicable === false) {
    warnings.push({
      code: 'OTHER',
      field: 'site.severanceApplicable',
      message: '본 현장은 퇴직공제 적용 비대상으로 설정되어 있습니다. 부금 0원.',
      severity: 'info',
    });
    return {
      employmentId: input.employmentId,
      yearMonth: input.yearMonth,
      workDays: input.severanceWorkDays,
      appliedDailyFund: 0,
      amount: 0,
      basisDate: decision.basisDate,
      policyVersion: 'SEV-NOT_APPLICABLE',
      warning: warnings,
    };
  }

  // 일수가 0 이면 0
  if (input.severanceWorkDays <= 0) {
    warnings.push({
      code: 'OTHER',
      field: 'severanceWorkDays',
      message: '퇴직공제 산정 일수가 0. 출역 기록을 먼저 확인하세요.',
      severity: 'info',
    });
  }

  // 정책 버전 추적
  const policyDate = input.site?.bidNoticeDate ?? input.site?.contractDate ?? `${input.yearMonth}-01`;
  const policyLookup = lookupPolicy('SEVERANCE_FUND_DAILY', policyDate);
  const policyVersion = policyLookup?.policy.version ?? 'SEV-FUND-UNKNOWN';

  const amount = Math.max(0, Math.round(input.severanceWorkDays * decision.fundDaily));

  return {
    employmentId: input.employmentId,
    yearMonth: input.yearMonth,
    workDays: input.severanceWorkDays,
    appliedDailyFund: decision.fundDaily,
    amount,
    basisDate: decision.basisDate,
    policyVersion,
    warning: warnings,
  };
}
