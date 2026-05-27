/**
 * incomeTaxDaily — 일용근로 소득세 일자별 계산 (Q1 정확화 후, Phase S1 필드 확장)
 *
 * 일용근로자 원천징수 정식 산식 (소득세법 제14조의2, 제59조, 제86조):
 *
 *   1) 과세표준 = max(0, 일급 - 비과세 - 일용근로소득공제(150,000))
 *   2) 산출세액 = ⌊과세표준 × 6%⌋
 *   3) 근로소득세액공제 = ⌊산출세액 × 55%⌋   ← 소득세법 제59조
 *   4) 결정세액 = 산출세액 - 근로소득세액공제
 *   5) 결정세액 < 1,000원 → 소액부징수로 0원 ← 소득세법 제86조
 *   6) 지방소득세 = ⌊결정세액(징수금액) × 10%⌋
 *
 * 즉, 결과 세금은 (과세표준 × 6% × 45%) 와 거의 같다.
 * 예: 일급 200,000원 → 과표 50,000 → 산출 3,000 → 공제 1,650 → 결정 1,350 → 징수 1,350 → 지방세 135
 *
 * 누락 처리:
 *   · payAmount 없거나 0: dailyWageSnapshot × gongsu 로 대체 + warning
 *   · gongsu == 0 인 일자: 세금 0
 *
 * Phase S1: workerId/siteId/employmentId 추적 + grossPay/nonTaxablePay/taxableGrossPay/totalTax 명시.
 *           payAmount/taxableDaily/incomeTax 는 레거시 별칭으로 동일값 유지.
 */

import type { CalculationWarning } from '../api/legal.types';

/* ════════════════════════════════════════════════
 *  타입
 * ════════════════════════════════════════════════ */

export interface DailyTaxRow {
  workDate: string;
  /** (선택) 워커 ID — 입력에서 전파 */
  workerId?: string;
  /** (선택) 현장 ID */
  siteId?: string;
  /** (선택) 채용관계 ID */
  employmentId?: string;
  /** 일자별 총 지급액 (비과세 포함 전) — legacy alias of grossPay */
  payAmount: number;
  /** 일자별 총 지급액 — 명시 명명 (== payAmount) */
  grossPay: number;
  /** 일자별 비과세 합계 */
  nonTaxablePay: number;
  /** 과세 지급액 = grossPay - nonTaxablePay */
  taxableGrossPay: number;
  /** 적용 비과세 일액 (보통 150,000) */
  dailyDeduction: number;
  /** 과세표준 = max(0, payAmount - nonTaxablePay - dailyDeduction) — legacy alias of taxableIncome */
  taxableDaily: number;
  /** 과세표준 — 명시 명명 (== taxableDaily) */
  taxableIncome: number;
  /** 산출세액 = ⌊과표 × 6%⌋ */
  calculatedIncomeTax: number;
  /** 근로소득세액공제 = ⌊산출세액 × 55%⌋ */
  earnedIncomeTaxCredit: number;
  /** 결정세액 = 산출세액 - 공제 */
  determinedIncomeTax: number;
  /** 실제 원천징수 금액 — 소액부징수(1,000원 미만) 적용 후 — legacy alias of withheldIncomeTax */
  incomeTax: number;
  /** 원천징수 금액 — 명시 명명 (== incomeTax) */
  withheldIncomeTax: number;
  /** 지방소득세 = ⌊incomeTax × 10%⌋ */
  localIncomeTax: number;
  /** 합계세 = incomeTax + localIncomeTax */
  totalTax: number;
  /** 본 행의 데이터에 문제가 있을 때 표시 */
  warning?: string;
}

export interface DailyIncomeTaxInput {
  workDate?: string;
  date?: string;
  /** (선택) 워커 ID — DailyTaxRow 에 전파 */
  workerId?: string;
  /** (선택) 현장 ID */
  siteId?: string;
  /** (선택) 채용관계 ID */
  employmentId?: string;
  payAmount?: number | null;
  /** 일자별 비과세 합계 (식대 등 일할 안분된 금액) */
  nonTaxablePay?: number | null;
  dailyWageSnapshot?: number | null;
  dailyWage?: number;
  gongsu?: number;
}

export interface DailyIncomeTaxPolicy {
  /** 소득세율 — 0.06 (6%) */
  rate: number;
  /** 일자별 비과세 일액 — 보통 150,000 */
  dailyDeduction: number;
  /** 지방소득세율 — 보통 0.1 (소득세의 10%) */
  localRate?: number;
  /** 근로소득세액공제율 — 보통 0.55 (소득세법 제59조) */
  earnedIncomeTaxCreditRate?: number;
  /** 소액부징수 임계금액 — 보통 1,000 (소득세법 제86조) */
  smallAmountThreshold?: number;
}

export interface DailyIncomeTaxResult {
  rows: DailyTaxRow[];
  /** 월 합산 */
  totalIncomeTax: number;
  totalLocalIncomeTax: number;
  totalPayAmount: number;
  warnings: CalculationWarning[];
}

/* ════════════════════════════════════════════════
 *  본 함수
 * ════════════════════════════════════════════════ */

