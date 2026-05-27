/**
 * Worker — 마스터 워커 (사람 1명당 1행, 회사·현장 무관)
 *
 * 한 사람의 신원·얼굴·계좌·검증 등급을 모은 영구 마스터.
 * 회사 간 출역·임금·교육이수 누적은 모두 workerCode 기반으로 합산된다.
 *
 * 채용 관계(Employment) 는 별도 엔티티 — 한 워커가 여러 회사·현장에 채용 가능.
 */

export type IdType = 1 | 2 | 3; // 1: 주민등록증, 2: 외국인등록증, 3: 기타

/**
 * 신뢰등급 (Trust Tier) — 신원 검증 완료 정도
 *  T1: 얼굴+신분증+본인통장 (정식)     → 4대보험·세금 자동
 *  T2: 얼굴+신분증+가족·반장통장 (부분) → 4대보험·세금 자동, 임금만 대리
 *  T3: 얼굴만 (제한)                    → 출역·임금만 추적, 4대보험·세금 X
 *  T4: 별도 출입기록만 (시스템 외부)   → 본 인터페이스엔 등장 X
 */
export type TrustTier = 1 | 2 | 3;

export type WorkerStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING';

export interface Worker {
  /** 내부 PK — 신규 등록 시 timestamp 기반 생성 */
  id: string;

  /** 워커 관리번호 — 사람 1명당 1개 영구 발급. 형식: M-26-00123 / F-26-00456 */
  workerCode: string;

  name: string;
  phone: string;

  idType: IdType;
  /** 마스킹된 주민/외국인등록번호 — UI 노출용. 평문은 별도 SensitiveInfo API */
  idNumberMasked: string;

  /** 신분증 발급 주소 — 옵션 (실서비스: 마스킹 처리 권장) */
  idAddress?: string;

  bankName: string;
  /** 마스킹된 계좌번호 — UI 노출용. 평문은 별도 SensitiveInfo API */
  accountMasked: string;

  /** 얼굴 템플릿(임베딩) ID — 서버에 저장된 얼굴 매칭 키 */
  faceTemplateId?: string;
  /**
   * 얼굴 인증 완료 여부.
   * @deprecated `verification.faceRegistered` 를 사용하세요. 본 필드는 backward compat 용.
   */
  faceVerified?: boolean;

  /**
   * 워커 검증 단계 — 기존 운영 소스의 idCetYn / faceRgstYn / acctCetYn / privacyYn 매핑.
   *
   *  · identityVerified: 신분증 본인확인 완료 (idCetYn)
   *  · faceRegistered:   얼굴 임베딩 등록 완료 (faceRgstYn)
   *  · bankVerified:     본인 계좌 검증 완료 (acctCetYn)
   *  · privacyAgreed:    개인정보 동의 완료 (privacyYn)
   *  · contractSigned:   근로계약 서명 완료 (cntrStatTp = 'SIGNED' 또는 그 이후)
   *
   * 모든 단계가 true 면 Trust Tier 1 자격.
   */
  verification?: {
    identityVerified: boolean;
    faceRegistered: boolean;
    bankVerified: boolean;
    privacyAgreed: boolean;
    contractSigned?: boolean;
  };

  trustTier: TrustTier;
  status: WorkerStatus;

  /** 기초안전교육 이수 여부 (건설현장 의무) — 워커 단위 */
  safetyEduCompleted?: boolean;

  /**
   * ─── 법정 계산 추가 필드 ─────────────────────
   */

  /** 생년월일 — 'YYYY-MM-DD' (만 60세 이상 국민연금 자격 외 등 판단용) */
  birthDate?: string;
  /** 성별 — 'M' / 'F' */
  gender?: 'M' | 'F';
  /** 국적 — 'KR' / 'CN' / 'VN' 등 ISO 3166-1 alpha-2 */
  nationality?: string;
  /** 거주자 유형 — 내국인 / 외국인 */
  residentType?: 'DOMESTIC' | 'FOREIGN';
  /** 외국인 체류자격 (residentType=FOREIGN 일 때) — 'E-9' 등 */
  visaType?: string;

