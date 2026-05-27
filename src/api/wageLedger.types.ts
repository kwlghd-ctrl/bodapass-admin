/**
 * WageLedger — 월별 노임대장 (Wage Ledger) 예상값
 *
 * employment × yearMonth 단위로 계산된 임금·공제·실지급액의 「예상값」.
 *
 * 운영형 매핑:
 *   mtchAmtSum     → grossWage
 *   incmAmtSum     → incomeTax
 *   incmLocalAmt   → localIncomeTax
 *   insHlthAmt     → healthInsurance
 *   insHlthLtcAmt  → longTermCareInsurance
 *   insPnsnAmt     → nationalPension
 *   insEmplAmt     → employmentInsurance
 *   ddctAmtSum     → deductionTotal
 *   netPayAmt      → netPay
 *   weekHlddQty/Amt → weeklyHolidayDays/Pay
 *   monHlddQty/Amt → monthlyHolidayDays/Pay
 *   lockLvTp        → lockLevel
 */

import type { DailyTaxRow } from '../utils/incomeTaxDaily';

export interface WageLedger {
  employmentId: string;
  siteId: string;
  companyId: string;
  yearMonth: string;

  /** 임금 지급 일수 */
  workDays: number;
  /** gongsu 합계 */
  gongsuTotal: number;
  /** 작업 분 합계 */
  workedMinutesTotal: number;

  /** 월 총 임금 (비과세 포함 전) */
  grossWage: number;
  /** 과세 보수 (비과세 한도 적용 후) */
  taxableWage: number;
  /** 비과세 합계 (한도 적용) */
  nonTaxableAmount: number;

  /** 소득세 (예상) */
  incomeTax: number;
  /** 지방소득세 (소득세의 10%) */
  localIncomeTax: number;
  /** 국민연금 (근로자 부담분) */
  nationalPension: number;
  /** 건강보험 (근로자 부담분) */
  healthInsurance: number;
  /** 장기요양보험 (건강보험료의 12.95%) */
  longTermCareInsurance: number;
  /** 고용보험 (근로자 부담분) */
  employmentInsurance: number;
  /**
   * 산재보험 — 사업주 100% 부담이므로 근로자 공제에선 0.
   * 보고서 표시용으로만 사용 (별도 사업주 부담분 추적).
   */
  industrialAccidentInsurance?: number;

  /** 공제 합계 = incomeTax + localTax + 4대보험 (근로자분) */
  deductionTotal: number;
  /** 실지급액 = grossWage - deductionTotal */
  netPay: number;

  /** 주휴일수·주휴수당 (해당 시) */
  weeklyHolidayDays?: number;
  weeklyHolidayPay?: number;
  /** 월차일수·월차수당 (해당 시) */
  monthlyHolidayDays?: number;
  monthlyHolidayPay?: number;

  /* ─── 퇴직공제 (별도 일수·일액·금액) ─── */
  /** 퇴직공제 산정 일수 (MonthlyAttendanceSummary.severanceWorkDays 와 동기화) */
  severanceWorkDays?: number;
  /** 적용된 퇴직공제부금 일액 */
  severanceFundDaily?: number;
  /** 예상 퇴직공제부금 = severanceWorkDays × severanceFundDaily */
  severanceFundAmount?: number;

  /** 계산 상태 */
  calculationStatus: 'READY' | 'ESTIMATED' | 'BLOCKED';
  /** 사용된 정책 버전 */
  policyVersion?: string;
  /** 경고 메시지 */
  warnings: string[];

  /**
   * 일자별 소득세 명세 (선택).
   * Phase T3 부터 full DailyTaxRow (16개 필드) 를 그대로 보존.
   * workerId/siteId/employmentId/grossPay/taxableIncome/calculatedIncomeTax/
   * earnedIncomeTaxCredit/determinedIncomeTax/withheldIncomeTax/totalTax 모두 포함.
   */
  dailyTaxRows?: DailyTaxRow[];

  /**
   * 일자별 출역·공수 명세 (Phase Z1 신규).
   *
   * dailyTaxRows 와 별개로 — 세금은 지급 기준(payAmount 있어야 행 생성),
   * 공수는 출역 기준(0.5/1.0/1.5/2.0 그대로) 이라 분리.
   *
   * 노임대장 엑셀의 1~31일 칸은 이 finalGongsu 를 직접 사용한다.
   */
  dailyAttendanceRows?: Array<{
    workDate: string;
    workerId?: string;
    employmentId?: string;
    /** 실제 출역 공수 (0.5 / 1.0 / 1.5 / 2.0) */
    finalGongsu: number;
    /** 작업 분 */
    workedMinutes: number;
    /** 지급액 (참고) */
    payAmount?: number;
  }>;

  /**
   * 잠금 단계 — 운영형 lockLvTp 매핑
   *  · DRAFT     : 작성 중 (수정 자유)
   *  · ESTIMATED : 예상값 (마감 전, 검증 필요)
   *  · CONFIRMED : 노무비 마감 완료 (수정 시 REOPEN)
   *  · CLOSED    : 월 마감 완료 (수정 불가)
   */
  lockLevel: 'DRAFT' | 'ESTIMATED' | 'CONFIRMED' | 'CLOSED';
}
