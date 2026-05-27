/**
 * 공수(工數) 계산 유틸
 *
 *  레거시 규칙 (calcGongsu): "8시간 기준(07~15시) 1공수"
 *  → 4시간 단위로 0.5 공수 적층:
 *      < 4h    : 0.0  (출근 미인정)
 *      4~7h    : 0.5
 *      8~11h   : 1.0   (표준 근로)
 *     12~15h   : 1.5
 *     16h 이상 : 2.0   (상한)
 *
 *  ─── 신규 정책형 계산 (calculateDailyGongsu) ─────────────────────────
 *  WorkRule (사업장·현장별 정책) 을 입력으로 받아 다음을 처리:
 *    · checkIn/checkOut 누락 → BLOCKED (gongsu=0, warning)
 *    · 수동 공수 (manualGongsu) 는 adjustmentApproved 일 때만 반영
 *    · ECARD / IMPORTED 출처 + 명시 gongsu → IMPORTED 그대로 신뢰
 *    · 그 외 → AUTO_TIME (workRule 기준 자동 계산)
 *
 *  레거시 calcGongsu 는 backward compat 으로 그대로 유지.
 */

export const STANDARD_WORK_START = '07:00';
export const STANDARD_WORK_END = '15:00';
export const STANDARD_WORK_MINUTES = 8 * 60;

/** 분 → 공수 (0.5 단위, 최대 2.0) */
export function minutesToGongsu(minutes: number): number {
  if (!minutes || minutes < 240) return 0; // 4시간 미만
  if (minutes < 480) return 0.5;
  if (minutes < 720) return 1.0;
  if (minutes < 960) return 1.5;
  return 2.0;
}

/** 출/퇴근 ISO 시각 → { workedMinutes, gongsu } */
export function calcGongsu(
  checkInIso?: string | null,
  checkOutIso?: string | null,
): { workedMinutes: number; gongsu: number } {
  if (!checkInIso || !checkOutIso) return { workedMinutes: 0, gongsu: 0 };
  const inMs = new Date(checkInIso).getTime();
  const outMs = new Date(checkOutIso).getTime();
  if (Number.isNaN(inMs) || Number.isNaN(outMs) || outMs <= inMs) {
    return { workedMinutes: 0, gongsu: 0 };
  }
  const minutes = Math.floor((outMs - inMs) / 60_000);
  return { workedMinutes: minutes, gongsu: minutesToGongsu(minutes) };
}

/** 출근 시각이 표준 시간대(07:00) 보다 늦었는지 — 지각 판정용 */
export function isLate(checkInIso: string): boolean {
  const d = new Date(checkInIso);
  const m = d.getHours() * 60 + d.getMinutes();
  return m > 7 * 60; // 07:00 이후
}

/** 퇴근 시각이 표준 종료(15:00) 보다 일렀는지 — 조퇴 판정용 */
export function isEarly(checkOutIso: string): boolean {
  const d = new Date(checkOutIso);
  const m = d.getHours() * 60 + d.getMinutes();
  return m < 15 * 60; // 15:00 이전
}

