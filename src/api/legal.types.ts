/**
 * legal.types — 법정 계산 입력/결과/정책 타입 정의
 *
 * 목적:
 *   · 퇴직공제부금 / 4대보험 / 소득세 / 두루누리 계산의 입력값·결과·근거를 구조화.
 *   · 정책 수치는 코드 중간에 박지 않고 LegalPolicy 테이블로 분리.
 *   · 화면은 결과값을 "예상 보험료" 형태로 표시하고, 확정 신고값처럼 보이지 않게 함.
 *
 * 원칙:
 *   · 모든 결과에 `policyVersion` 포함 — 어떤 정책 기준으로 계산됐는지 추적 가능.
 *   · 모든 결과에 `warning[]` 포함 — 입력 누락·추정값 사용 시 경고.
 *   · 화면 표시 시 warning 이 있으면 "확정 신고 전 검증 필요" 안내 노출.
 */

/* ════════════════════════════════════════════════
 *  공통 타입
 * ════════════════════════════════════════════════ */

export type PolicyCategory =
  | 'SEVERANCE_FUND_DAILY'    // 퇴직공제부금 일액
  | 'NATIONAL_PENSION_RATE'    // 국민연금 요율
  | 'HEALTH_INSURANCE_RATE'    // 건강보험 요율
  | 'LONG_TERM_CARE_RATE'      // 장기요양보험 요율
  | 'EMPLOYMENT_INSURANCE_RATE' // 고용보험 요율
  | 'INDUSTRIAL_ACCIDENT_RATE'  // 산재보험 요율
  | 'DURUNURI_WAGE_CEILING'    // 두루누리 월보수 기준
  | 'DURUNURI_SUPPORT_RATE'    // 두루누리 지원율
  | 'NONTAX_MEAL_LIMIT'        // 식대 비과세 한도
  | 'NONTAX_VEHICLE_LIMIT'     // 자가운전 비과세 한도
  | 'NONTAX_CHILDCARE_LIMIT'   // 보육수당 비과세 한도 (자녀 1인당)
  | 'INCOME_TAX_RATE_DAILY'    // 일용근로 소득세율
  | 'LOCAL_TAX_RATE';          // 지방소득세율

export interface LegalPolicy {
  /** 고유 ID — 'POL-SEV-FUND-2026' 형태 */
  id: string;
  /** 정책 분류 */
  category: PolicyCategory;
  /** 시행 시작일 (YYYY-MM-DD) */
  effectiveFrom: string;
  /** 시행 종료일 — null 이면 현재까지 유효 */
  effectiveTo: string | null;
  /**
   * 값 — 수치 또는 구조화된 객체.
   *  · 단순 숫자: 8700 (부금 일액), 0.095 (국민연금)
   *  · 구조화: { newRate: 0.8, existingRate: 0 } 같은 복합 정책
   */
  value: number | Record<string, number | string>;
  /** 사람이 읽을 수 있는 설명 */
  description: string;
  /** 근거 문서명 (예: "2026년도 산재·고용보험 가입 및 부과업무 실무편람") */
  sourceName: string;
  /** 근거 URL (없으면 빈 문자열) */
  sourceUrl: string;
  /** 정책 버전 식별자 — 결과에 함께 기록되어 추적 가능 */
  version: string;
  /**
   * 정책 신뢰도
   *  · OFFICIAL : 공식 고시·법령 확인 완료 (퇴직공제 일액 / 국민연금율 등)
   *  · ASSUMED  : 추정 — 일반 기준값 기반. 사업장별 다를 수 있음 (산재 평균요율 등)
   *  · DEMO     : 시연용 — 실 정책과 일치 보장 X. requiresVerification true.
   */
  confidence: 'OFFICIAL' | 'ASSUMED' | 'DEMO';
  /**
   * 실서비스 적용 전 검증 필요 여부.
   *  · true : 화면에 「검증 필요」 라벨 + 사용자 확인 후 적용
   *  · false: 공식 고시 — 그대로 사용 가능
   */
  requiresVerification: boolean;
}

/* ════════════════════════════════════════════════
 *  공통 결과 — 경고·근거
 * ════════════════════════════════════════════════ */

export type CalculationWarningCode =
  | 'MISSING_BID_NOTICE_DATE'
  | 'MISSING_CONTRACT_DATE'
  | 'MISSING_BIRTH_DATE'
  | 'MISSING_CHILDREN_COUNT'
  | 'MISSING_INSURANCE_HISTORY'
  | 'MISSING_CONSTRUCTION_END_DATE'
  | 'MISSING_EMPLOYMENT_ID'
  | 'MISSING_WAGE_DATA'
  | 'POLICY_OUTDATED'
  | 'ESTIMATED_VALUE_USED'
  | 'OTHER';

