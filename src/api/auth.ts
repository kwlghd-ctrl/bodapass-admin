import { apiClient } from './client';
import type { AdminUser, LoginRequest, LoginResponse } from './types';

/**
 * 관리자 인증 API
 *
 * 백엔드 (NestJS) 와의 정합성:
 *  - 요청: { email, password }  (관리자 화면 입력 'loginId' → email 로 변환)
 *  - 응답: { accessToken, refreshToken?, user }
 *  - cookie 기반 인증 — apiClient 가 withCredentials=true 설정
 */
export const authApi = {
  login: async (req: LoginRequest): Promise<LoginResponse> => {
    // 백엔드는 email 필드를 받으므로 loginId 를 email 로 변환.
    // loginId 가 이미 email 형식이면 그대로, 아니면 도메인 추가 fallback.
    const email = req.loginId.includes('@')
      ? req.loginId
      : `${req.loginId}@bodapass.local`;
    const body = {
      email,
      password: req.password,
      remember: req.remember,
    };
    const { data } = await apiClient.post<LoginResponse>('/auth/login', body);
    return data;
  },
  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
  },
  me: async (): Promise<AdminUser> => {
    const { data } = await apiClient.get<AdminUser>('/auth/me');
    return data;
  },
};
