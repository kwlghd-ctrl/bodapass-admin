/**
 * insuranceEligibility — 4대보험 대상 여부 판정 (예상값)
 *
 * 목적:
 *   · 보험료 계산 「얼마인가?」 와 보험 대상 「누구인가?」 를 분리.
 *   · calculateMonthlyWageLedger() 가 본 결과를 받아 보험료를 계산.
 *
 * 주의:
 *   · 본 함수는 완전한 법적 판정이 아니라 「예상 대상 여부」 로 표시한다.
 *   · 생년월일, 근로일수, 근로시간, 외국인 체류자격 정보가 없으면 warning.
 *   · 실서비스 전환 시 NPS/HIRA/EI API 연동으로 권위 데이터로 대체.
 *
 * 일용근로자 대략 기준 (시연용):
 *   · 국민연금  : 월 8일 이상 또는 월 60시간 이상 + 만 18세 이상 60세 미만
 *   · 건강보험  : 월 60시간 이상 (장기요양보험 자동 동반)
 *   · 고용보험  : 모든 일용근로자 (1일 이상)
 *   · 산재보험  : 모든 근로자 (사업주 100% 부담)
 *
 *   외국인 단기 체류 자격(F-1·관광 등)은 4대보험 일부/전체 적용 불가.
 *   본 모듈은 그런 케이스를 warning 으로 표시.
 */

import type { CalculationWarning } from '../api/legal.types';

/* ════════════════════════════════════════════════
 *  입력 / 결과 타입
 * ════════════════════════════════════════════════ */

export interface InsuranceEligibilityInput {
  /** 생년월일 — 만 18세/60세 경계 판정용 */
  birthDate?: string | null;
  /** 거주자 유형 — RESIDENT (내국인/거주자 외국인) / NON_RESIDENT */
  residentType?: 'RESIDENT' | 'NON_RESIDENT' | null;
  /** 체류자격(VISA) — F-2, F-5, E-9, F-1 등 */
  visaType?: string | null;
  /** 임금 유형 — DAILY (일급) / MONTHLY (월급) / HOURLY (시급) */
  wageType?: 'DAILY' | 'MONTHLY' | 'HOURLY' | null;
  /** 근로 시작일 / 종료일 */
  workStartDate?: string | null;
  workEndDate?: string | null;
  /** 해당 월 출역일수 */
  attendanceDays?: number;
  /** 해당 월 누적 근로 분 */
  workedMinutesTotal?: number;
  /** Employment 의 insuranceApplied 플래그 — false 면 전체 비대상 처리 */
  insuranceApplied?: boolean;
  /** Worker.insuranceProfile (선택 정보) */
  insuranceProfile?: {
    /** 신청일 전 12개월 보험 가입 이력 여부 */
    insuranceHistoryLast12Months?: boolean | null;
    /** 별도 적용 제외 사유 */
    excludeReason?: string;
  } | null;
  /** 기준일 (해당 월 1일 등) — 만 나이 계산 기준 */
  asOfDate?: string;
}

export interface InsuranceEligibilityResult {
  /** 국민연금 대상 여부 (예상) */
  nationalPensionTarget: boolean;
  /** 건강보험 대상 여부 (예상) — 장기요양보험은 본 결과 + 별도 부과 */
  healthInsuranceTarget: boolean;
  /** 고용보험 대상 여부 (예상) */
  employmentInsuranceTarget: boolean;
  /** 산재보험 대상 여부 (예상) — 거의 항상 true */
  industrialAccidentTarget: boolean;
  /** 사람이 읽을 수 있는 판정 근거 */
  reasons: string[];
  /** 입력 누락·추정값 사용 시 경고 */
  warnings: CalculationWarning[];
}

/* ════════════════════════════════════════════════
 *  본 함수
 * ════════════════════════════════════════════════ */

/**
 * 4대보험 대상 여부 판정.
 *
 * 결과는 「예상」 기준이며, 실제 신고 전 검증 필요.
 */
