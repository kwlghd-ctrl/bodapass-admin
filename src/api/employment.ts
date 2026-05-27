/**
 * employmentApi — 채용 관계 CRUD
 *
 * Attendance / Wage / Insurance / Severance 의 외래키 주체.
 * 모든 도메인 데이터는 employmentId 기준으로 조회·집계된다.
 */

import { apiClient } from './client';
import type {
  CreateEmploymentRequest,
  Employment,
  EmploymentView,
  ListEmploymentsQuery,
  ListEmploymentsResponse,
  ListEmploymentViewsResponse,
  UpdateEmploymentRequest,
} from './employment.types';

export const employmentApi = {
  /** 로우 Employment 목록 (가벼움) */
  list: async (q: ListEmploymentsQuery = {}): Promise<ListEmploymentsResponse> => {
    const { data } = await apiClient.get<ListEmploymentsResponse>('/v2/employments', { params: q });
    return data;
  },

  /**
   * 화면용 합쳐진 뷰 — Employment + Worker + SiteCompany joined.
   * 목록·상세 화면이 「이름·전화·계좌·현장명·회사명」 한 번에 표시할 때.
   */
  listViews: async (q: ListEmploymentsQuery = {}): Promise<ListEmploymentViewsResponse> => {
    const { data } = await apiClient.get<ListEmploymentViewsResponse>('/v2/employments/views', { params: q });
    return data;
  },

  get: async (employmentId: string): Promise<EmploymentView> => {
    const { data } = await apiClient.get<EmploymentView>(`/v2/employments/${employmentId}`);
    return data;
  },

  create: async (req: CreateEmploymentRequest): Promise<Employment> => {
    const { data } = await apiClient.post<Employment>('/v2/employments', req);
    return data;
  },

  update: async (employmentId: string, req: UpdateEmploymentRequest): Promise<Employment> => {
    const { data } = await apiClient.patch<Employment>(`/v2/employments/${employmentId}`, req);
    return data;
  },

  /** 채용 종료 (이탈) — endDate + reason 기록, auditLog 자동 생성 */
  terminate: async (employmentId: string, endDate: string, reason: string): Promise<Employment> => {
    const { data } = await apiClient.post<Employment>(
      `/v2/employments/${employmentId}/terminate`,
      { endDate, reason },
    );
    return data;
  },
};
