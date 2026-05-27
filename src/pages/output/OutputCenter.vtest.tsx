import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildInsuranceFiling } from '../../utils/insuranceFiling';
import type { FilingInput } from '../../utils/insuranceFiling';

/**
 * Phase EE5 — OutputCenter 다운로드 시나리오 테스트.
 *
 * OutputCenterPage 의 신고서 다운로드 버튼은 strictRrn=true 로 호출하므로
 * 13자리 아닌 주민번호가 하나라도 있으면 Error 가 throw 되어야 한다.
 *
 * 호출자는 try/catch 로 window.alert 만 띄우고 다운로드는 진행되지 않는다.
 *
 * 실행: npm run test:ui
 */

function input(over: Partial<FilingInput> = {}): FilingInput {
  return {
    name: 'Test',
    rrn: '9001011234567',
    workDays: 1,
    gross: 200_000,
    ...over,
  };
}

describe('OutputCenter — buildInsuranceFiling strictRrn (EE5)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('strictRrn=true 면 invalid rrn 발견 시 throw — 파일 다운로드 차단', () => {
    expect(() =>
      buildInsuranceFiling({
        rows: [input({ name: 'Bad', rrn: '12345' })],
        yearMonth: '2026-05',
        site: { id: 'S1', name: 'Site' },
        companyName: 'Co',
        managerName: 'Mgr',
        insuranceKind: 'BOTH',
        strictRrn: true,
      }),
    ).toThrow(/strictRrn/);
  });

  it('strictRrn 기본값(false) 일 때는 invalid rrn 만 skip — throw 없음', () => {
    const doc = buildInsuranceFiling({
      rows: [input({ name: 'Bad', rrn: '12345' }), input({ name: 'Good' })],
      yearMonth: '2026-05',
      site: { id: 'S1', name: 'Site' },
      companyName: 'Co',
      managerName: 'Mgr',
      insuranceKind: 'BOTH',
    });
    expect(doc.rows.length).toBe(1);
    expect(doc.rows[0].name).toBe('Good');
  });

  it('strictRrn=true 일 때 모든 row 가 유효하면 통과', () => {
    const doc = buildInsuranceFiling({
      rows: [input({ name: 'A' }), input({ name: 'B', rrn: '9002022345678' })],
      yearMonth: '2026-05',
      site: { id: 'S1', name: 'Site' },
      companyName: 'Co',
      managerName: 'Mgr',
      insuranceKind: 'BOTH',
      strictRrn: true,
    });
    expect(doc.rows.length).toBe(2);
  });
});
