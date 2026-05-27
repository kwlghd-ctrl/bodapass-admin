/**
 * attendanceV2 — employmentId 기반 출퇴근 + 서버-권위 얼굴인식
 *
 * 기존 attendance.types.ts (memberId 기반) 와 병행 노출.
 * 신규 코드는 모두 V2 사용.
 */

import type { CloseStage } from './closeStatus';
import type { Trade } from './employment.types';

export type AttendanceMethod = 'FACE' | 'MANUAL';
export type AttendanceStatus = 'BEFORE' | 'WORKING' | 'DONE';
export type DayResult = 'NORMAL' | 'LATE' | 'EARLY' | 'ABSENT' | 'OFF';

/** 지오펜스 결과 — 서버 판정 */
export type GeofenceResult = 'INSIDE' | 'OUTSIDE' | 'NO_LOCATION' | 'LOW_ACCURACY';

/** 생체검증 결과 — 서버 판정 */
export type LivenessCheck = 'PASSED' | 'FAILED' | 'SKIPPED';

/**
 * 출퇴근 데이터의 출처
 *  · FACE   : 본인 얼굴인식
 *  · MANUAL : 관리자·반장 수동 입력
 *  · ECARD  : 건설근로자공제회 전자카드 태그
 */
export type AttendanceSource = 'FACE' | 'MANUAL' | 'ECARD';

/** 출퇴근 단건 — 서버가 생성 */
export interface AttendanceRecord {
  id: string;
  date: string;
  /**
   * 작업 일자 (date 와 동일 의미 — legal alias).
   * 야간 근무 등으로 checkIn/Out 가 자정 넘어가는 경우 workDate 는 「근로 귀속일」 기준.
   */
  workDate?: string;
  /** 채용 관계 PK — 워커가 어떤 회사·현장에서 일했는지의 단위 */
  employmentId: string;
  /** 보조 — 화면 즉시 표시용 (서버가 함께 내려줌) */
  workerCode: string;
  workerName: string;
  trade: Trade;
  siteId: string;
  companyId: string;

  checkInAt: string | null;
  checkOutAt: string | null;
  checkInMethod: AttendanceMethod | null;
  checkOutMethod: AttendanceMethod | null;
  /** 서버가 판정한 얼굴 매칭 점수 (0~1). MANUAL 이면 null */
  checkInScore: number | null;
  checkOutScore: number | null;

  /** 서버 판정 결과 */
  livenessCheckIn?: LivenessCheck;
  livenessCheckOut?: LivenessCheck;
  geofenceResult?: GeofenceResult;
  distanceFromSiteM?: number;

  status: DayResult;
  workedMinutes: number;
  gongsu: number;
  dailyWage: number;
  payAmount: number;
  /** 일자별 비과세 합계 (식대 등). 없으면 calculateMonthlyWageLedger 가 월총액을 균등 안분 + warning. */
  nonTaxablePay?: number;

  /** 수동 처리 사유 */
  manualReason?: string;
  manualEntryRole?: 'HQ' | 'SITE' | 'FOREMAN';
  manualEntryByName?: string;

  /** 공수 수동 변경 이력 — 매 변경 시 push */
  manualPayHistory?: Array<{
    at: string;
    fromGongsu: number;
    fromPay: number;
    toGongsu: number;
    toPay: number;
    reason?: string;
    by?: string;
  }>;

  /**
   * ─── 법정 계산 추가 필드 ─────────────────────
   */

  /** 데이터 출처 — checkInMethod 의 상위 개념 (ECARD 포함) */
  source?: AttendanceSource;
  /** 시점 dailyWage 스냅샷 — Employment 의 일당이 바뀌어도 이 record 의 값은 보존 */
  dailyWageSnapshot?: number;
  /** 지오펜스 통과 여부 (geofenceResult === 'INSIDE') */
  geofencePassed?: boolean;
  /** 현장 좌표로부터의 거리 (m) — distanceFromSiteM 의 alias */
  distanceFromSiteMeters?: number;
  /** 위치 정확도 (m) */
  locationAccuracyMeters?: number;
  /** 얼굴 인증 통과 여부 (checkInMethod === 'FACE' && checkInScore >= 0.7) */
  faceVerified?: boolean;
  /** 라이브니스 통과 여부 (livenessCheckIn === 'PASSED') */
  livenessPassed?: boolean;
}

/** ───── 월간 ───── */