export function determineInsuranceEligibility(
  input: InsuranceEligibilityInput,
): InsuranceEligibilityResult {
  const reasons: string[] = [];
  const warnings: CalculationWarning[] = [];

  // 0) Employment 가 보험 비적용으로 명시 설정된 경우 전체 비대상
  if (input.insuranceApplied === false) {
    reasons.push('Employment.insuranceApplied=false — 전체 보험 비대상');
    return {
      nationalPensionTarget: false,
      healthInsuranceTarget: false,
      employmentInsuranceTarget: false,
      industrialAccidentTarget: false,
      reasons,
      warnings,
    };
  }

  // 1) 입력 데이터 누락 워닝
  if (!input.birthDate) {
    warnings.push({
      code: 'MISSING_BIRTH_DATE',
      field: 'worker.birthDate',
      message: '생년월일 없음 — 만 18세/60세 자격 판정 제한. 보수적으로 대상 처리.',
      severity: 'warning',
    });
  }
  const attendanceDays = input.attendanceDays ?? 0;
  const workedMinutes = input.workedMinutesTotal ?? 0;
  if (attendanceDays === 0) {
    warnings.push({
      code: 'OTHER',
      field: 'monthlyAttendance.attendanceDays',
      message: '월 출역일수 0 — 대상 판정에 한계가 있을 수 있습니다.',
      severity: 'info',
    });
  }

  // 2) 만 나이 계산 (asOfDate 기준)
  const ageYears = computeAgeYears(input.birthDate, input.asOfDate);

  // 3) 외국인 체류자격 검토 — 단기/관광 자격은 보험 적용 불가
  const restrictedVisa = isRestrictedVisa(input.visaType);
  if (restrictedVisa) {
    reasons.push(`체류자격 ${input.visaType} — 4대보험 일부/전체 적용 제외 가능성`);
    warnings.push({
      code: 'OTHER',
      field: 'worker.visaType',
      message: `체류자격 ${input.visaType} — 적용 가능 여부를 별도 확인하세요.`,
      severity: 'warning',
    });
  }

  // 4) 국민연금 — 월 8일 이상 또는 60시간 이상 + 18세~60세
  let nationalPensionTarget = true;
  if (restrictedVisa) {
    nationalPensionTarget = false;
    reasons.push('국민연금: 체류자격 제한으로 비대상 추정');
  } else if (ageYears != null && (ageYears < 18 || ageYears >= 60)) {
    nationalPensionTarget = false;
    reasons.push(`국민연금: 만 ${ageYears}세 — 18~59세 범위 밖`);
  } else if (attendanceDays < 8 && workedMinutes < 60 * 60) {
    nationalPensionTarget = false;
    reasons.push(`국민연금: 월 ${attendanceDays}일 / ${Math.floor(workedMinutes / 60)}시간 — 8일·60시간 미달`);
  } else {
    reasons.push(`국민연금: 대상 (월 ${attendanceDays}일 / ${Math.floor(workedMinutes / 60)}시간)`);
  }

  // 5) 건강보험 — 월 60시간 이상
  let healthInsuranceTarget = true;
  if (restrictedVisa) {
    healthInsuranceTarget = false;
    reasons.push('건강보험: 체류자격 제한으로 비대상 추정');
  } else if (workedMinutes < 60 * 60) {
    healthInsuranceTarget = false;
    reasons.push(`건강보험: 월 ${Math.floor(workedMinutes / 60)}시간 — 60시간 미달`);
  } else {
    reasons.push(`건강보험: 대상 (월 ${Math.floor(workedMinutes / 60)}시간)`);
  }

  // 6) 고용보험 — 일용근로 1일 이상이면 대상 (단기 체류 외국인 제외)
  let employmentInsuranceTarget = true;
  if (restrictedVisa) {
    employmentInsuranceTarget = false;
    reasons.push('고용보험: 체류자격 제한으로 비대상 추정');
  } else if (attendanceDays === 0) {
    employmentInsuranceTarget = false;
    reasons.push('고용보험: 출역 0일');
  } else {
    reasons.push(`고용보험: 대상 (월 ${attendanceDays}일)`);
  }

  // 7) 산재보험 — 사업주 100% 부담, 거의 모든 근로자 대상
  const industrialAccidentTarget = attendanceDays > 0;
  if (industrialAccidentTarget) {
    reasons.push('산재보험: 대상 (사업주 100% 부담)');
  } else {
    reasons.push('산재보험: 출역 기록 없음 — 비대상');
  }

  // 8) Worker.insuranceProfile 의 명시 제외 사유 처리
  if (input.insuranceProfile?.excludeReason) {
    warnings.push({
      code: 'OTHER',
      field: 'worker.insuranceProfile.excludeReason',
      message: `Worker 에 제외 사유 명시됨: ${input.insuranceProfile.excludeReason}`,
      severity: 'warning',
    });
  }

  return {
    nationalPensionTarget,
    healthInsuranceTarget,
    employmentInsuranceTarget,
    industrialAccidentTarget,
    reasons,
    warnings,
  };
}

/* ════════════════════════════════════════════════
 *  헬퍼
 * ════════════════════════════════════════════════ */

/** 생년월일 + 기준일로 만 나이 계산. 둘 중 하나 없으면 null */
function computeAgeYears(
  birthDate?: string | null,
  asOfDate?: string,
): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return null;
  const ref = asOfDate ? new Date(asOfDate) : new Date();
  if (Number.isNaN(ref.getTime())) return null;
  let age = ref.getFullYear() - b.getFullYear();
  const m = ref.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < b.getDate())) age -= 1;
  return age;
}

/** 단기 체류 자격 (보험 적용 불가/제한) 패턴 */
function isRestrictedVisa(visa?: string | null): boolean {
  if (!visa) return false;
  const v = visa.trim().toUpperCase();
  // F-1 (방문동거), B-1 (사증면제), B-2 (관광·통과), C-3 (단기방문), C-4 (단기취업)
  return ['F-1', 'B-1', 'B-2', 'C-3', 'C-4'].includes(v);
}
