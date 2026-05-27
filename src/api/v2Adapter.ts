/**
 * v2 경로 어댑터 — 관리자 웹 코드는 `/v2/...` 경로를 호출하지만,
 * 백엔드(NestJS) 는 v2 prefix 없이 `/companies`, `/workers` 등을 노출한다.
 *
 * 코드를 일일이 바꾸지 않고 apiClient 요청 시점에 path 를 자동 변환한다.
 *
 * USE_MOCK=true (mock 환경) 에서는 그대로 통과시켜 mockBackend 가 처리하게 한다.
 */
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

const USE_MOCK = (import.meta.env.VITE_USE_MOCK ?? 'true') !== 'false';

/**
 * v2 경로 → 백엔드 경로 매핑.
 *
 * 키는 prefix (path 가 키로 시작하면 매칭됨).
 * 값은 백엔드 경로로 치환할 prefix.
 * 매핑 없으면 그대로 통과 (mock 환경 또는 백엔드 구현 후 추가).
 */
const PATH_MAP: Array<[from: RegExp, to: string]> = [
  // 회사/현장/업체
  [/^\/v2\/companies(\/|$|\?)/, '/companies$1'],
  [/^\/v2\/sites(\/|$|\?)/, '/sites$1'],
  [/^\/v2\/site-companies(\/|$|\?)/, '/site-companies$1'],

  // 워커/고용
  [/^\/v2\/workers(\/|$|\?)/, '/workers$1'],
  [/^\/v2\/employments(\/|$|\?)/, '/employments$1'],

  // 출역
  [/^\/v2\/attendance(\/|$|\?)/, '/attendance$1'],

  // 임금/정산
  [/^\/v2\/wage(\/|$|\?)/, '/wage$1'],

  // 산출물
  [/^\/v2\/output(\/|$|\?)/, '/output$1'],

  // 감사
  [/^\/v2\/audit(\/|$|\?)/, '/audit$1'],

  // 인증 / 신뢰점수 / 알림 (관리자→모바일 readonly view 가 필요할 경우)
  [/^\/v2\/foremen(\/|$|\?)/, '/users$1'],  // 임시 — 향후 admin-foreman endpoint 추가 시 변경
];

/**
 * 백엔드에 아직 구현 안 된 관리자 API 들 — 그대로 통과시키지 않고 의도적으로 표시.
 * USE_MOCK=true 일 때는 mockBackend 가 처리.
 * USE_MOCK=false 일 때는 console.warn 로 알리고 그대로 통과 (404 발생 가능).
 */
const NOT_YET_IMPLEMENTED = [
  '/dashboard/summary',
  '/foreman-sites',
  '/foreman-metrics',
  '/severance/month',
  '/team/members',
  '/v2/dashboard',
];

export function applyV2PathRewrite(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  // mock 모드에서는 변환 안 함 — mockBackend 가 /v2 그대로 매칭
  if (USE_MOCK) return config;

  let url = config.url ?? '';
  if (!url) return config;

  // 1) 경로 변환 시도
  for (const [from, to] of PATH_MAP) {
    if (from.test(url)) {
      url = url.replace(from, to);
      config.url = url;
      return config;
    }
  }

  // 2) 미구현 API 경고
  for (const path of NOT_YET_IMPLEMENTED) {
    if (url.startsWith(path)) {
      // eslint-disable-next-line no-console
      console.warn(`[v2Adapter] ${url} 은 백엔드에 아직 구현되지 않음 (mock 모드에서만 동작)`);
      break;
    }
  }

  return config;
}

/**
 * 응답 shape 변환 — 백엔드는 list endpoint 가 배열을 직접 반환하지만,
 * admin 코드는 { companies: [...] } 같은 wrapper 를 기대한다.
 *
 * mock 모드는 이미 wrapper 형태로 응답하므로 통과.
 * 실서버 모드 (VITE_USE_MOCK=false) 에서만 path 별로 array → wrapper 변환.
 */
const ARRAY_TO_WRAPPER: Array<{ pattern: RegExp; key: string }> = [
  { pattern: /^\/companies(\?|$)/,       key: 'companies'    },
  { pattern: /^\/sites(\?|$)/,           key: 'sites'        },
  { pattern: /^\/site-companies(\?|$)/,  key: 'siteCompanies' },
  { pattern: /^\/workers(\?|$)/,         key: 'workers'      },
  { pattern: /^\/employments(\?|$)/,     key: 'employments'  },
];

export function applyV2ResponseShape(response: AxiosResponse): AxiosResponse {
  if (USE_MOCK) return response;
  // GET 요청만 변환 (POST/PATCH 응답은 다양해서 손대지 않음)
  const method = (response.config?.method ?? 'get').toLowerCase();
  if (method !== 'get') return response;

  const url = response.config?.url ?? '';
  if (!url) return response;

  const matched = ARRAY_TO_WRAPPER.find(({ pattern }) => pattern.test(url));
  if (!matched) return response;

  // 백엔드가 배열을 직접 반환했다면 wrapper 로 감쌈
  if (Array.isArray(response.data)) {
    response.data = { [matched.key]: response.data, total: response.data.length };
  }
  return response;
}
