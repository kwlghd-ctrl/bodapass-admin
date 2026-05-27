/**
 * legalDataValidation — 법정 계산 전 필수 데이터 누락 검증
 *
 * 각 계산(퇴직공제 / 4대보험 / 소득세 / 두루누리) 별로 필요한 입력값을 점검하고
 * 누락 시 CalculationWarning[] 반환. 계산 함수는 이 결과를 결과 객체의
 * `warning` 필드에 그대로 포함시킨다.
 *
 * UI 처리 권장:
 *   · severity='error' 가 하나라도 있으면 신고 진행 차단
 *   · severity='warning' 만 있으면 "예상값", "확정 신고 전 검증 필요" 안내 표시
 *   · severity='info' 는 단순 안내
 */

import type { CalculationWarning } from '../api/legal.types';

/* ════════════════════════════════════════════════
 *  공통 입력 모양 — 검증 대상
 * ════════════════════════════════════════════════ */

export interface ValidateSiteInput {
  bidNoticeDate?: string | null;
  contractDate?: string | null;
  constructionEndDate?: string | null;
  completionDate?: string | null;
}

export interface ValidateWorkerInput {
  birthDate?: string | null;
  childrenUnder6Count?: number | null;
  insuranceHistoryLast12Months?: boolean | null;
}

export interface ValidateEmploymentInput {
  employmentId?: string | null;
  dailyWage?: number | null;
  workStartDate?: string | null;
}

/* ════════════════════════════════════════════════
 *  1) 퇴직공제부금 — 검증
 * ════════════════════════════════════════════════ */

export function validateSeveranceInputs(
  site: ValidateSiteInput,
  employment: ValidateEmploymentInput,
): CalculationWarning[] {
  const w: CalculationWarning[] = [];

  if (!site.bidNoticeDate && !site.contractDate) {
    w.push({
      code: 'MISSING_BID_NOTICE_DATE',
      field: 'site.bidNoticeDate',
      message: '입찰공고일·도급계약일 모두 없음 — 퇴직공제부금 기준 일액(6,500/8,700원) 판단 불가. 기본 8,700원으로 가정.',
      severity: 'warning',
    });
  } else if (!site.bidNoticeDate) {
    w.push({
      code: 'MISSING_BID_NOTICE_DATE',
      field: 'site.bidNoticeDate',
      message: '입찰공고일 없음 — 도급계약일을 기준으로 판단됨. 정확한 판정을 위해 입찰공고일 입력 권장.',
      severity: 'info',
    });
  }

  if (!employment.employmentId) {
    w.push({
      code: 'MISSING_EMPLOYMENT_ID',
      field: 'employment.id',
      message: 'employmentId 없음 — 출역·노임·보험 연결 불가.',
      severity: 'error',
    });
  }

  return w;
}

/* ════════════════════════════════════════════════
 *  2) 4대보험 — 검증
 * ════════════════════════════════════════════════ */

export function validateInsuranceInputs(
  worker: ValidateWorkerInput,
  employment: ValidateEmploymentInput,
): CalculationWarning[] {
  const w: CalculationWarning[] = [];

  if (!worker.birthDate) {
    w.push({
      code: 'MISSING_BIRTH_DATE',
      field: 'worker.birthDate',
      message: '생년월일 없음 — 국민연금/건강보험 대상 판단 제한 (만 60세 이상 등 자격 외 케이스).',
      severity: 'warning',
    });
  }
  if (!employment.dailyWage || employment.dailyWage <= 0) {
    w.push({
      code: 'MISSING_WAGE_DATA',
      field: 'employment.dailyWage',
      message: '일당 데이터 없음 — 보험료 산정 기준 보수 계산 불가.',
      severity: 'error',
    });
  }
  if (!employment.employmentId) {
    w.push({
      code: 'MISSING_EMPLOYMENT_ID',
      field: 'employment.id',
      message: 'employmentId 없음.',
      severity: 'error',
    });
  }

  return w;
}

/* ════════════════════════════════════════════════
 *  3) 소득세 — 검증
 * ════════════════════════════════════════════════ */

