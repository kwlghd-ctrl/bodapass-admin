/**
 * attendanceAggregator — 월간 출역 집계 도메인 래퍼 (Phase Q)
 * @migrated from src/utils/attendanceAggregation
 */
export { aggregateMonthlyAttendance, summarizeMonthlyAttendance } from '../../utils/attendanceAggregation';
export type { MonthlyAttendanceSummary } from '../../api/monthlyAttendance.types';
