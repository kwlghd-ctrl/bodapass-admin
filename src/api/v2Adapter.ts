import { InternalAxiosRequestConfig, AxiosResponse } from 'axios';

const USE_MOCK = (import.meta.env.VITE_USE_MOCK ?? 'true') !== 'false';

// PATH_MAP - rewrite admin v2 paths to actual backend paths.
const PATH_MAP: Array<[RegExp, string]> = [
  [/^\/v2\/companies(\/|$|\?)/,       '/companies$1'],
  [/^\/v2\/sites(\/|$|\?)/,           '/sites$1'],
  [/^\/v2\/site-companies(\/|$|\?)/,  '/site-companies$1'],
  [/^\/v2\/workers(\/|$|\?)/,         '/workers$1'],
  [/^\/v2\/employments(\/|$|\?)/,     '/employments$1'],
  [/^\/v2\/attendance(\/|$|\?)/,      '/attendance$1'],
  [/^\/v2\/wage(\/|$|\?)/,            '/wage$1'],
  [/^\/v2\/output(\/|$|\?)/,          '/output$1'],
  [/^\/v2\/audit(\/|$|\?)/,           '/audit$1'],
  [/^\/v2\/foremen(\/|$|\?)/,         '/users$1'],
];

// Phase 10 v7 - NOT_YET_IMPLEMENTED emptied: all paths now reach real backend.
const NOT_YET_IMPLEMENTED: string[] = [];

export function applyV2PathRewrite(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  if (USE_MOCK) return config;
  let url = config.url ?? '';
  if (!url) return config;
  // 1) path rewrite
  for (const [from, to] of PATH_MAP) {
    if (from.test(url)) {
      url = url.replace(from, to);
      config.url = url;
      return config;
    }
  }
  // 2) not-yet-implemented warning (empty list now)
  for (const path of NOT_YET_IMPLEMENTED) {
    if (url.startsWith(path)) {
      // eslint-disable-next-line no-console
      console.warn(`[v2Adapter] ${url} is in mock-only list`);
      break;
    }
  }
  return config;
}

// ARRAY_TO_WRAPPER - wrap bare-array list responses into { key: [...], total }.
const ARRAY_TO_WRAPPER: Array<{ pattern: RegExp; key: string }> = [
  { pattern: /^\/companies(\?|$)/,       key: 'companies'    },
  { pattern: /^\/sites(\?|$)/,           key: 'sites'        },
  { pattern: /^\/site-companies(\?|$)/,  key: 'siteCompanies' },
  { pattern: /^\/workers(\?|$)/,         key: 'workers'      },
  { pattern: /^\/employments(\?|$)/,     key: 'employments'  },
];

export function applyV2ResponseShape(response: AxiosResponse): AxiosResponse {
  if (USE_MOCK) return response;
  const method = (response.config?.method ?? 'get').toLowerCase();
  if (method !== 'get') return response;
  const url = response.config?.url ?? '';
  if (!url) return response;
  const matched = ARRAY_TO_WRAPPER.find(({ pattern }) => pattern.test(url));
  if (!matched) return response;
  if (Array.isArray(response.data)) {
    response.data = { [matched.key]: response.data, total: response.data.length };
  }
  return response;
}
