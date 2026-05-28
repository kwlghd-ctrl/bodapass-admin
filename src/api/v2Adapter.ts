import { InternalAxiosRequestConfig, AxiosResponse } from 'axios';

// Phase 10 v7 - v2Adapter neutralized.
// 모든 axios 요청을 그대로 실제 백엔드로 보낸다.
// PATH_MAP / NOT_YET_IMPLEMENTED / response wrapping 로직은 백엔드가 모두 구현되어 불필요.

export function applyV2PathRewrite(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  return config;
}

export function applyV2ResponseShape(response: AxiosResponse): AxiosResponse {
  return response;
}