/** "분" 을 "Hh Mm" 표시 ("8h 30m" 등) */
export function formatWorkedMinutes(minutes: number): string {
  if (!minutes) return '-';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

/** 공수 표시 — 1.5 → "1.5", 1 → "1", 0 → "0" */
export function formatGongsu(gongsu: number | null | undefined): string {
  if (gongsu == null) return '0';
  if (Number.isInteger(gongsu)) return String(gongsu);
  return gongsu.toFixed(1);
}

/** ISO 시각 → "HH:MM" — 빈 문자열로 폴백 */
export function isoToHHMM(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/* ════════════════════════════════════════════════════════════════════
 *  신규 정책형 공수 계산 — calculateDailyGongsu
 * ════════════════════════════════════════════════════════════════════ */

import type { WorkRule, DailyGongsuResult } from '../api/workRule.types';

export interface CalculateDailyGongsuInput {
  checkInAt?: string | null;
  checkOutAt?: string | null;
  manualGongsu?: number | null;
  source?: 'FACE' | 'MANUAL' | 'ECARD' | 'IMPORTED';
  adjustmentApproved?: boolean;
  importedGongsu?: number | null;
  workRule: WorkRule;
}

/**
 * 1일 공수 산정. WorkRule (사이트/회사/전역 정책) 기반.
 *
 *  결정 우선순위:
 *    1) checkIn 또는 checkOut 누락 → BLOCKED
 *    2) source==='MANUAL' && manualGongsu 존재 → adjustmentApproved 일 때만 MANUAL_APPROVED 반영
 *    3) source==='ECARD'|'IMPORTED' && importedGongsu 존재 → IMPORTED 그대로 사용
 *    4) 그 외 → AUTO_TIME (workRule 기반 자동 계산)
 */
export function calculateDailyGongsu(input: CalculateDailyGongsuInput): DailyGongsuResult {
  const rule = input.workRule;

  if (!input.checkInAt || !input.checkOutAt) {
    return { workedMinutes: 0, gongsu: 0, basis: 'BLOCKED', warning: '퇴근 누락 또는 출퇴근 시각 누락' };
  }

  if (input.source === 'MANUAL' && input.manualGongsu != null) {
    if (!input.adjustmentApproved) {
      return { workedMinutes: 0, gongsu: 0, basis: 'BLOCKED', warning: '수동 공수 입력됨 — 승인 대기 (미반영)' };
    }
    const clamped = clampGongsu(input.manualGongsu, rule);
    return { workedMinutes: clamped * rule.standardWorkMinutes, gongsu: clamped, basis: 'MANUAL_APPROVED' };
  }

  if ((input.source === 'ECARD' || input.source === 'IMPORTED') && input.importedGongsu != null) {
    const clamped = clampGongsu(input.importedGongsu, rule);
    return { workedMinutes: clamped * rule.standardWorkMinutes, gongsu: clamped, basis: 'IMPORTED' };
  }

  const inMs = new Date(input.checkInAt).getTime();
  const outMs = new Date(input.checkOutAt).getTime();
  if (Number.isNaN(inMs) || Number.isNaN(outMs) || outMs <= inMs) {
    return { workedMinutes: 0, gongsu: 0, basis: 'BLOCKED', warning: '출퇴근 시각 오류 (퇴근이 출근보다 이전)' };
  }
  const rawMinutes = Math.floor((outMs - inMs) / 60_000);
  const workedMinutes = Math.max(0, rawMinutes - (rule.lunchBreakMinutes ?? 0));

  let gongsu: number;
  if (workedMinutes < rule.halfDayMinMinutes) {
    gongsu = 0;
  } else if (workedMinutes < rule.oneDayMinMinutes) {
    gongsu = 0.5;
  } else {
    gongsu = 1.0;
    const extra = workedMinutes - rule.oneDayMinMinutes;
    if (rule.overtimeMinMinutes && extra >= rule.overtimeMinMinutes) {
      gongsu += 0.5;
      if (extra >= rule.overtimeMinMinutes * 2) gongsu += 0.5;
    }
  }
  gongsu = clampGongsu(gongsu, rule);

  return {
    workedMinutes,
    gongsu,
    basis: 'AUTO_TIME',
    warning: workedMinutes < rule.halfDayMinMinutes
      ? `근로시간 ${workedMinutes}분 — 반공 인정 최소 미달 (${rule.halfDayMinMinutes}분)`
      : undefined,
  };
}

function clampGongsu(value: number, rule: WorkRule): number {
  const max = rule.maxGongsuPerDay ?? 2.0;
  const unit = rule.roundingUnit ?? 0.5;
  const rounded = Math.floor(value / unit) * unit;
  if (rounded > max) return max;
  if (rounded < 0) return 0;
  const digits = unit === 0.25 ? 2 : 1;
  return Number(rounded.toFixed(digits));
}

