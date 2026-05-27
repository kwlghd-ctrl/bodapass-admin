import { describe, it, expect } from 'vitest';
import { validateReportInput, filterReportRows } from './wageReportValidator';
import type { WageRow } from '../api/wage.types';
import type { DailyTaxRow } from './incomeTaxDaily';

/**
 * Phase BB5 + EE2 — wageReportValidator vitest 케이스
 *
 * 실행: npm run test:ui
 *
 * validateReportInput 무결성 검증 규칙 (출력 차단 조건):
 *  · dailyTaxRows.incomeTax 합 == row.deductionIncomeTax 합
 *  · dailyTaxRows.localIncomeTax 합 == row.deductionLocalTax 합
 *  · dailyTaxRows.totalTax 합 == row.deductionIncomeTax + row.deductionLocalTax 합
 *
 * 따라서 READY fixture 의 dailyTaxRows / row 값이 정확히 일치하도록 구성.
 */

/** 16-field DailyTaxRow 빌더. */
function dailyRow(over: Partial<DailyTaxRow> = {}): DailyTaxRow {
  const grossPay = over.grossPay ?? over.payAmount ?? 200_000;
  const nonTaxablePay = over.nonTaxablePay ?? 0;
  const dailyDeduction = over.dailyDeduction ?? 150_000;
  const taxableIncome =
    over.taxableIncome ??
    over.taxableDaily ??
    Math.max(0, grossPay - nonTaxablePay - dailyDeduction);
  const calculatedIncomeTax = over.calculatedIncomeTax ?? Math.floor(taxableIncome * 0.06);
  const earnedIncomeTaxCredit = over.earnedIncomeTaxCredit ?? Math.floor(calculatedIncomeTax * 0.55);
  const determinedIncomeTax = over.determinedIncomeTax ?? calculatedIncomeTax - earnedIncomeTaxCredit;
  const incomeTax =
    over.incomeTax ??
    over.withheldIncomeTax ??
    (determinedIncomeTax < 1000 ? 0 : determinedIncomeTax);
  const localIncomeTax = over.localIncomeTax ?? Math.floor(incomeTax * 0.1);
  const totalTax = over.totalTax ?? incomeTax + localIncomeTax;
  return {
    workDate: '2026-05-01',
    payAmount: grossPay,
    grossPay,
    nonTaxablePay,
    taxableGrossPay: grossPay - nonTaxablePay,
    dailyDeduction,
    taxableDaily: taxableIncome,
    taxableIncome,
    calculatedIncomeTax,
    earnedIncomeTaxCredit,
    determinedIncomeTax,
    incomeTax,
    withheldIncomeTax: incomeTax,
    localIncomeTax,
    totalTax,
    ...over,
  } as DailyTaxRow;
}

/** READY fixture — dailyTaxRows 합계와 row.deduction* 합계가 정확히 일치. */
function readyRow(over: Partial<WageRow> = {}): WageRow {
  const daily = dailyRow({
    workDate: '2026-05-01',
    payAmount: 200_000,
    grossPay: 200_000,
    incomeTax: 100,
    withheldIncomeTax: 100,
    localIncomeTax: 10,
    totalTax: 110,
  });
  return {
    memberId: 'M-READY',
    memberName: 'Test Ready',
    idNumberMasked: '900101-1******',
    role: 'WORKER' as never,
    workDays: 20,
    dailyWage: 200_000,
    baseAmount: 4_000_000,
    deductionPension: 0,
    deductionHealth: 0,
    deductionEmployment: 0,
    deductionAccident: 0,
    deductionIncomeTax: 100,
    deductionLocalTax: 10,
    deductionTotal: 110,
    netAmount: 3_999_890,
    severanceAccrued: 0,
    taxableWage: 4_000_000,
    nonTaxableAmount: 0,
    calculationStatus: 'READY',
    warnings: [],
    dailyTaxRows: [daily],
    ...over,
  } as WageRow;
}

/** BLOCKED fixture — workDays:0, baseAmount:0, dailyTaxRows:[] — 0-출역 차단 케이스. */
function blockedRow(over: Partial<WageRow> = {}): WageRow {
  return {
    memberId: 'M-BLOCKED',
    memberName: 'Test Blocked',
    idNumberMasked: '900101-1******',
    role: 'WORKER' as never,
    workDays: 0,
    dailyWage: 0,
    baseAmount: 0,
    deductionPension: 0,
    deductionHealth: 0,
    deductionEmployment: 0,
    deductionAccident: 0,
    deductionIncomeTax: 0,
    deductionLocalTax: 0,
    deductionTotal: 0,
    netAmount: 0,
    severanceAccrued: 0,
    taxableWage: 0,
    nonTaxableAmount: 0,
    calculationStatus: 'BLOCKED',
    warnings: ['no attendance'],
    dailyTaxRows: [],
    ...over,
  } as WageRow;
}

describe('filterReportRows', () => {
  it('removes BLOCKED rows with 0 workDays / 0 baseAmount / empty dailyTaxRows', () => {
    const rows = [readyRow({ memberId: 'A' }), blockedRow({ memberId: 'B' })];
    const out = filterReportRows(rows);
    expect(out.map((r) => r.memberId)).toEqual(['A']);
  });
});

describe('validateReportInput', () => {
  it('returns ok=true for valid READY rows', () => {
    const out = validateReportInput([readyRow({ memberId: 'A' })]);
    expect(out.ok).toBe(true);
  });

  it('returns ok=false when a row is BLOCKED', () => {
    const out = validateReportInput([blockedRow({ memberId: 'B' })]);
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/BLOCKED/);
  });

  it('returns ok=false when dailyTaxRows sum mismatches row.deductionIncomeTax', () => {
    // 일부러 deduction 만 변경 — dailyTaxRows.incomeTax=100 인데 row.deductionIncomeTax=9999
    const r = readyRow({ memberId: 'C', deductionIncomeTax: 9999 });
    const out = validateReportInput([r]);
    expect(out.ok).toBe(false);
  });
});
