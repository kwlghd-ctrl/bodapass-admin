// FILE_VERSION 1777950600
// Dashboard 페이지 — 순수 포매팅/헬퍼 유틸
// DashboardPage.tsx 에서 추출 (V1 분리)

/** 금액 표시 — 1,234,567원 */
export function krw(n: number): string {
  return (n || 0).toLocaleString() + '원';
}

/** 금액 짧은 표시 — 1.2억 / 12만 / 12,345 */
export function krwShort(n: number) {
  if (n >= 100_000_000_000) return `${(n / 100_000_000_000).toFixed(1)}천억`;
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString();
}

/** 콤팩트 KPI 숫자 — '억/만' 단위 압축 */
export function k(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0';
  if (n >= 100_000_000) return (n / 100_000_000).toFixed(1).replace(/\.0$/, '') + '억';
  if (n >= 10_000) return Math.round(n / 10_000).toLocaleString() + '만';
  return n.toLocaleString();
}

/** 010-1234-5678 형식 */
export function fmtKrPhone(p: string): string {
  const d = (p || '').replace(/\D/g, '');
  if (d.length === 11) return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
  if (d.length === 10) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
  return p;
}

/** id 중복 제거 — 순서 유지 */
export function dedupById<T extends { id: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of arr) {
    if (seen.has(x.id)) continue;
    seen.add(x.id);
    out.push(x);
  }
  return out;
}

/** 공사기간 표시용 — 총일수/잔여일수/진척율/기간문자열 */
export function buildPeriodInfo(start: string, end: string) {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const now = Date.now();
  const totalDays = Math.max(1, Math.round((e - s) / 86_400_000));
  const remainDays = Math.max(0, Math.round((e - now) / 86_400_000));
  const elapsedPct = Math.max(0, Math.min(100, ((now - s) / (e - s)) * 100));
  const months = Math.round(totalDays / 30);
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  const duration =
    years > 0
      ? `${years}년 ${remMonths > 0 ? remMonths + '개월' : ''}`.trim()
      : `${months}개월`;
  return { totalDays, remainDays, elapsedPct, duration };
}

/* 계정 → 현장 담당자 매핑 (설정 → 계정 관리)
 * 없으면 null (대시보드는 site.manager 폴백) */
export function getAccountManagerForSite(siteId: string): { name: string; phone: string } | null {
  try {
    const raw = localStorage.getItem('ilgampack_admin:accounts');
    if (!raw) return null;
    const list = JSON.parse(raw) as Array<{
      name: string;
      phone: string;
      role: 'OWNER' | 'MANAGER' | 'STAFF';
      permissions?: { scope?: string };
    }>;
    const m = list.find(
      (a) => a.role === 'MANAGER' && a.permissions?.scope === siteId,
    );
    if (!m) return null;
    return { name: m.name, phone: m.phone };
  } catch {
    return null;
  }
}

/** Phase CC3 — 한국어 날짜+시간 풀 포맷 (yyyy.MM.dd HH:mm:ss). 'ko-KR' 로컬. */
export function fmtKoFullDateTime(d: Date): string {
  return d.toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

/** Phase CC3 — 한국어 천단위 구분자 + '원' 접미. (예: 1,234원) */
export function fmtKrwAmount(n: number): string {
  return (n || 0).toLocaleString('ko-KR') + '원';
}
