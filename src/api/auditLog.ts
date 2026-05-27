/**
 * auditLogApi — 감사 로그 조회·기록
 *
 * 모든 mutation API 가 내부적으로 자동 기록하므로, 클라이언트는 일반적으로
 * 조회만 사용한다. 직접 기록이 필요한 케이스는 추후 추가.
 */

import { apiClient } from './client';
import type {
  AuditLogEntry,
  ListAuditLogQuery,
  ListAuditLogResponse,
} from './auditLog.types';

export const auditLogApi = {
  list: async (q: ListAuditLogQuery = {}): Promise<ListAuditLogResponse> => {
    const { data } = await apiClient.get<ListAuditLogResponse>('/v2/audit-log', { params: q });
    return data;
  },

  get: async (auditId: string): Promise<AuditLogEntry> => {
    const { data } = await apiClient.get<AuditLogEntry>(`/v2/audit-log/${auditId}`);
    return data;
  },
};
