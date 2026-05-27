/**
 * attendanceAggregation — 일별 출퇴근 record 를 월별 summary 로 집계
 *
 * employment + yearMonth 그룹화 + 출역일수 / 공수 / 노무비 합산 + 경고 생성.
 *
 * 핵심:
 *   ─ attendanceDays (출역일수), paidWorkDays (지급일수),
 *     severanceWorkDays (퇴직공제 일수), insuredWorkDays (사회보험 산정일수)
 *   ─ 모두 Set<workDate> 기준으로 unique day 집계 — record 개수 X
 *   ─ src/domain/attendance/attendanceDayCounter 의 카운터 함수 사용
 *   ─ FACE/MANUAL/ECARD/ADJUSTED 건수 분류
 *   ─ employmentId, dailyWageSnapshot 누락 등 경고 자동 생성
 */

import type {
  AttendanceRecord,
} from '../api/attendanceV2.types';
import type { Employment } from '../api/employment.types';
import type {
  ListMonthlyAttendanceResponse,
  MonthlyAttendanceSummary,
} from '../api/monthlyAttendance.types';
import {
  countAttendanceDays,
  countPaidWorkDays,
  countSeveranceWorkDays,
  countInsuredWorkDays,
} from '../domain/attendance/attendanceDayCounter';

export interface AggregateOptions {
  /** (deprecated) — 도메인 카운터 사용으로 의미 없음. 호환용 옵션. */
  severanceWorkDaysEqualsAttendance?: boolean;
}

/**
 * 일별 record 배열을 employment × yearMonth 로 집계.
 */
export function aggregateMonthlyAttendance(
  records: AttendanceRecord[],
  employments: Pick<Employment, 'id' | 'workerId' | 'siteCompanyId' | 'dailyWage'>[],
  _opts: AggregateOptions = {},
): MonthlyAttendanceSummary[] {
  const empById = new Map(employments.map((e) => [e.id, e]));

  /** key: `${employmentId}|${yearMonth}` */
  const groups = new Map<string, AttendanceRecord[]>();
  for (const r of records) {
    if (!r.employmentId) continue;
    const ym = (r.workDate ?? r.date).slice(0, 7);
    const key = r.employmentId + '|' + ym;
    let arr = groups.get(key);
    if (!arr) {
      arr = [];
      groups.set(key, arr);
    }
    arr.push(r);
  }

  const results: MonthlyAttendanceSummary[] = [];
  for (const [key, recs] of groups) {
    const [employmentId, yearMonth] = key.split('|');
    const emp = empById.get(employmentId);

    // 도메인 카운터로 unique day 수 산정
    const attendanceDays = countAttendanceDays(recs);
    const paidWorkDays = countPaidWorkDays(recs);
    const severanceWorkDays = countSeveranceWorkDays(recs);
    const insuredWorkDays = countInsuredWorkDays(recs);

    // 일자별 누적 — 같은 날짜 record 가 여러 건이면 합산(공수/분/임금)되지만
    // 출역일수는 Set<workDate> 기준이라 중복 카운트되지 않음.
    const gongsuByDay = new Map<string, number>();
    const minutesByDay = new Map<string, number>();
    const wageByDay = new Map<string, number>();
    let faceCnt = 0, manualCnt = 0, ecardCnt = 0, adjustedCnt = 0;
    const warnings: string[] = [];

    const seenDates = new Set<string>();
    for (const r of recs) {
      const d = (r.workDate ?? r.date);
      // 결석/OFF 는 모든 카운트·합산에서 제외
      if (r.status === 'ABSENT' || r.status === 'OFF') continue;

      if (seenDates.has(d)) {
        warnings.push(`중복 출역: ${d} (${r.workerName})`);
      } else {
        seenDates.add(d);
      }

      // 일자별 합산
      gongsuByDay.set(d, (gongsuByDay.get(d) ?? 0) + (r.gongsu ?? 0));
      minutesByDay.set(d, (minutesByDay.get(d) ?? 0) + (r.workedMinutes ?? 0));

      // 출처 분류
      const src = r.source ?? r.checkInMethod;
      if (src === 'FACE') faceCnt++;
      else if (src === 'MANUAL') manualCnt++;
      else if (src === 'ECARD') ecardCnt++;
      if ((r.manualPayHistory?.length ?? 0) > 0) adjustedCnt++;

      // 일자별 임금 누적
      const snapshot = r.dailyWageSnapshot ?? r.dailyWage ?? emp?.dailyWage ?? 0;
      const payAmt = (r.payAmount ?? 0) > 0
        ? r.payAmount
        : Math.round(snapshot * (r.gongsu ?? 0));
      wageByDay.set(d, (wageByDay.get(d) ?? 0) + payAmt);

      // 누락 경고
      if (!r.dailyWageSnapshot && !r.dailyWage && !emp?.dailyWage) {
        warnings.push(`일당 정보 누락: ${d} (${r.workerName})`);
      }
      if (r.checkInAt && !r.checkOutAt) {
        warnings.push(`퇴근 누락: ${d} (${r.workerName})`);
      }
      if ((r.gongsu ?? 0) === 0 && r.status === 'NORMAL') {
        warnings.push(`공수 0인데 NORMAL 상태: ${d} (${r.workerName})`);
      }
    }

    if (!employmentId) warnings.push('employmentId 누락');

    const gongsu = [...gongsuByDay.values()].reduce((s, v) => s + v, 0);
    const workedMinutes = [...minutesByDay.values()].reduce((s, v) => s + v, 0);
    const grossWage = [...wageByDay.values()].reduce((s, v) => s + v, 0);
    const dailyWageAverage = paidWorkDays > 0 ? Math.round(grossWage / paidWorkDays) : 0;

    // employment 의 site/company 추출 — 첫 record 사용 (모두 동일하다고 가정)
    const firstRec = recs[0];
    const siteId = firstRec?.siteId ?? '';
    const companyId = firstRec?.companyId ?? '';

    results.push({
      employmentId,
      siteId,
      companyId,
      yearMonth,
      attendanceDays,
      paidWorkDays,
      severanceWorkDays,
      insuredWorkDays,
      gongsuTotal: Math.round(gongsu * 100) / 100,
      workedMinutesTotal: workedMinutes,
      faceCount: faceCnt,
      manualCount: manualCnt,
      ecardCount: ecardCnt,
      adjustedCount: adjustedCnt,
      grossWage,
      dailyWageAverage,
      status: warnings.length > 0 ? 'ESTIMATED' : 'DRAFT',
      warnings,
    });
  }

  return results;
}

/** 합계 계산 (화면 hero 표시용) */
export function summarizeMonthlyAttendance(
  summaries: MonthlyAttendanceSummary[],
): ListMonthlyAttendanceResponse['totals'] {
  return {
    attendanceDays: summaries.reduce((s, x) => s + x.attendanceDays, 0),
    paidWorkDays: summaries.reduce((s, x) => s + x.paidWorkDays, 0),
    gongsuTotal: Math.round(summaries.reduce((s, x) => s + x.gongsuTotal, 0) * 100) / 100,
    grossWage: summaries.reduce((s, x) => s + x.grossWage, 0),
  };
}
