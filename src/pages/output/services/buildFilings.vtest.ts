import { describe, it, expect } from 'vitest';
import { buildFilingInputsFromReportRows } from './buildFilings';
import type { WageRow } from '../../../api/wage.types';

/**
 * Phase CC1 — buildFilingInputsFromReportRows 순수 매핑 테스트.
 *
 * dailyTaxRows.workDate 기준 daily[31] 마킹 + rrn 은 항상 빈 문자열로 유지.
 */

function row(over: Partial<WageRow> = {}): WageRow {
  return {
    memberId: 'M-1',
    memberName: 'Tester',
    idNumberMasked: '900101-1******',
    role: 'WORKER',
    workDays: 2,
    dailyWage: 200000,
    baseAmount: 400000,
    deductionPension: 0,
    deductionHealth: 0,
    deductionEmployment: 0,
    deductionAccident: 0,
    deductionIncomeTax: 0,
    deductionLocalTax: 0,
    deductionTotal: 0,
    netAmount: 400000,
    severanceAccrued: 0,
    taxableWage: 400000,
    nonTaxableAmount: 0,
    ...over,
  } as WageRow;
}

describe('buildFilingInputsFromReportRows', () => {
  it('returns empty array when given empty rows', () => {
    expect(buildFilingInputsFromReportRows([])).toEqual([]);
  });

  it('maps a single row preserving name and clearing rrn', () => {
    const out = buildFilingInputsFromReportRows([row({ memberName: '홍길동' })]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('홍길동');
    expect(out[0].rrn).toBe('');
    expect(out[0].workDays).toBe(2);
    expect(out[0].foreigner).toBe(false);
  });

  it('preserves gross/taxableGross/nontaxable separately', () => {
    const out = buildFilingInputsFromReportRows([
      row({ baseAmount: 500000, taxableWage: 480000, nonTaxableAmount: 20000 }),
    ]);
    expect(out[0].gross).toBe(500000);
    expect(out[0].taxableGross).toBe(480000);
    expect(out[0].nontaxable).toBe(20000);
  });

  it('converts dailyTaxRows.workDate to daily[31] numeric markers', () => {
    const out = buildFilingInputsFromReportRows([
      row({
        dailyTaxRows: [
          { workDate: '2026-05-01', dailyTaxableWage: 200000 } as never,
          { workDate: '2026-05-15', dailyTaxableWage: 200000 } as never,
        ],
      }),
    ]);
    expect(out[0].daily[0]).toBe(1);
    expect(out[0].daily[14]).toBe(1);
    expect(out[0].daily[1]).toBe(0);
    expect(out[0].daily.length).toBe(31);
  });
});
