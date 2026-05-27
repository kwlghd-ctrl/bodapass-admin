/**
 * 도메인 테스트 — 출역일수 (attendance)
 *
 * Vitest 가 없으므로 자체 verifier 패턴 사용.
 * 브라우저 콘솔: import('@/domain/__tests__/attendance.test').then(m => m.verifyAllAttendance())
 */
import type { VerificationResult } from '../../utils/__verify__/calculationVerifier';
import type { AttendanceRecord } from '../../api/attendanceV2.types';
import {
  countAttendanceDays,
  countPaidWorkDays,
  countSeveranceWorkDays,
} from '../attendance/attendanceDayCounter';

/** AttendanceRecord 부분 채우기용 헬퍼 */
function rec(p: Partial<AttendanceRecord>): AttendanceRecord {
  return {
    id: 'A-x',
    date: '2026-05-01',
    employmentId: 'E-1',
    workerCode: 'W-1',
    workerName: '홍길동',
    trade: '보통인부' as AttendanceRecord['trade'],
    siteId: 'S-1',
    companyId: 'C-1',
    checkInAt: null,
    checkOutAt: null,
    checkInMethod: null,
    checkOutMethod: null,
    checkInScore: null,
    checkOutScore: null,
    status: 'NORMAL',
    workedMinutes: 480,
    gongsu: 1,
    dailyWage: 200000,
    payAmount: 200000,
    ...p,
  } as AttendanceRecord;
}

/** ① 동일 날짜 중복 인증 → 1일 */
export function verifyAttendance01_dedupeSameDate(): VerificationResult {
  const records: AttendanceRecord[] = [
    rec({ id: 'A-1', workDate: '2026-05-01' }),
    rec({ id: 'A-2', workDate: '2026-05-01' }),
    rec({ id: 'A-3', workDate: '2026-05-01' }),
  ];
  const actual = countAttendanceDays(records);
  return {
    case: '① 동일 날짜 중복 인증 → 1일',
    pass: actual === 1,
    expected: 1,
    actual,
  };
}

/** ② ABSENT / OFF 상태 제외 */
export function verifyAttendance02_excludeAbsentOff(): VerificationResult {
  const records: AttendanceRecord[] = [
    rec({ id: 'A-1', workDate: '2026-05-01', status: 'NORMAL' }),
    rec({ id: 'A-2', workDate: '2026-05-02', status: 'ABSENT' }),
    rec({ id: 'A-3', workDate: '2026-05-03', status: 'OFF' }),
    rec({ id: 'A-4', workDate: '2026-05-04', status: 'LATE' }),
  ];
  const actual = countAttendanceDays(records);
  return {
    case: '② ABSENT/OFF 상태 제외 → NORMAL/LATE 만 카운트',
    pass: actual === 2,
    expected: 2,
    actual,
  };
}

/** ③ countPaidWorkDays: payAmount>0 또는 gongsu>0 만 카운트 */
export function verifyAttendance03_paidWorkDays(): VerificationResult {
  const records: AttendanceRecord[] = [
    rec({ id: 'A-1', workDate: '2026-05-01', payAmount: 200000, gongsu: 1 }),
    rec({ id: 'A-2', workDate: '2026-05-02', payAmount: 0, gongsu: 0.5 }),
    rec({ id: 'A-3', workDate: '2026-05-03', payAmount: 0, gongsu: 0 }),
  ];
  const actual = countPaidWorkDays(records);
  return {
    case: '③ countPaidWorkDays: payAmount>0 또는 gongsu>0 인 날짜만 카운트',
    pass: actual === 2,
    expected: 2,
    actual,
  };
}

/** ④ countAttendanceDays vs countPaidWorkDays 분리 동작 */
export function verifyAttendance04_separateCounters(): VerificationResult {
  const records: AttendanceRecord[] = [
    rec({ id: 'A-1', workDate: '2026-05-01', payAmount: 200000, gongsu: 1, status: 'NORMAL' }),
    rec({ id: 'A-2', workDate: '2026-05-02', payAmount: 0, gongsu: 0, status: 'NORMAL' }),
    rec({ id: 'A-3', workDate: '2026-05-03', payAmount: 0, gongsu: 0, status: 'ABSENT' }),
  ];
  const att = countAttendanceDays(records);
  const paid = countPaidWorkDays(records);
  const sev = countSeveranceWorkDays(records);
  return {
    case: '④ countAttendanceDays(2) vs countPaidWorkDays(1) vs countSeveranceWorkDays(2) 분리 동작',
    pass: att === 2 && paid === 1 && sev === 2,
    expected: { attendance: 2, paid: 1, severance: 2 },
    actual: { attendance: att, paid, severance: sev },
  };
}

export function verifyAllAttendance(): VerificationResult[] {
  const all = [
    verifyAttendance01_dedupeSameDate(),
    verifyAttendance02_excludeAbsentOff(),
    verifyAttendance03_paidWorkDays(),
    verifyAttendance04_separateCounters(),
  ];
  const passed = all.filter((r) => r.pass).length;
  console.group(`[bodapass] domain/attendance — ${passed}/${all.length} passed`);
  for (const r of all) console.log(`${r.pass ? '✓' : '✗'} ${r.case}`);
  console.groupEnd();
  return all;
}
