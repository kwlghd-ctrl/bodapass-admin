/**
 * gongsuCalculator — 공수 계산 도메인 래퍼 (Phase Q)
 *
 * 기존 src/utils/gongsu.ts 의 함수를 도메인 모듈에서 재노출.
 * 추가로 월/근로자/현장별 집계 헬퍼 제공.
 */
export { calculateDailyGongsu, calcGongsu, minutesToGongsu, formatGongsu } from '../../utils/gongsu';

import type { AttendanceRecord } from '../../api/attendanceV2.types';

/** 월 합산 공수 — gongsu 단순 합 */
export function calculateMonthlyGongsu(records: AttendanceRecord[]): number {
  return records.reduce((s, r) => s + (r.gongsu ?? 0), 0);
}

/** 근로자별 공수 합계 */
export function aggregateGongsuByWorker(records: AttendanceRecord[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of records) {
    const id = r.workerCode || r.employmentId;
    if (!id) continue;
    out[id] = (out[id] ?? 0) + (r.gongsu ?? 0);
  }
  return out;
}

/** 현장별 공수 합계 */
export function aggregateGongsuBySite(records: AttendanceRecord[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of records) {
    if (!r.siteId) continue;
    out[r.siteId] = (out[r.siteId] ?? 0) + (r.gongsu ?? 0);
  }
  return out;
}