/**
 * 일자별 일용근로 소득세 계산 — 정식 산식.
 *
 * 입력값:
 *   · payAmount      : 일자별 총 지급액 (비과세 포함)
 *   · nonTaxablePay  : 일자별 비과세 (생략 시 0)
 *   · payAmount 누락/0 시 dailyWageSnapshot × gongsu 로 추정 + warning
 *
 * 출력:
 *   · 일자별 세부 필드 (Phase S1 확장 포함)
 *   · 월 합산
 */
export function calculateDailyIncomeTaxRows(
  records: DailyIncomeTaxInput[],
  policy: DailyIncomeTaxPolicy,
): DailyIncomeTaxResult {
  const localRate = policy.localRate ?? 0.1;
  const creditRate = policy.earnedIncomeTaxCreditRate ?? 0.55;
  const smallThreshold = policy.smallAmountThreshold ?? 1000;

  const rows: DailyTaxRow[] = [];
  const warnings: CalculationWarning[] = [];

  for (const r of records) {
    const workDate = r.workDate ?? r.date ?? '';
    const workerId = r.workerId;
    const siteId = r.siteId;
    const employmentId = r.employmentId;
    let payAmount = r.payAmount ?? 0;
    const nonTaxablePay = r.nonTaxablePay ?? 0;
    let rowWarning: string | undefined;

    // 1) payAmount 폴백 처리
    if (payAmount <= 0) {
      const snapshot = r.dailyWageSnapshot ?? r.dailyWage ?? 0;
      const gongsu = r.gongsu ?? 0;
      if (snapshot > 0 && gongsu > 0) {
        payAmount = Math.round(snapshot * gongsu);
        rowWarning = `payAmount 누락 — dailyWage(${snapshot}) × gongsu(${gongsu}) 로 추정`;
      } else {
        // 둘 다 없으면 세금 0
        rows.push({
          workDate,
          workerId,
          siteId,
          employmentId,
          payAmount: 0,
          grossPay: 0,
          nonTaxablePay: 0,
          taxableGrossPay: 0,
          dailyDeduction: policy.dailyDeduction,
          taxableDaily: 0,
          taxableIncome: 0,
          calculatedIncomeTax: 0,
          earnedIncomeTaxCredit: 0,
          determinedIncomeTax: 0,
          incomeTax: 0,
          withheldIncomeTax: 0,
          localIncomeTax: 0,
          totalTax: 0,
          warning: 'payAmount / dailyWage 모두 누락 — 세금 0 처리',
        });
        warnings.push({
          code: 'MISSING_WAGE_DATA',
          field: 'payAmount',
          message: `${workDate} : payAmount 및 dailyWage 모두 누락 — 세금 0 처리`,
          severity: 'warning',
        });
        continue;
      }
    }

    // 2) 과세표준 = max(0, payAmount - 비과세 - 일용근로소득공제)
    const taxableDaily = Math.max(0, payAmount - nonTaxablePay - policy.dailyDeduction);
    const taxableGrossPay = Math.max(0, payAmount - nonTaxablePay);

    // 3) 산출세액 = ⌊과표 × rate⌋
    const calculatedIncomeTax = Math.floor(taxableDaily * policy.rate);

    // 4) 근로소득세액공제 = ⌊산출세액 × creditRate⌋
    const earnedIncomeTaxCredit = Math.floor(calculatedIncomeTax * creditRate);

    // 5) 결정세액 = 산출 - 공제
    const determinedIncomeTax = Math.max(0, calculatedIncomeTax - earnedIncomeTaxCredit);

    // 6) 소액부징수 — 1,000원 미만은 0
    const incomeTax = determinedIncomeTax < smallThreshold ? 0 : determinedIncomeTax;

    // 7) 지방소득세 = ⌊incomeTax × localRate⌋
    const localIncomeTax = Math.floor(incomeTax * localRate);

    rows.push({
      workDate,
      workerId,
      siteId,
      employmentId,
      payAmount,
      grossPay: payAmount,
      nonTaxablePay,
      taxableGrossPay,
      dailyDeduction: policy.dailyDeduction,
      taxableDaily,
      taxableIncome: taxableDaily,
      calculatedIncomeTax,
      earnedIncomeTaxCredit,
      determinedIncomeTax,
      incomeTax,
      withheldIncomeTax: incomeTax,
      localIncomeTax,
      totalTax: incomeTax + localIncomeTax,
      warning: rowWarning,
    });
    if (rowWarning) {
      warnings.push({
        code: 'ESTIMATED_VALUE_USED',
        field: 'payAmount',
        message: `${workDate} : ${rowWarning}`,
        severity: 'info',
      });
    }
  }

  const totalIncomeTax = rows.reduce((s, r) => s + r.incomeTax, 0);
  const totalLocalIncomeTax = rows.reduce((s, r) => s + r.localIncomeTax, 0);
  const totalPayAmount = rows.reduce((s, r) => s + r.payAmount, 0);

  return { rows, totalIncomeTax, totalLocalIncomeTax, totalPayAmount, warnings };
}
