/**
 * companyInfo — 「설정 > 회사 정보」 탭의 데이터 영속화·디폴트 공유 모듈
 *
 * 운영 목적:
 *   · 계약서 다이얼로그 / 노임명세 발행 / 보고서 헤더 등 여러 화면이 회사 기본정보를 사용하는데,
 *     매번 SettingsPage 의 내부 함수를 재구현하지 않도록 한 곳에 모은다.
 *   · 사용자가 SettingsPage 에서 저장 버튼을 한 번도 누르지 않은 상태에서도
 *     하드코딩된 디폴트가 다른 화면에 제공된다.
 *
 * 영속화 키: 'ilgampack_admin:company' (SettingsPage 와 동일)
 */

export interface CompanyInfo {
  code: string;
  groupCode: string;
  /** 회사명 */
  name: string;
  bizNo: string;
  /** 대표자명 */
  ceoName: string;
  postalCode: string;
  /** 회사 주소 (우편번호 제외 본 주소) */
  address: string;
  /** 회사 주소 상세 */
  addressDetail: string;
  email: string;
  /** 회사 대표 전화 */
  phone: string;
  fax: string;
  createdAt: string;
}

export const COMPANY_INFO_KEY = 'ilgampack_admin:company';

/**
 * SettingsPage 가 처음 열렸을 때 보여줄 디폴트.
 * 사용자가 명시적으로 저장(localStorage 기록)하지 않은 상태에서도
 * 다른 화면(계약서 등)에서 동일한 값을 디폴트로 사용한다.
 */
export const DEFAULT_COMPANY_INFO: CompanyInfo = {
  code: '26400002',
  groupCode: 'G3',
  name: 'BODA_G3',
  bizNo: '123456780',
  ceoName: 'BODA_G3_CHIEF',
  postalCode: '012345',
  address: '성수',
  addressDetail: '2동',
  email: 'boda_g3@gmail.com',
  phone: '01012345678',
  fax: '0212345678',
  createdAt: '',
};

/**
 * 현재 저장된 회사 정보를 로드.
 *  · localStorage 에 값이 있으면 그대로 반환
 *  · 없으면 DEFAULT_COMPANY_INFO 반환 (저장하지는 않음)
 */
export function loadCompanyInfo(): CompanyInfo {
  try {
    const raw = localStorage.getItem(COMPANY_INFO_KEY);
    if (raw) return JSON.parse(raw) as CompanyInfo;
  } catch {
    /* ignore */
  }
  return DEFAULT_COMPANY_INFO;
}

/**
 * 회사 정보를 localStorage 에 저장.
 */
export function saveCompanyInfo(info: CompanyInfo): void {
  try {
    localStorage.setItem(COMPANY_INFO_KEY, JSON.stringify(info));
  } catch {
    /* ignore */
  }
}

/**
 * 계약서·문서 발행 등 외부 화면용 — 회사 정보 중 자주 쓰는 4개 필드만 추출.
 * 주소는 address + addressDetail 을 결합한 풀 주소로 반환.
 */
export interface CompanyDisplayInfo {
  companyName: string;
  ceoName: string;
  companyAddr: string;
  companyPhone: string;
}

export function loadCompanyDisplayInfo(): CompanyDisplayInfo {
  const c = loadCompanyInfo();
  const fullAddr = [c.address ?? '', c.addressDetail ?? '']
    .filter(Boolean)
    .join(' ')
    .trim();
  return {
    companyName: c.name ?? '',
    ceoName: c.ceoName ?? '',
    companyAddr: fullAddr,
    companyPhone: c.phone ?? '',
  };
}