export interface AttendanceMonthRow {
  employmentId: string;
  workerCode: string;
  workerName: string;
  trade: Trade;
  dailyWage: number;
  /** key: 'YYYY-MM-DD' → AttendanceRecord (없을 수도 있음) */
  daily: Record<string, AttendanceRecord | undefined>;
  totalGongsu: number;
  totalDays: number;
  totalPay: number;
}

export interface AttendanceMonth {
  year: number;
  month: number;
  siteId: string;
  /** 이 사이트의 마감 상태 (월 단위) */
  closeStage: CloseStage;
  /** 일자 목록 'YYYY-MM-DD' */
  dates: string[];
  rows: AttendanceMonthRow[];
  summary: {
    totalEmployments: number;
    totalGongsu: number;
    totalPay: number;
    faceCount: number;
    manualCount: number;
    absentCount: number;
    lateCount: number;
    earlyCount: number;
  };
}

/** ───── 오늘 ───── */

export interface TodayAttendanceMember {
  employmentId: string;
  workerCode: string;
  workerName: string;
  trade: Trade;
  status: AttendanceStatus;
  record: AttendanceRecord | null;
}

export interface TodayAttendance {
  siteId: string;
  date: string;
  closeStage: CloseStage;
  members: TodayAttendanceMember[];
  summary: {
    totalCount: number;
    beforeCount: number;
    workingCount: number;
    doneCount: number;
  };
}

/** ───── 얼굴인식 출퇴근 — 서버 권위 ───── */

export interface DeviceInfo {
  /** 'KIOSK' | 'FOREMAN_MOBILE' | 'SITE_TABLET' 등 */
  kind: string;
  deviceId: string;
  /** 앱 버전 */
  appVersion?: string;
}

export interface FaceCheckRequest {
  siteId: string;
  /** 서버 업로드된 얼굴 이미지 ID */
  faceImageId: string;

  /** 현재 위치 — 서버가 지오펜스 판정에 사용 */
  location?: {
    lat: number;
    lng: number;
    accuracy: number;
    capturedAt: string;
  };

  device: DeviceInfo;

  /** 클라이언트가 추정한 시각 — 서버가 자체 시각과 비교 (drift 감지) */
  clientTime: string;
}

/**
 * 서버 응답
 *  · 매칭 성공: { status:'OK', record }
 *  · 매칭 실패: { status:'REJECTED', reason, rejection }
 *  · 보류: { status:'PENDING_REVIEW', recordId, reason } — 본사 검토 후 확정
 */
export type FaceCheckResponse =
  | { status: 'OK'; record: AttendanceRecord }
  | {
      status: 'REJECTED';
      reason:
        | 'NO_FACE_MATCH'
        | 'LIVENESS_FAILED'
        | 'OUTSIDE_GEOFENCE'
        | 'DUPLICATE_CHECKIN'
        | 'NOT_EMPLOYED'
        | 'SITE_CLOSED'
        | 'OTHER';
      detail?: string;
    }
  | {
      status: 'PENDING_REVIEW';
      recordId: string;
      reason: string;
      detail?: string;
    };

/** ───── 수동 처리 ───── */

export type ManualAction = 'CHECK_IN' | 'CHECK_OUT';

export interface ManualCheckRequest {
  employmentId: string;
  action: ManualAction;
  /** 적용 일자 (오늘이 아니어도 가능) */
  date: string;
  /** 시각 — 기본은 서버 now */
  at?: string;
  /** 사유 — 5자 이상 필수 */
  reason: string;
}

export interface ManualCheckResponse {
  record: AttendanceRecord;
  auditLogId: string;
}

/** 공수 수동 변경 — 서버가 노임도 자동 재계산 */
export interface SetGongsuRequest {
  attendanceId: string;
  toGongsu: number;
  /** 노임도 함께 수동 지정할 경우 — 미지정 시 (toGongsu × dailyWage) 자동 계산 */
  toPay?: number;
  reason: string;
}

export interface SetGongsuResponse {
  record: AttendanceRecord;
  auditLogId: string;
}

/** ───── 일괄 처리 ───── */

export interface BulkCheckOutRequest {
  siteId: string;
  date: string;
  /** 비워두면 「오늘 WORKING 상태인 모든 워커」 일괄 퇴근 처리 */
  employmentIds?: string[];
  reason?: string;
}

export interface BulkCheckOutResponse {
  count: number;
  records: AttendanceRecord[];
  auditLogId: string;
}

/** ───── 조회 ───── */

export interface AttendanceMonthQuery {
  siteId: string;
  yearMonth: string;
}