export interface CalculationWarning {
  code: CalculationWarningCode;
  field?: string;
  message: string;
  /** 'info' | 'warning' | 'error' — error 면 신고 진행 불가, warning 은 진행 가능 */
  severity: 'info' | 'warning' | 'error';
}

/* ════════════════════════════════════════════════
 *  1) 퇴직공제부금 계산 결과
 * ════════════════════════════════════════════════ */

export interface SeveranceCalculationResult {
  employmentId: string;
  yearMonth: string;
  /** 해당 월 출역일수 */
  workDays: number;
  /** 적용된 일액 (원) — 정책 + 현장 날짜 기준으로 결정 */
  appliedDailyFund: number;
  /** 누적 부금액 = workDays × appliedDailyFund */
  amount: number;
  /** 일액 결정 근거 날짜 (Site.bidNoticeDate 또는 contractDate) */
  basisDate: string | null;
  /** 사용된 정책 버전 */
  policyVersion: string;
  /** 경고 — 입찰공고일 누락 등 */
  warning: CalculationWarning[];
}

/* ════════════════════════════════════════════════
 *  2) 4대보험 계산 결과
 * ════════════════════════════════════════════════ */

export interface InsuranceCalculationResult {
  employmentId: string;
  yearMonth: string;
  /** 월 총 임금 (비과세 포함 전) */
  grossWage: number;
  /** 과세 보수 (비과세 한도 적용 후) */
  taxableWage: number;
  /** 보험료 — 모두 「예상값」, 확정 신고가 아님 */
  nationalPension: number;
  healthInsurance: number;
  longTermCareInsurance: number;
  employmentInsurance: number;
  industrialAccidentInsurance: number;
  /** 사업주 / 근로자 부담 합계 */
  employerTotal: number;
  employeeTotal: number;
  /** 사용된 정책 버전 — 어떤 요율 기준인지 추적 */
  policyVersion: string;
  warning: CalculationWarning[];
}

/* ════════════════════════════════════════════════
 *  3) 소득세 계산 결과
 * ════════════════════════════════════════════════ */

export interface TaxCalculationResult {
  employmentId: string;
  yearMonth: string;
  grossWage: number;
  /** 비과세 합계 (식대·자가운전·보육수당 등 한도 적용 후) */
  nonTaxableAmount: number;
  /** 과세 보수 = grossWage - nonTaxableAmount */
  taxableWage: number;
  /** 소득세 — 일용직 6% (예상) */
  incomeTax: number;
  /** 지방소득세 — 소득세 × 10% */
  localIncomeTax: number;
  /** 실 지급액 = grossWage - incomeTax - localIncomeTax - 보험료 */
  netPay: number;
  policyVersion: string;
  warning: CalculationWarning[];
}

/* ════════════════════════════════════════════════
 *  4) 두루누리 적격성 결과
 * ════════════════════════════════════════════════ */

export interface DurunuriEligibilityResult {
  employmentId: string;
  companyId: string;
  yearMonth: string;
  /** 최종 판정 — 적격 / 부적격 */
  eligible: boolean;
  /** 부적격 사유 (eligible=false 시) 또는 신규/기존 구분 사유 */
  reason: string;
  /** 사업장 상시근로자 수 — 10명 미만 조건 검증용 */
  employeeCount: number;
  /** 월 평균 보수 — 270만원 미만 조건 검증용 */
  monthlyAverageWage: number;
  /**
   * 신청일 전 12개월 가입 이력 여부
   *  · true:  이력 있음 → 기존가입자 (현행 정책상 지원 0)
   *  · false: 이력 없음 → 신규가입자 (지원 80%)
   *  · null:  알 수 없음 (서버 NPS/EI 조회 실패) → 보수적으로 기존가입자 처리
   */
  insuranceHistoryLast12Months: boolean | null;
  /** 적용될 지원율 (0~1) — 신규 0.8 / 기존 0 또는 legacy 0.4 */
  supportRate: number;
  /** 최대 지원 가능 개월 수 — 36 */
  maxSupportMonths: number;
  policyVersion: string;
  warning: CalculationWarning[];
}

/* ════════════════════════════════════════════════
 *  정책 조회 헬퍼 결과 타입
 * ════════════════════════════════════════════════ */

export interface PolicyLookupResult<T = number> {
  value: T;
  policy: LegalPolicy;
  /** 조회 기준일 — 이 날짜에 유효한 정책을 찾았다는 표시 */
  asOfDate: string;
}
