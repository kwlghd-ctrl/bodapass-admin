/**
 * MonthlyAttendanceSummary — 월간 출역 집계
 *
 * employment × yearMonth 단위로 집계된 「근로일수 / 공수 / 노무비」 의 「예상값」.
 * 화면에 확정값처럼 표시 금지. 항상 「예상값」 또는 「DRAFT/ESTIMATED」 라벨.
 *
 * 운영형 매핑:
 *   wrkDdSum    → attendanceDays
 *   mtchQtySum  → gongsuTotal
 *   mtchAmtSum  → grossWage
 *
 * 주의:
 *   ─ 출역일수(attendanceDays), 임금 지급일수(paidWorkDays), 퇴직공제 산정일수(severanceWorkDays)
 *   ─ 세 개를 분리. 지금 목업에선 같은 값이어도 타입은 분리 보관.
 */

export interface MonthlyAttendanceSummary {
  employmentId: string;
  siteId: string;
  companyId: string;
  yearMonth: string;

  /** 출역일수 — workDate unique count (출근 기록이 있는 날) */
  attendanceDays: number;
  /** 임금 지급 일수 — payAmount > 0 또는 gongsu > 0 인 날짜 */
  paidWorkDays: number;
  /** 퇴직공제 산정 일수 — 기본 attendanceDays 와 동일하나 정책 분기 가능 */
  severanceWorkDays: number;
  /** 사회보험 산정용 근로일수 — 기본 attendanceDays 와 동일 (정책 분기 가능) */
  insuredWorkDays?: number;

  /** gongsu 합계 */
  gongsuTotal: number;
  /** 작업 분 합계 */
  workedMinutesTotal: number;

  /** 데이터 출처별 건수 */
  faceCount: number;
  manualCount: number;
  ecardCount: number;
  /** 공수 보정이 일어난 건수 (manualPayHistory 가 있는 record) */
  adjustedCount: number;

  /** 월 총 임금 (비과세 포함 전) */
  grossWage: number;
  /** 평균 일당 — grossWage / paidWorkDays */
  dailyWageAverage: number;

  status: 'DRAFT' | 'ESTIMATED' | 'CONFIRMED' | 'CLOSED';
  /** 누락·이상치 경고 메시지 */
  warnings: string[];
}

/* ─────────── 조회 query ─────────── */

export interface ListMonthlyAttendanceQuery {
  siteId?: string;
  companyId?: string;
  employmentId?: string;
  yearMonth: string;
}

export interface ListMonthlyAttendanceResponse {
  summaries: MonthlyAttendanceSummary[];
  /** 통합 합계 — 화면 hero 표시용 */
  totals: {
    attendanceDays: number;
    paidWorkDays: number;
    gongsuTotal: number;
    grossWage: number;
  };
}
