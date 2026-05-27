/**
 * attendanceV2 — employmentId 기반 출퇴근 API
 *
 * 실서버 전환 시 동일 endpoint 로 동작. 얼굴인식 매칭·생체검증·지오펜스 판정
 * 은 모두 서버가 수행 — 프런트는 이미지·위치·기기 정보만 전송한다.
 */

import { apiClient } from './client';
import type {
  AttendanceMonth,
  AttendanceMonthQuery,
  BulkCheckOutRequest,
  BulkCheckOutResponse,
  FaceCheckRequest,
  FaceCheckResponse,
  ManualCheckRequest,
  ManualCheckResponse,
  SetGongsuRequest,
  SetGongsuResponse,
  TodayAttendance,
} from './attendanceV2.types';

export const attendanceV2Api = {
  /** 월간 출퇴근 (employmentId 기반) */
  month: async (q: AttendanceMonthQuery): Promise<AttendanceMonth> => {
    const { data } = await apiClient.get<AttendanceMonth>('/v2/attendance/month', { params: q });
    return data;
  },

  today: async (siteId: string): Promise<TodayAttendance> => {
    const { data } = await apiClient.get<TodayAttendance>('/v2/attendance/today', {
      params: { siteId },
    });
    return data;
  },

  /** 얼굴 출근 — 서버가 매칭/생체검증/지오펜스 모두 판정 */
  faceCheckIn: async (req: FaceCheckRequest): Promise<FaceCheckResponse> => {
    const { data } = await apiClient.post<FaceCheckResponse>('/v2/attendance/face-checkin', req);
    return data;
  },

  faceCheckOut: async (req: FaceCheckRequest): Promise<FaceCheckResponse> => {
    const { data } = await apiClient.post<FaceCheckResponse>('/v2/attendance/face-checkout', req);
    return data;
  },

  /** 수동 출퇴근 — 사유 5자 이상 + auditLog 자동 기록 */
  manualCheck: async (req: ManualCheckRequest): Promise<ManualCheckResponse> => {
    const { data } = await apiClient.post<ManualCheckResponse>('/v2/attendance/manual-check', req);
    return data;
  },

  /** 공수 수동 변경 + 노임 자동 재계산 + auditLog */
  setGongsu: async (req: SetGongsuRequest): Promise<SetGongsuResponse> => {
    const { data } = await apiClient.post<SetGongsuResponse>('/v2/attendance/set-gongsu', req);
    return data;
  },

  /** 18시 미퇴근자 일괄 처리 */
  bulkCheckOut: async (req: BulkCheckOutRequest): Promise<BulkCheckOutResponse> => {
    const { data } = await apiClient.post<BulkCheckOutResponse>('/v2/attendance/bulk-check-out', req);
    return data;
  },
};
