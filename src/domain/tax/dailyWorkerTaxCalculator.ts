/**
 * dailyWorkerTaxCalculator — 일용근로 소득세 계산 도메인 래퍼 (Phase Q)
 * @migrated from src/utils/incomeTaxDaily
 */
import { calculateDailyIncomeTaxRows } from '../../utils/incomeTaxDaily';
import type { DailyTaxRow } from '../../utils/incomeTaxDaily';

export { calculateDailyIncomeTaxRows };
/** alias — 도메인 명명 규칙 (calculateDailyWorkerTaxRows) */
export { calculateDailyIncomeTaxRows as calculateDailyWorkerTaxRows };

/** 월 합산 — 일자별 row 의 단순 합 (재계산 X). 명세서·검증용. */
export function aggregateMonthlyWorkerTax(rows: DailyTaxRow[]): {
  totalIncomeTax: number;
  totalLocalIncomeTax: number;
  totalPay: number;
} {
  return {
    totalIncomeTax: rows.reduce((s, r) => s + r.incomeTax, 0),
    totalLocalIncomeTax: rows.reduce((s, r) => s + r.localIncomeTax, 0),
    totalPay: rows.reduce((s, r) => s + r.payAmount, 0),
  };
}
