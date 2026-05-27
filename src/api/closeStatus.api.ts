/**
 * closeStatusApi — 마감 상태 머신 전이·조회
 *
 * 실서버 전환 시 동일 endpoint 로 동작. 전이 권한·역방향 사유 등은 서버가 검증.
 */

import { apiClient } from './client';
import type {
  CloseStage,
  CloseStageTransitionRequest,
  CloseStageTransitionResponse,
  CloseStatusEntry,
} from './closeStatus';

export const closeStatusApi = {
  /** 특정 사이트·기간의 상태 조회 */
  get: async (q: {
    scope: 'DAY' | 'MONTH';
    siteId: string;
    date?: string;
    yearMonth?: string;
  }): Promise<CloseStatusEntry> => {
    const { data } = await apiClient.get<CloseStatusEntry>('/v2/close-status', { params: q });
    return data;
  },

  /** 정방향 전이 — 다음 단계로 진행 */
  advance: async (req: Omit<CloseStageTransitionRequest, 'reason'> & { reason?: string }): Promise<CloseStageTransitionResponse> => {
    const { data } = await apiClient.post<CloseStageTransitionResponse>('/v2/close-status/advance', req);
    return data;
  },

  /** 역방향 전이 — 마감 취소 (REOPEN). 사유 필수. */
  reopen: async (req: CloseStageTransitionRequest & { reason: string }): Promise<CloseStageTransitionResponse> => {
    const { data } = await apiClient.post<CloseStageTransitionResponse>('/v2/close-status/reopen', req);
    return data;
  },

  /** 사이트 전체의 현재 stage 일괄 조회 — 대시보드 「월 마감 진행」 카드용 */
  bulkBySite: async (yearMonth: string): Promise<Array<{ siteId: string; stage: CloseStage }>> => {
    const { data } = await apiClient.get<Array<{ siteId: string; stage: CloseStage }>>(
      '/v2/close-status/bulk',
      { params: { yearMonth } },
    );
    return data;
  },
};
