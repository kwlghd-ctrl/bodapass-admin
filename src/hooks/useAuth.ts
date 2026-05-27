import { useCallback, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api/auth';
import { tokenStore } from '../api/client';
import type { AdminUser, LoginRequest } from '../api/types';

const USER_KEY = 'ilgampack_admin:user';

/**
 * 사용자의 화면 모드.
 *  - 'HQ'   : 본사 사용자 (OWNER 또는 assignedSiteId='ALL')
 *  - 'SITE' : 현장담당자 (assignedSiteId 가 특정 site id)
 */
export type ViewMode = 'HQ' | 'SITE';

export function getViewMode(user: AdminUser | null): ViewMode {
  if (!user) return 'HQ'; // 로그인 전 상태는 일단 HQ 로 간주 (라우터가 /login 으로 보냄)
  if (user.role === 'OWNER') return 'HQ';
  if (!user.assignedSiteId || user.assignedSiteId === 'ALL') return 'HQ';
  return 'SITE';
}

/**
 * 관리자 인증 훅
 *  - localStorage에 user 캐시 저장 → 새로고침해도 유지
 *  - 토큰만 남고 user가 비었을 때 /auth/me 로 회복
 */
export function useAuth() {
  const [user, setUser] = useState<AdminUser | null>(() => {
    const cached = localStorage.getItem(USER_KEY);
    return cached ? (JSON.parse(cached) as AdminUser) : null;
  });

  useEffect(() => {
    // Cookie 기반 인증에서는 tokenStore.getAccess() 가 비어있어도
    // cookie 가 살아있으면 /auth/me 호출이 성공할 수 있다.
    // user 가 없으면 항상 한 번 시도 → 실패하면 인터셉터가 /login 으로.
    if (!user) {
      authApi
        .me()
        .then(setUser)
        .catch(() => {
          /* 무시 — 401 이면 인터셉터가 /login 으로 떨궈줌 */
        });
    } else if (
      user.assignedSiteId === undefined &&
      user.role !== 'OWNER'
    ) {
      // 옛 캐시 — assignedSiteId 누락된 매니저/스태프 사용자 → 서버 재조회
      authApi
        .me()
        .then(setUser)
        .catch(() => { /* 무시 */ });
    }
  }, [user]);

  useEffect(() => {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  }, [user]);

  const login = useCallback(async (req: LoginRequest) => {
    const res = await authApi.login(req);
    // Cookie 기반 인증에서는 accessToken/refreshToken 이 cookie 로 자동 발급되어
    // body 가 비어있을 수 있다. tokenStore 는 mock/legacy 호환만 — 있으면 저장.
    if (res.accessToken && res.refreshToken) {
      tokenStore.set(res.accessToken, res.refreshToken);
    } else if (res.accessToken) {
      tokenStore.set(res.accessToken, ''); // refresh 는 cookie 에 있음
    }
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      tokenStore.clear();
      localStorage.removeItem(USER_KEY);
      setUser(null);
    }
  }, []);

  const viewMode = useMemo<ViewMode>(() => getViewMode(user), [user]);
  /** 현장담당자일 때 자기에게 배정된 현장 id (HQ 면 null) */
  const assignedSiteId = useMemo<string | null>(() => {
    if (!user || user.assignedSiteId === undefined || user.assignedSiteId === 'ALL') return null;
    return user.assignedSiteId;
  }, [user]);

  return { user, login, logout, isAuthenticated: !!user, viewMode, assignedSiteId };
}