export function validateTaxInputs(
  worker: ValidateWorkerInput,
  employment: ValidateEmploymentInput,
): CalculationWarning[] {
  const w: CalculationWarning[] = [];

  if (worker.childrenUnder6Count === undefined || worker.childrenUnder6Count === null) {
    w.push({
      code: 'MISSING_CHILDREN_COUNT',
      field: 'worker.taxProfile.childrenUnder6Count',
      message: '6세 이하 자녀 수 미입력 — 출산·보육수당 비과세 한도 계산 제한 (0명으로 처리됨).',
      severity: 'info',
    });
  }
  if (!employment.dailyWage || employment.dailyWage <= 0) {
    w.push({
      code: 'MISSING_WAGE_DATA',
      field: 'employment.dailyWage',
      message: '일당 없음 — 과세 보수 계산 불가.',
      severity: 'error',
    });
  }

  return w;
}

/* ════════════════════════════════════════════════
 *  4) 두루누리 — 검증
 * ════════════════════════════════════════════════ */

export function validateDurunuriInputs(
  worker: ValidateWorkerInput,
  employment: ValidateEmploymentInput,
  companyEmployeeCount: number | null | undefined,
): CalculationWarning[] {
  const w: CalculationWarning[] = [];

  if (worker.insuranceHistoryLast12Months === null || worker.insuranceHistoryLast12Months === undefined) {
    w.push({
      code: 'MISSING_INSURANCE_HISTORY',
      field: 'worker.insuranceProfile.insuranceHistoryLast12Months',
      message: '신청일 전 12개월 보험가입 이력 정보 없음 — 신규/기존 가입자 판단 불가. 보수적으로 기존가입자(미지원)로 처리.',
      severity: 'warning',
    });
  }
  if (companyEmployeeCount === null || companyEmployeeCount === undefined) {
    w.push({
      code: 'MISSING_WAGE_DATA',
      field: 'company.employeeCount',
      message: '상시근로자 수 미입력 — 사업장 적격 판정 불가.',
      severity: 'error',
    });
  }
  if (!employment.dailyWage || employment.dailyWage <= 0) {
    w.push({
      code: 'MISSING_WAGE_DATA',
      field: 'employment.dailyWage',
      message: '일당 없음 — 월 보수 추정 불가.',
      severity: 'error',
    });
  }

  return w;
}

/* ════════════════════════════════════════════════
 *  5) 마감 / 준공 — 검증
 * ════════════════════════════════════════════════ */

export function validateCloseInputs(site: ValidateSiteInput): CalculationWarning[] {
  const w: CalculationWarning[] = [];

  if (!site.constructionEndDate) {
    w.push({
      code: 'MISSING_CONSTRUCTION_END_DATE',
      field: 'site.constructionEndDate',
      message: '공사 종료일 미입력 — 준공·월 마감 자동 판단 제한.',
      severity: 'info',
    });
  }
  return w;
}

/* ════════════════════════════════════════════════
 *  헬퍼 — 경고 요약
 * ════════════════════════════════════════════════ */

export function summarizeWarnings(warnings: CalculationWarning[]): {
  hasErrors: boolean;
  hasWarnings: boolean;
  errors: CalculationWarning[];
  warnings: CalculationWarning[];
  infos: CalculationWarning[];
  /** UI 에 표시할 한 줄 라벨 */
  uiLabel: 'CONFIRMED' | 'ESTIMATED' | 'BLOCKED';
} {
  const errors = warnings.filter((w) => w.severity === 'error');
  const warns = warnings.filter((w) => w.severity === 'warning');
  const infos = warnings.filter((w) => w.severity === 'info');
  let uiLabel: 'CONFIRMED' | 'ESTIMATED' | 'BLOCKED';
  if (errors.length > 0) uiLabel = 'BLOCKED';
  else if (warns.length > 0) uiLabel = 'ESTIMATED';
  else uiLabel = 'CONFIRMED';
  return {
    hasErrors: errors.length > 0,
    hasWarnings: warns.length > 0,
    errors,
    warnings: warns,
    infos,
    uiLabel,
  };
}

/**
 * UI 표시 문구 — 「예상값」 사용을 강제하기 위한 라벨 매핑.
 * 목업 단계에선 「확정값」 표현 사용 금지. 모두 「예상값」 또는 「검증 필요」 라벨.
 */
export const UI_LABEL_TEXT: Record<'CONFIRMED' | 'ESTIMATED' | 'BLOCKED', string> = {
  CONFIRMED: '기준정보 충족 — 예상값',
  ESTIMATED: '일부 기준정보 누락 — 검증 필요',
  BLOCKED: '계산 불가 — 필수 데이터 누락',
};
