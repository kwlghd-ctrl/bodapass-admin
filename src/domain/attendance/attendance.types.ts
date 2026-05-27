/**
 * attendance.types — 도메인 출역 타입 (Phase Q)
 * 기존 src/api 의 타입을 도메인 모듈에서 재노출 — backward compat.
 */
export type { AttendanceRecord, AttendanceSource } from '../../api/attendanceV2.types';
export type { MonthlyAttendanceSummary } from '../../api/monthlyAttendance.types';
