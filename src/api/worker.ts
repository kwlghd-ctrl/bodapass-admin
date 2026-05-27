/**
 * workerApi — 워커 마스터 CRUD
 *
 * Worker 는 사람 1명당 1행 (회사·현장 무관) — 영구 마스터.
 * 채용 관계(Employment) 와 분리되어 있다.
 */

import { apiClient } from './client';
import type {
  ListWorkersQuery,
  ListWorkersResponse,
  RegisterWorkerRequest,
  RegisterWorkerResponse,
  UpdateWorkerRequest,
  UpdateWorkerResponse,
  Worker,
  WorkerSensitiveInfo,
} from './worker.types';

export const workerApi = {
  list: async (q: ListWorkersQuery = {}): Promise<ListWorkersResponse> => {
    const { data } = await apiClient.get<ListWorkersResponse>('/v2/workers', { params: q });
    return data;
  },

  get: async (workerId: string): Promise<Worker> => {
    const { data } = await apiClient.get<Worker>(`/v2/workers/${workerId}`);
    return data;
  },

  /** 신규 워커 등록 — 서버가 workerCode 발급, trustTier 결정 */
  register: async (req: RegisterWorkerRequest): Promise<RegisterWorkerResponse> => {
    const { data } = await apiClient.post<RegisterWorkerResponse>('/v2/workers', req);
    return data;
  },

  update: async (workerId: string, req: UpdateWorkerRequest): Promise<UpdateWorkerResponse> => {
    const { data } = await apiClient.patch<UpdateWorkerResponse>(`/v2/workers/${workerId}`, req);
    return data;
  },

  /**
   * 민감정보 조회 — 평문 주민번호 / 계좌번호.
   *
   * ─── API Contract (실서비스 기준) ──────────────────────────────────────
   *
   *  서버는 본 endpoint 호출 시 다음을 원자적으로(atomic) 수행한다:
   *    1) 권한 확인 — 호출자가 worker 의 민감정보에 접근 가능한 role/scope 인지
   *    2) 감사로그 저장 — sensitive_access_logs 테이블에 INSERT (PostgreSQL)
   *         workerId, accessedBy, reason, targetMonth, siteId, ip, userAgent, at
   *    3) 민감정보 반환 — DB 에서 평문 조회 후 응답 body 에 포함
   *
   *  3단계 중 1) 또는 2) 가 실패하면 3) 은 절대 실행되지 않는다.
   *  audit 저장 실패 시 → 403 + "감사로그 저장 실패로 민감정보 반환 거부"
   *  권한 거부 시 → 403 + "민감정보 접근 권한 없음"
   *
   *  응답:
   *    · idNumberRaw: 13자리 주민등록번호 (대시 포함 가능)
   *    · accountNumberRaw: 은행 계좌번호
   *
   * ─── 현재 mock 구현 ────────────────────────────────────────────────
   *
   *  mockBackend 는 위 원자성을 시뮬레이션하나 audit 실패해도 진행 가능 (시연 단계).
   *  실서버 전환 시 위 contract 가 강제된다.
   *
   *  로컬 audit log (console.info) 는 시연용으로만 — 실제 서버 audit 와 별개.
   *
   * ─── 보안 정책 ─────────────────────────────────────────────────────
   *
   *  · 호출자(프런트)는 응답 body 의 평문을 메모리에서만 사용한다.
   *  · localStorage / sessionStorage / React state 장기 저장 금지.
   *  · 파일 생성 직후 변수 폐기.
   *  · 13자리 검증은 호출자가 수행 — 13자리 아니면 신고서 row 제외.
   *
   * ─── 호출 인자 ─────────────────────────────────────────────────────
   *
   *  options.reason       : 발급 사유 (예: 'INSURANCE_FILING_EXPORT', 'WAGE_LEDGER_EXPORT')
   *  options.targetMonth  : 사용 대상 월 ('YYYY-MM') — audit log 누적용
   *  options.siteId       : 현장 ID — audit log 누적용
   */
  /**
   * 민감정보 조회 — 표준화된 단일 POST 호출.
   *
   * 백엔드 API 계약:
   *   POST /v2/workers/:id/sensitive
   *   body: { reason, purpose?, fields?, targetMonth?, siteId? }
   *
   * 백엔드 내부에서 원자적으로 처리:
   *   1) 권한 확인 (Role + scope)
   *   2) SensitiveAccessLog INSERT (PostgreSQL)
   *   3) 평문 응답 반환
   *
   * 권한 거부 → 403, audit 실패 → 502 (둘 다 평문 반환 안 함).
   *
   * 옛 패턴 (GET + 별도 POST /audit/sensitive-access) 은 제거.
   * 호출자는 결과 평문을 메모리에서만 짧게 사용하고 즉시 폐기.
   */
  getSensitive: async (
    workerId: string,
    options: {
      reason: string;
      purpose?: 'WAGE_LEDGER' | 'INSURANCE_FILING' | 'AUDIT' | 'PAYMENT' | 'OTHER';
      fields?: Array<'residentNo' | 'bankAccount'>;
      targetMonth?: string;
      siteId?: string;
    },
  ): Promise<WorkerSensitiveInfo> => {
    const { data } = await apiClient.post<WorkerSensitiveInfo>(
      `/v2/workers/${workerId}/sensitive`,
      {
        reason: options.reason,
        purpose: options.purpose,
        fields: options.fields,
        targetMonth: options.targetMonth,
        siteId: options.siteId,
      },
    );
    return data;
  },

  /** 얼굴 재등록 — 서버에 얼굴 이미지 ID 만 전달, 서버가 매칭 처리 */
  reRegisterFace: async (workerId: string, faceImageId: string): Promise<Worker> => {
    const { data } = await apiClient.post<Worker>(`/v2/workers/${workerId}/face`, { faceImageId });
    return data;
  },
};
