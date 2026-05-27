/**
 * 두루누리 사회보험료 지원 — 자동 판별 유틸 (2026 기준)
 *
 * 「2026년도 산재·고용보험 가입 및 부과업무 실무편람」 제5편 기준
 *
 * 지원 조건:
 *   1) 사업장: 상시근로자 10명 미만
 *   2) 근로자: 월평균 보수 270만원 미만 (2026 기준 — 매년 갱신될 수 있음)
 *   3) 가입 후 36개월 한도
 *   4) 신규가입자 판정: 「신청일 전 12개월 동안 고용보험·국민연금 가입 이력 없음」
 *
 * 지원 비율:
 *   - 신규 가입자: 80% (사업주 + 근로자 부담분 모두)
 *   - 기존 가입자 40% 지원 정책은 현재 「현재 근로자 지원」 기준과 충돌 가능성이 있어
 *     legacy 옵션으로 분리 (기본 0으로 둠).
 *
 * 보험료율 (2026 기준):
 *   - 국민연금 9.5% (사업주 4.75% + 근로자 4.75%)
 *   - 고용보험   1.8% (사업주 0.9%  + 근로자 0.9%) — 우대업종 제외 일반
 *   - 합계      11.3%
 */

import type { TeamMember } from '../api/team.types';

/** 월평균 보수 한도 — 2026 기준 270만원 미만 */
export const DURU_WAGE_CEILING = 2_700_000;
/** 사업장 규모 한도 */
export const DURU_STAFF_CEILING = 10;
/** 지원 한도 개월 수 */
export const DURU_MONTH_LIMIT = 36;
/** 「신규 가입자」 판정 — 신청일 전 N개월 가입 이력 없음 */
export const DURU_LOOKBACK_MONTHS = 12;

/** 두루누리 지원 비율 (2026 기준) */
export const DURU_SUPPORT_RATIO_NEW = 0.8;
export const DURU_SUPPORT_RATIO_LEGACY_EXIST = 0.4;

/** 보험료율 (2026 기준) */
export const PENSION_RATE_TOTAL = 0.095;
export const PENSION_RATE_EMPLOYER = 0.0475;
export const PENSION_RATE_EMPLOYEE = 0.0475;
export const EMPLOYMENT_INSURANCE_RATE_TOTAL = 0.018;
export const TOTAL_PREMIUM_RATE = PENSION_RATE_TOTAL + EMPLOYMENT_INSURANCE_RATE_TOTAL;

export function isSiteEligible(staffCount: number): boolean {
  return staffCount > 0 && staffCount < DURU_STAFF_CEILING;
}

export interface MemberEligibility {
  eligible: boolean;
  reason: string;
  isNew: boolean;
  monthlyWage: number;
}

export interface CheckMemberOptions {
  hasPriorInsuranceHistoryLast12mo?: boolean;
}

export function checkMemberEligibility(
  member: TeamMember,
  monthlyWageEstimate: number,
  siteStaffCount: number,
  opts: CheckMemberOptions = {},
): MemberEligibility {
  if (!isSiteEligible(siteStaffCount)) {
    return {
      eligible: false,
      reason: '상시근로자 ' + siteStaffCount + '명 — 10명 미만 사업장만 가능',
      isNew: false,
      monthlyWage: monthlyWageEstimate,
    };
  }
  if (monthlyWageEstimate >= DURU_WAGE_CEILING) {
    return {
      eligible: false,
      reason: '월 보수 ' + (monthlyWageEstimate / 10000).toFixed(0) + '만원 — 270만원 미만만 가능',
      isNew: false,
      monthlyWage: monthlyWageEstimate,
    };
  }
  const isNew = opts.hasPriorInsuranceHistoryLast12mo === false;
  void member;
  return {
    eligible: true,
    reason: isNew
      ? '신규 가입자 (신청일 전 12개월 가입 이력 없음) — 80% 지원'
      : '기존 가입자 — 현행 정책상 지원 대상 아님 (legacy 시 40%)',
    isNew,
    monthlyWage: monthlyWageEstimate,
  };
}

export interface SupportEstimate {
  totalPremium: number;
  supportAmount: number;
  ratio: number;
}

export function estimateMonthlySupport(
  monthlyWage: number,
  isNew: boolean,
  opts: { legacyExistingRate?: number } = {},
): SupportEstimate {
  const totalPremium = Math.round(monthlyWage * TOTAL_PREMIUM_RATE);
  const ratio = isNew
    ? DURU_SUPPORT_RATIO_NEW
    : Math.max(0, Math.min(1, opts.legacyExistingRate ?? 0));
  const supportAmount = Math.round(totalPremium * ratio);
  return { totalPremium, supportAmount, ratio };
}

export interface SiteSupportSummary {
  eligibleCount: number;
  newCount: number;
  totalMonthlySupport: number;
  siteEligible: boolean;
}

export function summarizeSiteSupport(
  members: TeamMember[],
  siteStaffCount: number,
  monthlyWageOf?: (m: TeamMember) => number,
  hasPriorInsuranceHistoryOf?: (m: TeamMember) => boolean | undefined,
  opts: { legacyExistingRate?: number } = {},
): SiteSupportSummary {
  const wageOf = monthlyWageOf || ((m) => (m.dailyWage || 0) * 22);
  if (!isSiteEligible(siteStaffCount)) {
    return { eligibleCount: 0, newCount: 0, totalMonthlySupport: 0, siteEligible: false };
  }
  let count = 0;
  let newCount = 0;
  let support = 0;
  for (const m of members) {
    if (m.status !== 'ACTIVE') continue;
    const wage = wageOf(m);
    const priorHistory = hasPriorInsuranceHistoryOf?.(m);
    const elig = checkMemberEligibility(m, wage, siteStaffCount, {
      hasPriorInsuranceHistoryLast12mo: priorHistory,
    });
    if (!elig.eligible) continue;
    count++;
    if (elig.isNew) newCount++;
    support += estimateMonthlySupport(wage, elig.isNew, opts).supportAmount;
  }
  return {
    eligibleCount: count,
    newCount,
    totalMonthlySupport: support,
    siteEligible: true,
  };
}
