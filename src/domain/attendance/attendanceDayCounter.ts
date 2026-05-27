/**
 * attendanceDayCounter — 출역일수 카운터 (Phase Q 신규)
 *
 * 같은 날짜 중복 인증 제거 + 취소/오류/미승인 제외.
 *  · countAttendanceDays    : 실제 출역으로 인정된 날짜 수
 *  · countPaidWorkDays      : 임금 지급 대상 일수
 *  · countSeveranceWorkDays : 퇴직공제 산정 대상 일수
 *  · countInsuredWorkDays   : 사회보험 판단용 근로일수
 *
 * NOTE: AttendanceRecord.status 의 DayResult 는
 * 'NORMAL' | 'LATE' | 'EARLY' | 'ABSENT' | 'OFF' 이며 'ABSENT' 와 'OFF' 는 제외.
 */
import type { AttendanceRecord } from '../../api/attendanceV2.types';

function isExcludedStatus(status: AttendanceRecord['status']): boolean {
  return status === 'ABSENT' || status === 'OFF';
}

/** 같은 날짜 중복 인증 제거 + 결근/휴무 제외 — 실제 출역으로 인정된 날짜 수 */
export function countAttendanceDays(records: AttendanceRecord[]): number {
  const set = new Set<string>();
  for (const r of records) {
    if (!r) continue;
    if (isExcludedStatus(r.status)) continue;
    const d = r.workDate ?? r.date;
    if (!d) continue;
    set.add(d);
  }
  return set.size;
}

/** 임금 지급 대상 일수 — payAmount > 0 또는 gongsu > 0 인 날짜 */
export function countPaidWorkDays(records: AttendanceRecord[]): number {
  const set = new Set<string>();
  for (const r of records) {
    if (!r) continue;
    if (isExcludedStatus(r.status)) continue;
    const d = r.workDate ?? r.date;
    if (!d) continue;
    const pay = (r.payAmount ?? 0) > 0;
    const gongsu = (r.gongsu ?? 0) > 0;
    if (pay || gongsu) set.add(d);
  }
  return set.size;
}

/** 퇴직공제 산정 대상 일수 — 출역일수와 동일하나 별도 보존 (정책 분기 가능) */
export function countSeveranceWorkDays(records: AttendanceRecord[]): number {
  return countAttendanceDays(records);
}

/** 사회보험 판단용 근로일수 — 출역일수와 동일 (별도 함수로 분리 — 향후 정책 분기 가능) */
export function countInsuredWorkDays(records: AttendanceRecord[]): number {
  return countAttendanceDays(records);
}
