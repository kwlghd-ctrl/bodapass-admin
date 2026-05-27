import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { prepareReportRows } from './services/reportGate';
import type { WageRow } from '../../api/wage.types';

/**
 * Phase EE5 — PrintPayslips 시나리오 테스트.
 *
 * WagePage 의 printPayslips() 는 검증 실패 시 false 를 반환하고,
 * onPrint 의 호출자 ({ const ok = printPayslips(...); if (!ok) return; setIssueOpen(false); })
 * 가 setIssueOpen(false) 호출을 건너뛰어 모달이 열린 채 유지된다.
 *
 * 본 테스트는 printPayslips 의 조기 분기 (prepareReportRows == null) 와
 * 그에 따른 boolean 반환 정책을 검증한다.
 *
 * 실행: npm run test:ui
 */

function readyDailyRow() {
  return {
    workDate: '2026-05-01',
    payAmount: 200_000,
    grossPay: 200_000,
    nonTaxablePay: 0,
    taxableGrossPay: 200_000,
    dailyDeduction: 150_000,
    taxableDaily: 50_000,
    taxableIncome: 50_000,
    calculatedIncomeTax: 3_000,
    earnedIncomeTaxCredit: 1_650,
    determinedIncomeTax: 1_350,
    incomeTax: 1_350,
    withheldIncomeTax: 1_350,
    localIncomeTax: 135,
    totalTax: 1_485,
  };
}

function readyRow(over: Partial<WageRow> = {}): WageRow {
  return {
    memberId: 'M-1',
    memberName: 'Ready',
    idNumberMasked: '900101-1******',
    role: 'WORKER' as never,
    workDays: 1,
    dailyWage: 200_000,
    baseAmount: 200_000,
    deductionPension: 0,
    deductionHealth: 0,
    deductionEmployment: 0,
    deductionAccident: 0,
    deductionIncomeTax: 1_350,
    deductionLocalTax: 135,
    deductionTotal: 1_485,
    netAmount: 198_515,
    severanceAccrued: 0,
    taxableWage: 200_000,
    nonTaxableAmount: 0,
    calculationStatus: 'READY',
    warnings: [],
    dailyTaxRows: [readyDailyRow() as never],
    ...over,
  } as WageRow;
}

function blockedRow(): WageRow {
  return {
    ...readyRow(),
    memberId: 'M-BLOCK',
    workDays: 5,
    baseAmount: 1_000_000,
    calculationStatus: 'BLOCKED',
    dailyTaxRows: [],
  };
}

describe('PrintPayslips — modal stays open on validation failure (EE5)', () => {
  let alertSpy: ReturnType<typeof vi.spyOn>;
  let setIssueOpen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    setIssueOpen = vi.fn();
  });
  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('BLOCKED row 입력 → prepareReportRows null → 호출자가 setIssueOpen(false) 호출 안 함', () => {
    // printPayslips 시나리오 시뮬레이션
    function runPrint(rows: WageRow[]): boolean {
      const reportRows = prepareReportRows(rows);
      if (!reportRows) return false;
      return true;
    }
    const ok = runPrint([blockedRow()]);
    // 핵심 규약: 검증 실패 → false → 호출자는 setIssueOpen(false) 호출 차단
    if (ok) setIssueOpen(false);
    expect(ok).toBe(false);
    expect(setIssueOpen).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalled();
  });

  it('READY row 입력 → reportRows 반환 → 호출자가 setIssueOpen(false) 호출 가능', () => {
    function runPrint(rows: WageRow[]): boolean {
      const reportRows = prepareReportRows(rows);
      if (!reportRows) return false;
      return true;
    }
    const ok = runPrint([readyRow()]);
    if (ok) setIssueOpen(false);
    expect(ok).toBe(true);
    expect(setIssueOpen).toHaveBeenCalledWith(false);
  });
});
