/**
 * wageLedgerAggregator — 월별 노임대장 집계 헬퍼 (Phase Q 신규)
 */
import type { WageLedger } from '../../api/wageLedger.types';

export function aggregateWageLedgers(ledgers: WageLedger[]): {
  count: number;
  totalGross: number;
  totalDeduction: number;
  totalNet: number;
  totalSeverance: number;
} {
  return {
    count: ledgers.length,
    totalGross: ledgers.reduce((s, l) => s + l.grossWage, 0),
    totalDeduction: ledgers.reduce((s, l) => s + l.deductionTotal, 0),
    totalNet: ledgers.reduce((s, l) => s + l.netPay, 0),
    totalSeverance: ledgers.reduce((s, l) => s + (l.severanceFundAmount ?? 0), 0),
  };
}
