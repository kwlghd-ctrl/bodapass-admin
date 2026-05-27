import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { WageRow } from '../../../api/wage.types';

/**
 * Phase EE5 — PayslipDispatch 시나리오 테스트.
 *
 * WagePage 의 dispatchPayslips() 함수는 검증 실패 시 false 를 반환해야 하고,
 * 호출자가 "발송됐습니다" alert 를 차단해야 한다.
 *
 * 이 테스트는 dispatch 의 gate 인 prepareReportRows() 가 BLOCKED row 입력 시
 *   · window.alert 가 호출되고
 *   · null 을 반환한다 (= 호출자는 ok==null 분기로 success alert 건너뜀)
 * 를 확인한다.
 *
 * 실행: npm run test:ui
 * 비고: 전체 dispatchPayslips() 통합은 너무 무거우므로 gate 단위로 검증.
 */

import { prepareReportRows } from '../services/reportGate';

function blockedRow(over: Partial<WageRow> = {}): WageRow {
  return {
    memberId: 'M-1',
    memberName: 'Blocked Member',
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

describe('PayslipDispatch — prepareReportRows gate (EE5)', () => {
  let alertSpy: ReturnType<typeof vi.spyOn>;
  let confirmSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true);
  });

  afterEach(() => {
    alertSpy.mockRestore();
    confirmSpy.mockRestore();
  });

  it('BLOCKED-only row → prepareReportRows returns valid array of length 0 OR null (no success path)', () => {
    // BLOCKED 만 있는 경우 filterReportRows 가 모두 걸러서 빈 배열을 반환하고,
    // validateReportInput([]) 은 ok=true 를 반환할 수 있음 — 그러나 dispatch 단계에서
    // reportRows.length === 0 이면 alert 호출 없이 false 가 반환됨.
    // 핵심: 검증 실패가 발생해도 success alert 가 호출되지 않는다.
    const result = prepareReportRows([blockedRow()]);
    // filter 결과 빈 배열이면 빈 배열 반환 — dispatch 가 len==0 분기로 차단
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
  });

  it('BLOCKED row 그대로 (filter 우회 시뮬레이션) → validate 단계에서 alert + null', () => {
    // workDays>0 + calculationStatus=BLOCKED 인 모순 케이스 — filterReportRows 를 통과
    // 한 뒤 validateReportInput 단계에서 차단되어 null 반환.
    const result = prepareReportRows([blockedRow({ workDays: 5, baseAmount: 1_000_000 })]);
    expect(result).toBeNull();
    expect(alertSpy).toHaveBeenCalled();
    const arg = String(alertSpy.mock.calls[0]?.[0] ?? '');
    expect(arg).toMatch(/출력 차단/);
  });
});
