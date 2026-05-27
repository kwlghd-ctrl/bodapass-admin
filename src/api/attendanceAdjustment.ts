/**
 * attendanceAdjustmentApi — 출퇴근 보정 신청 CRUD
 */

import { apiClient } from './client';
import type {
  AttendanceAdjustmentRequest,
  ApproveAdjustmentRequest,
  CancelAdjustmentRequest,
  CreateAdjustmentRequest,
  ListAdjustmentsQuery,
  ListAdjustmentsResponse,
  RejectAdjustmentRequest,
} from './attendanceAdjustment.types';

export const attendanceAdjustmentApi = {
  list: async (q: ListAdjustmentsQuery = {}): Promise<ListAdjustmentsResponse> => {
    const { data } = await apiClient.get<ListAdjustmentsResponse>('/v2/attendance-adjustments', { params: q });
    return data;
  },

  get: async (id: string): Promise<AttendanceAdjustmentRequest> => {
    const { data } = await apiClient.get<AttendanceAdjustmentRequest>(`/v2/attendance-adjustments/${id}`);
    return data;
  },

  create: async (req: CreateAdjustmentRequest): Promise<AttendanceAdjustmentRequest> => {
    const { data } = await apiClient.post<AttendanceAdjustmentRequest>('/v2/attendance-adjustments', req);
    return data;
  },

  approve: async (id: string, req: ApproveAdjustmentRequest = {}): Promise<AttendanceAdjustmentRequest> => {
    const { data } = await apiClient.post<AttendanceAdjustmentRequest>(`/v2/attendance-adjustments/${id}/approve`, req);
    return data;
  },

  reject: async (id: string, req: RejectAdjustmentRequest): Promise<AttendanceAdjustmentRequest> => {
    const { data } = await apiClient.post<AttendanceAdjustmentRequest>(`/v2/attendance-adjustments/${id}/reject`, req);
    return data;
  },

  cancel: async (id: string, req: CancelAdjustmentRequest = {}): Promise<AttendanceAdjustmentRequest> => {
    const { data } = await apiClient.post<AttendanceAdjustmentRequest>(`/v2/attendance-adjustments/${id}/cancel`, req);
    return data;
  },
};
