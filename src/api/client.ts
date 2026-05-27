import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
/*
 * ════════════════════════════════════════════════════════════════════
 *  TODO(보안 — 실서비스 전환 시):
 * ════════════════════════════════════════════════════════════════════
 *
 *  1) refreshToken: 현재 localStorage 보관.
 *     실서비스에서는 httpOnly Secure SameSite=Strict Cookie 로 전환한다.
 *     · XSS 공격으로 인한 토큰 탈취 방어
 *     · accessToken 만 메모리 또는 단기 sessionStorage 에 보관
 *     · CSRF 방지를 위해 별도 csrfToken 동시 발급
 *
 *  2) accessToken 만료 시 자동 refresh:
 *     서버가 401 + 'TOKEN_EXPIRED' header 를 응답 시,
 *     axios interceptor 가 /v2/auth/refresh 호출 후 원 요청 재시도.
 *     현재도 가능하지만 refresh 1회용 로테이션은 미구현 — 서버 전환 시 추가.
 *
 *  3) 응답에 평문 민감정보(idNumberRaw, accountNumberRaw)가 포함되는 경우,
 *     'Cache-Control: no-store' 헤더 + 클라이언트 로그 미저장 정책 필요.
 *
 *  4) idNumberRaw / accountNumberRaw 는 기본 Worker 응답에서 제외되었다.
 *     필요 시 /v2/workers/:id/sensitive 호출로만 접근.
 */
import { setupMockBackend } from './mockBackend';
import { applyV2PathRewrite, applyV2ResponseShape } from './v2Adapter';

/**
 * 관리자 웹 API 클라이언트
 * - 앱과 동일한 패턴: 토큰 자동 첨부 + 401 시 1회 재발급
 * - 토큰 키는 앱과 별도 네임스페이스(`ilgampack_admin:*`)로 충돌 방지
 * - VITE_USE_MOCK=true(기본)이면 src/api/mockBackend.ts 가 응답
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';
const USE_MOCK = (import.meta.env.VITE_USE_MOCK ?? 'true') !== 'false';

/**
 * tokenStore — 관리자 웹은 cookie 기반 인증으로 전환 (Phase 11).
 *
 * 옛 localStorage refreshToken 보관은 보안상 폐기되었음.
 * - 실서비스: refreshToken 은 httpOnly Secure cookie 로만 보관 (백엔드가 발급/갱신).
 * - accessToken 도 cookie 동행 (withCredentials=true).
 *
 * 본 객체는 mock 모드 호환을 위해 메모리(in-session) only 로 유지된다.
 *  - VITE_USE_MOCK=true 일 때만 의미가 있음.
 *  - 실서버 모드에서는 set()/getAccess() 가 사용되지 않음.
 */
let sessionAccessToken: string | null = null;
let sessionRefreshToken: string | null = null;

export const tokenStore = {
  getAccess: () => sessionAccessToken,
  getRefresh: () => sessionRefreshToken,
  set: (access: string, refresh: string) => {
    sessionAccessToken = access;
    sessionRefreshToken = refresh;
  },
  clear: () => {
    sessionAccessToken = null;
    sessionRefreshToken = null;
  },
};

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
  // 백엔드 cookie 기반 인증 (CSRF + refresh) 을 위해 자동으로 cookie 동행
  withCredentials: true,
});

// Mock 백엔드 셋업 — apiClient 인스턴스에 어댑터로 붙여 네트워크에 나가지 않게 한다
if (USE_MOCK && typeof window !== 'undefined') {
  setupMockBackend(apiClient);
}

/** cookie 에서 값 읽기 — CSRF 토큰 첨부에 사용 */
function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

/**
 * 앱 시작 시 호출 — 백엔드의 GET /api/csrf 로 csrf_token cookie 발급.
 * 실패해도 조용히 통과 (mock 환경 등에서 동작 안 함).
 */
export async function bootstrapCsrf(): Promise<void> {
  if (USE_MOCK) return;
  try {
    await apiClient.get('/csrf');
  } catch (e) {
    // ignore — 일부 환경에서 미구현 가능
  }
}

// 요청 인터셉터 — v2 경로 변환 + Access Token + CSRF 헤더 자동 첨부
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // 1) /v2/* → 백엔드 경로 변환 (실서버 모드만)
  config = applyV2PathRewrite(config);

  // 2) Access Token (Bearer) — 모바일/이전 호환
  const token = tokenStore.getAccess();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // 3) CSRF — mutation 요청 (POST/PUT/PATCH/DELETE) 에만 헤더 추가
  const method = (config.method ?? 'get').toLowerCase();
  if (['post', 'put', 'patch', 'delete'].includes(method) && config.headers) {
    const csrfToken = readCookie('csrf_token');
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
  }
  return config;
});

// 응답 — 401 시 cookie 기반 /auth/refresh 호출 후 1회 재시도.
// 실서버 모드: refreshToken cookie 는 백엔드가 자동 처리 (body 미전달).
// mock 모드: tokenStore 에 있는 refreshToken body 로 전달 (옛 호환).
let isRefreshing = false;
let pendingQueue: Array<(token: string | null) => void> = [];

apiClient.interceptors.response.use(
  (res) => applyV2ResponseShape(res), // 실서버 배열 응답 → admin wrapper 형태로 변환
  async (error: AxiosError) => {
    const originalReq = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalReq._retry) {
      originalReq._retry = true;

      if (isRefreshing) {
        return new Promise((resolve) => {
          pendingQueue.push((newToken) => {
            if (originalReq.headers && newToken) {
              originalReq.headers.Authorization = `Bearer ${newToken}`;
            }
            resolve(apiClient(originalReq));
          });
        });
      }

      isRefreshing = true;
      try {
        // cookie 기반 refresh — body 없이 호출하면 백엔드가 cookie 의 refresh token 사용
        // mock/옛 호환을 위해 tokenStore 의 refresh 가 있으면 body 로 함께 전달
        const refreshToken = tokenStore.getRefresh();
        const body = refreshToken ? { refreshToken } : {};

        const { data } = await axios.post<{ accessToken: string; refreshToken: string }>(
          `${BASE_URL}/auth/refresh`,
          body,
          { withCredentials: true },
        );
        tokenStore.set(data.accessToken, data.refreshToken);
        pendingQueue.forEach((cb) => cb(data.accessToken));
        pendingQueue = [];

        if (originalReq.headers) {
          originalReq.headers.Authorization = `Bearer ${data.accessToken}`;
        }
        return apiClient(originalReq);
      } catch (refreshError) {
        tokenStore.clear();
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export function getErrorMessage(err: unknown, fallback = '오류가 발생했습니다.'): string {
  // axios 정식 에러
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string } | undefined;
    return data?.message ?? err.message ?? fallback;
  }
  // mock 어댑터가 reject 하는 plain object — { response: { data: { message } }, message }
  if (err && typeof err === 'object') {
    const e = err as { response?: { data?: { message?: string } }; message?: string };
    const m = e.response?.data?.message ?? e.message;
    if (m) return m;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
