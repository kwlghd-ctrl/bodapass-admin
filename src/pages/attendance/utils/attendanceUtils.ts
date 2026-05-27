// FILE_VERSION 1777950620
// AttendancePage 페이지 — 셀 클래스/직종 단축/방법 라벨/상태 뱃지 유틸 (V3 분리)
import type {
  AttendanceMonth,
  AttendanceRecord,
  TodayAttendance,
} from '../../../api/attendance.types';

/** 금액 표시 — 1,234,567원 */
export function krw(n: number) {
  return n.toLocaleString() + '원';
}

/** 직종/스펙 단축 표시 — 최대 2자 */
export function shortSpecialty(s: string | undefined | null): string {
  if (!s) return '하';
  const clean = s.replace(/[·\s,()/]|제\d+종/g, '');
  return clean.slice(0, 2) || '하';
}

/** 셀 시각화 — ABSENT/존재여부 단순 톤 */
export function cellClass(r: AttendanceRecord | undefined): string {
  if (!r) return '';
  if (r.status === 'ABSENT') return 'att-cell--absent';
  return 'att-cell--filled';
}

/** 출근 라벨 — 얼굴인식률 / 관리자 수동보정 */
export function methodLabel(
  m: AttendanceRecord['checkInMethod'],
  score: number | null,
): string {
  if (!m) return '';
  if (m === 'FACE') {
    return score != null
      ? `인식률 ${Math.round(score * 100)}%`
      : '얼굴인식';
  }
  return '관리자 수동보정';
}

/** 퇴근 라벨 — 18시 이후 MANUAL + score null → 자동퇴근 */
export function checkOutMethodLabel(r: AttendanceRecord): string {
  if (!r.checkOutMethod) return '';
  if (r.checkOutMethod === 'FACE') {
    return r.checkOutScore != null
      ? `인식률 ${Math.round(r.checkOutScore * 100)}%`
      : '얼굴인식';
  }
  if (r.checkOutAt) {
    const hh = new Date(r.checkOutAt).getHours();
    if (hh >= 18 && r.checkOutScore == null) return '자동퇴근';
  }
  return '관리자 수동보정';
}

/** 상태 뱃지 — 출퇴근 상태에 따른 표시 */
export function statusBadge(r: AttendanceRecord): { kind: string; label: string } {
  if (r.status === 'ABSENT') return { kind: 'absent', label: '' };
  if (r.checkInMethod === 'MANUAL' || r.checkOutMethod === 'MANUAL') {
    return { kind: 'manual', label: '수동 처리' };
  }
  if (r.status === 'LATE') return { kind: 'late', label: '지각' };
  if (r.status === 'EARLY') return { kind: 'early', label: '조퇴' };
  if (!r.checkOutAt) return { kind: 'working', label: '근무 중' };
  return { kind: 'ok', label: '정상' };
}

/** 다중 현장의 월 데이터 합산 (yearMonth 동일 가정) */
export function mergeMonths(
  months: AttendanceMonth[],
  yearMonth: string,
): AttendanceMonth | null {
  if (months.length === 0) return null;
  if (months.length === 1) return months[0];
  const [yStr, mStr] = yearMonth.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const dates = months[0].dates;
  const rows = months.flatMap((m) => m.rows);
  const summary = {
    totalMembers: 0,
    totalGongsu: 0,
    totalPay: 0,
    faceCount: 0,
    manualCount: 0,
    absentCount: 0,
    lateCount: 0,
    earlyCount: 0,
  };
  for (const m of months) {
    summary.totalMembers += m.summary.totalMembers;
    summary.totalGongsu += m.summary.totalGongsu;
    summary.totalPay += m.summary.totalPay;
    summary.faceCount += m.summary.faceCount;
    summary.manualCount += m.summary.manualCount;
    summary.absentCount += m.summary.absentCount;
    summary.lateCount += m.summary.lateCount;
    summary.earlyCount += m.summary.earlyCount;
  }
  return { year, month, siteId: 'ALL', dates, rows, summary };
}

/** 다중 현장의 오늘 출퇴근 합산 */
export function mergeTodays(todays: TodayAttendance[]): TodayAttendance | null {
  if (todays.length === 0) return null;
  if (todays.length === 1) return todays[0];
  const members = todays.flatMap((t) => t.members);
  const summary = {
    totalCount: 0, beforeCount: 0, workingCount: 0, doneCount: 0,
  };
  for (const t of todays) {
    summary.totalCount += t.summary.totalCount;
    summary.beforeCount += t.summary.beforeCount;
    summary.workingCount += t.summary.workingCount;
    summary.doneCount += t.summary.doneCount;
  }
  return {
    siteId: 'ALL',
    date: todays[0].date,
    members,
    summary,
  };
}
