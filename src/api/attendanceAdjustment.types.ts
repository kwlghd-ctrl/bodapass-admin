/**
 * AttendanceAdjustmentRequest — 출퇴근 보정 신청 도메인
 *
 * 기존 운영 소스의 RQST_STAT_TP 매핑.
 *
 * 흐름:
 *   1) 반장/현장담당자가 신청 (REQUESTED)
 *   2) 본사/현장담당자가 승인(APPROVED) 또는 반려(REJECTED)
 *   3) 본인이 취소 (CANCELLED) 가능 — 단 APPROVED 이후엔 REOPEN 필요
 *
 * 승인 시: 서버가 자동으로 AttendanceRecord 의 gongsu/payAmount 갱신 + auditLog.
 * 반려 시: 사유 필수, auditLog 기록.
 */

export type AdjustmentRequestType =
  | 'OVERTIME'       // 초과근무 (gongsu 1.0 초과 신청)
  | 'CHECK_OUT'      // 퇴근 시각 보정
  | 'GONGSU_ADJUST'; // 공수 직접 보정 (0.5 등)

export type AdjustmentStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export interface AttendanceAdjustmentRequest {
  id: string;

  /** 대상 채용 관계 */
  employmentId: string;
  /** 대상 출퇴근 일자 (YYYY-MM-DD) */
  attendanceDate: string;

  requestType: AdjustmentRequestType;

  /** 신청자 user id */
  requestedBy: string;
  /** 신청자 이름 (감사로그 용) */
  requestedByName?: string;
  /** 신청 사유 (5자 이상) */
  reason: string;

  /**
   * 신청한 공수 값.
   *  · GONGSU_ADJUST: 직접 입력한 새 공수
   *  · OVERTIME:      추가하고자 하는 공수 (예: 0.5)
   *  · CHECK_OUT:     변경하고자 하는 퇴근시각으로 산출된 공수
   */
  requestedGongsu?: number;
  /** CHECK_OUT 신청 시 — 변경하려는 퇴근시각 (ISO) */
  requestedCheckOutAt?: string;

  status: AdjustmentStatus;

  /** 승인·반려 처리자 */
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  /** 반려·취소 사유 (REJECTED·CANCELLED 시) */
  rejectionReason?: string;

  createdAt: string;
  updatedAt: string;

  /** 감사로그 ID — 승인/반려 시 자동 기록된 audit 로그 참조 */
  auditLogId?: string;
}

/* ─────────── 조회 ─────────── */

export interface ListAdjustmentsQuery {
  siteId?: string;
  employmentId?: string;
  attendanceDate?: string;
  /** 기간 필터 */
  from?: string;
  to?: string;
  status?: AdjustmentStatus | 'ALL';
  requestType?: AdjustmentRequestType;
  /** 본인 신청만 / 본인 승인 권한 건만 등 */
  scope?: 'ALL' | 'PENDING' | 'MINE';
}

export interface ListAdjustmentsResponse {
  requests: AttendanceAdjustmentRequest[];
  /** 처리 대기 건수 (REQUESTED) — 본사·현장담당자 알림 표시용 */
  pendingCount: number;
}

/* ─────────── 생성·승인·반려·취소 ─────────── */

export interface CreateAdjustmentRequest {
  employmentId: string;
  attendanceDate: string;
  requestType: AdjustmentRequestType;
  reason: string;
  requestedGongsu?: number;
  requestedCheckOutAt?: string;
}

export interface ApproveAdjustmentRequest {
  /** 승인 메모 (옵션) */
  memo?: string;
}

export interface RejectAdjustmentRequest {
  /** 반려 사유 — 5자 이상 필수 */
  rejectionReason: string;
}

export interface CancelAdjustmentRequest {
  reason?: string;
}
