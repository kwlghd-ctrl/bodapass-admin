// FILE_VERSION 1777950610
// WagePage 페이지 — 노임비/퇴직금 표시용 유틸 (V2 분리)
import type { SeveranceMonthSummary, WageMonthSummary } from '../../../api/wage.types';

/** 금액 표시 — 1,234,567원 (0 이면 '0원') */
export function krw(n: number) {
  if (!n) return '0원';
  return n.toLocaleString() + '원';
}

/** 금액 짧은 표시 — 1.2억 / 18.5만 / 콤마 정수 */
export function krwShort(n: number) {
  if (!n) return '0';
  if (n >= 100_000_000) return (n / 100_000_000).toFixed(1) + '억';
  if (n >= 10_000) {
    const v = (n / 10_000).toFixed(1);
    const trimmed = v.endsWith('.0') ? v.slice(0, -2) : v;
    const [intPart, fracPart] = trimmed.split('.');
    const intFmt = Number(intPart).toLocaleString();
    return (fracPart ? `${intFmt}.${fracPart}` : intFmt) + '만';
  }
  return n.toLocaleString();
}

/** 직종별 합계 집계 — { role, count, days, base, net } 배열 */
export function aggregateByRole(rows: WageMonthSummary['rows']): WageMonthSummary['byRole'] {
  const map = new Map<string, { count: number; days: number; base: number; net: number }>();
  for (const r of rows) {
    const e = map.get(r.role) ?? { count: 0, days: 0, base: 0, net: 0 };
    e.count += 1;
    e.days += r.workDays;
    e.base += r.baseAmount;
    e.net += r.netAmount;
    map.set(r.role, e);
  }
  return Array.from(map.entries()).map(([role, v]) => ({ role, ...v }));
}

/** 여러 사이트 노임비 요약을 1건으로 합산 */
export function mergeWage(all: WageMonthSummary[]): WageMonthSummary | null {
  if (all.length === 0) return null;
  if (all.length === 1) return all[0];
  const first = all[0];
  return {
    year: first.year,
    month: first.month,
    rows: all.flatMap((s) => s.rows),
    totalDays: all.reduce((sum, s) => sum + s.totalDays, 0),
    totalBase: all.reduce((sum, s) => sum + s.totalBase, 0),
    totalDeduction: all.reduce((sum, s) => sum + s.totalDeduction, 0),
    totalNet: all.reduce((sum, s) => sum + s.totalNet, 0),
    totalSeverance: all.reduce((sum, s) => sum + s.totalSeverance, 0),
    byRole: aggregateByRole(all.flatMap((s) => s.rows)),
  };
}

/** 여러 사이트 퇴직금 요약을 1건으로 합산 */
export function mergeSeverance(all: SeveranceMonthSummary[]): SeveranceMonthSummary | null {
  if (all.length === 0) return null;
  if (all.length === 1) return all[0];
  const first = all[0];
  return {
    year: first.year,
    month: first.month,
    rows: all.flatMap((s) => s.rows),
    attendedToday: all.reduce((sum, s) => sum + s.attendedToday, 0),
    totalAccrued: all.reduce((sum, s) => sum + s.totalAccrued, 0),
    totalPaid: all.reduce((sum, s) => sum + s.totalPaid, 0),
    totalBalance: all.reduce((sum, s) => sum + s.totalBalance, 0),
  };
}
