/**
 * auditLog — 모든 수동 mutation 의 감사 기록
 *
 * 자동 처리(시스템·랜덤)는 감사 X, 사람이 수정한 모든 행위는 감사 O.
 * 마감 상태 전이, 공수·노임 변경, 수동 출퇴근 등록·수정, 마감 취소(REOPEN)
 * 까지 한 줄씩 누적 — 영구 보존.
 */

export type AuditLogType =
  // ── 출퇴근 ──
  | 'MANUAL_CHECKIN'        // 수동 출근
  | 'MANUAL_CHECKOUT'       // 수동 퇴근
  | 'GONGSU_CHANGE'         // 공수 직접 변경
  | 'PAY_CHANGE'            // 노임 직접 변경
  // ── 마감 상태 전이 ──
  | 'STAGE_FORWARD'         // 정방향 전이 (마감 진행)
  | 'STAGE_REOPEN'          // 역방향 전이 (마감 취소)
  // ── 워커·채용 ──
  | 'WORKER_REGISTER'
  | 'WORKER_UPDATE'
  | 'EMPLOYMENT_CREATE'
  | 'EMPLOYMENT_UPDATE'
  | 'EMPLOYMENT_TERMINATE'
  // ── 임금·지급 ──
  | 'WAGE_PAID'
  | 'WAGE_REISSUE'
  // ── 보험·신고 ──
  | 'INSURANCE_FILED'
  | 'INSURANCE_REFILED';

export type AuditTargetType =
  | 'ATTENDANCE'      // 출퇴근 단건 record
  | 'EMPLOYMENT'      // 채용 관계
  | 'WORKER'          // 워커 마스터
  | 'WAGE_MONTH'      // 월 단위 임금
  | 'CLOSE_STATUS_DAY'
  | 'CLOSE_STATUS_MONTH'
  | 'INSURANCE_FILING';

export interface AuditLogEntry {
  id: string;

  type: AuditLogType;
  targetType: AuditTargetType;
  /** 대상 식별자 — 출퇴근 record id / employmentId / yearMonth 등 */
  targetId: string;

  /** 보조 컨텍스트 — 화면 표시용. (예: 워커명, 일자) */
  context?: {
    siteId?: string;
    employmentId?: string;
    workerName?: string;
    date?: string;
    yearMonth?: string;
    /** 임의 추가 필드 */
    [k: string]: any;
  };

  /** 변경 전·후 스냅샷 — JSON 직렬화 가능한 형태로 */
  before?: any;
  after?: any;

  /** 사유 — REOPEN·수동수정·미신고 사유 등. 5자 이상 권장. */
  reason: string;

  performedBy: string;          // 처리자 user id
  performedByName: string;      // 표시용 이름
  performedAt: string;          // ISO timestamp
}

/** ───────── 조회 ───────── */

export interface ListAuditLogQuery {
  /** 대상 단위 — siteId·employmentId·yearMonth 중 하나로 좁히기 */
  siteId?: string;
  employmentId?: string;
  yearMonth?: string;
  /** 타입 필터 */
  types?: AuditLogType[];
  targetTypes?: AuditTargetType[];
  /** 기간 필터 */
  from?: string;
  to?: string;
  /** 페이지네이션 */
  limit?: number;
  cursor?: string;
}

export interface ListAuditLogResponse {
  entries: AuditLogEntry[];
  /** 다음 페이지 cursor — 없으면 끝 */
  nextCursor?: string;
}