  /**
   * 세무 프로필 — 비과세 한도·소득세 산정용
   */
  taxProfile?: {
    /** 부양가족 수 (소득공제용) */
    dependentsCount?: number;
    /** 6세 이하 자녀 수 — 출산·보육수당 비과세 한도 계산 */
    childrenUnder6Count?: number;
    /**
     * 비과세 항목 활성화 여부 — 어떤 항목이 적용 가능한지 사전 등록.
     * 실제 금액은 Employment.nontaxable 에 저장.
     */
    nonTaxableItems?: Array<'MEAL' | 'VEHICLE' | 'TRAVEL' | 'CHILDCARE' | 'OTHER'>;
  };

  /**
   * 보험 프로필 — 4대보험 자격·두루누리 판정용
   */
  insuranceProfile?: {
    /** 국민연금 가입 대상 여부 (만 18~59세 + 일정 보수 이상) */
    nationalPensionTarget?: boolean;
    /** 건강보험 가입 대상 */
    healthInsuranceTarget?: boolean;
    /** 고용보험 가입 대상 */
    employmentInsuranceTarget?: boolean;
    /** 산재보험 가입 대상 (건설현장은 100% 가입 의무) */
    industrialAccidentTarget?: boolean;
    /** 두루누리 지원 후보 여부 (월 보수 < 270만원 + 사업장 < 10명) */
    durunuriCandidate?: boolean;
    /**
     * 신청일 전 12개월 보험가입 이력.
     *  · true:  이력 있음 (기존가입자)
     *  · false: 이력 없음 (신규가입자 → 두루누리 80% 지원 대상)
     *  · null/undefined: 알 수 없음 (서버 NPS/EI 조회 결과 미반영)
     */
    insuranceHistoryLast12Months?: boolean | null;
  };

  /** 마스터 등록일 */
  registeredAt: string;
}

// ───────── 등록 / 수정 ─────────

export interface RegisterWorkerRequest {
  name: string;
  phone: string;

  idType: IdType;
  /** 평문 — 서버가 마스킹 처리해 저장 */
  idNumber: string;
  idAddress?: string;

  bankName: string;
  /** 평문 — 서버가 마스킹 처리해 저장 */
  accountNumber: string;
  accountHolder: string;

  /** 얼굴 이미지 업로드 ID — 서버가 얼굴 매칭/생체검증 처리 */
  faceImageId?: string;
  idImageId?: string;
  bankImageId?: string;

  /** 동의서 PART 1·2·3 */
  agreedToPersonalInfo: boolean;
  agreedToBiometric: boolean;
  agreedToProxyDevice: boolean;
  agreedAt: string;

  /** 등록 시점의 트러스트 티어 (서버가 검증 후 부여) */
  desiredTrustTier?: TrustTier;
}

export interface RegisterWorkerResponse {
  worker: Worker;
  message: string;
}

export interface UpdateWorkerRequest {
  name?: string;
  phone?: string;
  idType?: IdType;
  /** 평문 — 서버가 마스킹 처리 */
  idNumber?: string;
  bankName?: string;
  accountNumber?: string;
  faceImageId?: string;
  status?: WorkerStatus;
  safetyEduCompleted?: boolean;
}

export interface UpdateWorkerResponse {
  worker: Worker;
  message: string;
}

// ───────── 조회 ─────────

export interface ListWorkersQuery {
  status?: WorkerStatus | 'ALL';
  trustTier?: TrustTier | 'ALL';
  /** 자유 검색 — 이름·전화·workerCode */
  q?: string;
}

export interface ListWorkersResponse {
  workers: Worker[];
  totalActive: number;
}


/**
 * 민감 정보 — 평문 주민번호·계좌번호.
 * 별도 endpoint `/v2/workers/:id/sensitive` 로만 접근 가능하며,
 * 서버는 OWNER 또는 4대보험·노임대장 처리 권한자만 호출 허용.
 *
 * 보안 / 개인정보보호:
 *  · DB 저장 시 AES-256 + KMS 키 분리 (TODO 실서비스)
 *  · 응답 직렬화 시 로그·캐시 미저장 (no-store)
 *  · 클라이언트 측 메모리 잔존 최소화 (Promise 즉시 사용 후 폐기)
 */
export interface WorkerSensitiveInfo {
  workerId: string;
  /** 평문 주민/외국인등록번호 — 'YYMMDD-NNNNNNN' */
  idNumberRaw?: string;
  /** 평문 계좌번호 */
  accountNumberRaw?: string;
}
