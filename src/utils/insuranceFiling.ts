// FILE_VERSION 1777810001
/**
 * 4대보험 일용근로내용 신고서 처리 모듈
 *
 *  · 양식 출처 : 양식/근로내용확인신고_전자신고용.xlsx (고용보험·산재보험)
 *  · 표준 컬럼 55개 — 보험구분·성명·주민번호·신고월·국적·체류자격·전화·직종코드
 *                   · 1~31일 근로마킹 · 근로일수 · 일평균근로시간 · 보수지급기초일수
 *                   · 보수총액 · 임금총액 · 이직사유 · 보험료부과구분 · 국세청신고여부
 *                   · 지급월 · 총지급액 · 비과세 · 소득세 · 지방소득세
 *
 *  업무 흐름
 *   1. 우리 데이터(출퇴근 + 임금) → 표준 행 빌드
 *   2. ExcelJS 로 템플릿(public/templates/insurance-filing-template.xlsx) 로드
 *      → 「서식」시트에 행 추가
 *   3. 사용자 다운로드 → 4insure.or.kr 토탈서비스에 직접 업로드
 *   4. 신고 결과 회신 .xlsx 우리 시스템에 다시 업로드 → 이력 누적 보관
 *
 *  주의 — 실제 4대보험 시스템(4insure.or.kr) 은 공개 REST API 가 없음.
 *         "양식 빌드 → 사용자가 토탈서비스 업로드" 가 표준 방식.
 */

/*
 * ⚠ TODO(보안 — 실서비스 전환 시):
 *   xlsx 라이브러리는 HIGH 등급 취약점이 보고됨 (Prototype Pollution / ReDoS).
 *   실서비스에서는 다음 endpoint 로 서버측 파싱으로 전환:
 *
 *     POST /v2/attendance/ecard-compare   (전자카드 비교)
 *     POST /v2/wage/ledger/parse          (노임대장 파싱)
 *     POST /v2/wage/ledger/generate       (노임대장 생성)
 *     POST /v2/attendance/template/build  (출퇴근 양식 빌드)
 *     POST /v2/insurance/filing/generate  (4대보험 신고서 생성)
 *     POST /v2/insurance/filing/parse     (4대보험 신고서 파싱)
 *
 *   서버는 격리된 환경(예: AWS Lambda + temp directory)에서
 *   안전한 라이브러리(openpyxl, Apache POI, libreoffice)로 처리.
 *   클라이언트는 파일 업로드 + 결과만 받음 — xlsx 라이브러리 미사용.
 */

import type ExcelJSType from 'exceljs';  // 타입만 사용

// ───────── 타입 ─────────

export type InsuranceKind = 'EMP' | 'WC' | 'BOTH'; // 고용 / 산재 / 산재+고용

/** 보험구분 코드 (양식 sheet "Sheet1" 기준) */
export const INSURANCE_KIND_CODE: Record<InsuranceKind, '1' | '3' | '5'> = {
  WC: '1',     // 산재만
  EMP: '3',    // 고용만
  BOTH: '5',   // 산재 + 고용
};

/** 이직사유 (사용자 선택) */
export type SeparationReason = '1' | '2' | '3';
export const SEPARATION_REASON_LABEL: Record<SeparationReason, string> = {
  '1': '회사 사정 (폐업·공사중단·종료·계약만료)',
  '2': '부득이한 개인사정 (질병·부상·출산)',
  '3': '기타 개인사정 (전직·자영업)',
};

/** 한 명에 해당하는 신고 행 (55컬럼 양식과 1:1 매칭) */
export interface InsuranceFilingRow {
  /** 1=산재 / 3=고용 / 5=산재+고용 */
  insuranceKind: '1' | '3' | '5';
  name: string;
  /** 13자리, 하이픈 제외 */
  rrn: string;
  /** YYYYMM */
  reportYearMonth: string;
  /** 100=내국인. 외국인은 별도 코드 (KECO 표 참조) */
  nationality: string;
  /** 외국인만 (예: F-4, E-9). 내국인은 빈 문자열 */
  visaCode: string;
  /** 010 / 02 등 */
  phoneArea: string;
  phoneMid: string;
  phoneTail: string;
  /** 한국고용직업분류 (KECO 2025) 소분류 코드. 기본값 '013' (건설일반) */
  jobCode: string;
  /** 1~31 일자별 근로 여부 (true → "1", false → 빈셀) */
  daysWorked: boolean[];
  workDays: number;
  avgDailyHours: number;
  /** 보수지급의 기초가 된 일수 (대개 workDays 와 동일) */
  baseDays: number;
  /** 보수총액 (과세소득) */
  payTotal: number;
  /** 임금총액 (근로기준법 제2조) */
  wageTotal: number;
  /** 이직사유 — 마지막 근로일이 있는 경우만 (빈 문자열 가능) */
  separationReason: SeparationReason | '';
  /** 보험료 부과구분 부호 (특수 사례만, 일반은 빈셀) */
  premiumExempt: string;
  premiumExemptReason: string;
  /** 국세청 일용근로소득 신고 여부 — Y/빈 */
  reportToNts: 'Y' | '';
  /** YYYYMM */
  payYearMonth: string;
  payTotalNts: number;
  nontaxable: number;
  incomeTax: number;
  localTax: number;
}

export interface InsuranceFilingDoc {
  /** 신고 식별자 */
  id: string;
  /** 신고월 YYYYMM */
  yearMonth: string;
  siteId?: string;
  siteName: string;
  companyName: string;
  managerName: string;
  /** 산재만 / 고용만 / 산재+고용 — 일괄 적용 */
  insuranceKind: InsuranceKind;
  rows: InsuranceFilingRow[];
  /** 빌드 시각 (ISO) */
  builtAt: string;
  /** 토탈서비스 업로드 후 회신 받은 .xlsx 의 첨부 메타 (옵션) */
  responseUploaded?: { fileName: string; uploadedAt: string };
}

// ───────── 1. 우리 데이터로부터 신고 행 빌드 ─────────

/** 페이지 레이어에서 매핑해 넘기는 1명 단위 입력 */
export interface FilingInput {
  name: string;
  /** 평문 주민번호 13자리 (호출자가 권한 체크 후 전달; 없으면 마스킹/공란) */
  rrn?: string;
  phone?: string;
  /** 국적 코드 — 내국인이면 '100' 또는 비워두기 */
  nationality?: string;
  /** 외국인이면 체류자격 (예: 'F-4', 'E-9') */
  visaCode?: string;
  /** KECO 2025 소분류 직종코드. 기본 '013' (건설일반) */
  jobCode?: string;
  foreigner?: boolean;
  /** 1~31 일자별 근로 (1=근로, 0=미근로). 없으면 workDays 앞쪽 채움 */
  daily?: number[];
  workDays: number;
  /**
   * Phase Y5 — 임금총액(= 보수총액의 상한선, 근로기준법 제2조).
   *  · 노임대장 / 고용보험·산재 신고서 : wageTotal 에 사용 (= 비과세 포함)
   *  · 국세청 일용근로소득 신고      : taxableGross (과세보수) 가 우선
   */
  gross: number;
  /** Phase Y5 — 과세보수 (taxableWage). 미전달 시 gross 로 폴백. */
  taxableGross?: number;
  incomeTax?: number;
  localTax?: number;
  nontaxable?: number;
  separationReason?: SeparationReason | '';
}

/**
 * 우리 데이터(임금정산 + 출퇴근 + 멤버) → 4대보험 신고 행 변환.
 *  · 보수총액 = 과세 임금 (gross)
 *  · 임금총액 = 동일
 *  · 일평균근로시간 = defaultDailyHours (기본 8h)
 *  · 국세청 일용근로소득 신고 = reportToNts 옵션
 */
export function buildInsuranceFiling(opts: {
  rows: FilingInput[];
  /** 'YYYY-MM' 또는 'YYYYMM' */
  yearMonth: string;
  site: { id: string; name: string } | null;
  companyName: string;
  managerName: string;
  insuranceKind: InsuranceKind;
  reportToNts?: boolean;
  defaultDailyHours?: number;
  defaultJobCode?: string;
  /**
   * Phase EE3 — strictRrn 모드.
   *  · true: 13자리 평문 주민번호가 없는 row 발견 시 Error throw (호출자가 try/catch)
   *  · false (기본값): 해당 row 만 skip + warn (기존 BB2 동작)
   * 실제 4대보험 신고서 생성(OutputCenterPage 다운로드 버튼) 시 권장값: true.
   */
  strictRrn?: boolean;
}): InsuranceFilingDoc {
  const yymm = opts.yearMonth.replace(/[^0-9]/g, '').slice(0, 6);
  const code = INSURANCE_KIND_CODE[opts.insuranceKind];
  const dailyHours = opts.defaultDailyHours ?? 8;
  const defaultJob = opts.defaultJobCode ?? '013';
  const strictRrn = opts.strictRrn === true;

  // Phase BB2 + EE3 — 13자리 평문 주민번호가 없는 row 처리
  //   strictRrn=true  → Error throw (신고서 생성 차단, 호출자 alert)
  //   strictRrn=false → 해당 row 만 skip + warn (기존 동작)
  const validInputs = opts.rows.filter((r) => {
    const d = (r.rrn ?? '').replace(/[^0-9]/g, '');
    if (d.length !== 13) {
      if (strictRrn) {
        throw new Error(
          `buildInsuranceFiling: invalid rrn for ${r.name ?? 'unknown'} (digits=${d.length}) — strictRrn mode`,
        );
      }
      console.warn(
        `[buildInsuranceFiling] skip row — rrn invalid: name="${r.name ?? 'unknown'}" digits=${d.length}`,
      );
      return false;
    }
    return true;
  });

  const rows: InsuranceFilingRow[] = validInputs.map((r) => {
    const days = buildDailyMarks(r);
    const workDays = days.filter(Boolean).length || r.workDays;
    const phoneTokens = splitPhone(r.phone);
    const rrnDigits = (r.rrn ?? '').replace(/[^0-9]/g, '').slice(0, 13);
    return {
      insuranceKind: code,
      name: r.name,
      rrn: rrnDigits,
      reportYearMonth: yymm,
      nationality: r.foreigner ? (r.nationality ?? '') : '100',
      visaCode: r.visaCode ?? '',
      phoneArea: phoneTokens[0],
      phoneMid: phoneTokens[1],
      phoneTail: phoneTokens[2],
      jobCode: r.jobCode ?? defaultJob,
      daysWorked: days,
      workDays,
      avgDailyHours: dailyHours,
      baseDays: workDays,
      // Phase Y5 — 양식별 매핑:
      //   payTotal  (보수총액·과세) — 국세청/건강/연금 : taxableGross 우선
      //   wageTotal (임금총액)        — 고용/산재        : gross (임금총액)
      //   payTotalNts(총지급액 NTS)   — 국세청 일용근로 : taxableGross 우선
      //   nontaxable (비과세)         — 모든 신고서
      payTotal: r.taxableGross ?? r.gross ?? 0,
      wageTotal: r.gross ?? 0,
      separationReason: r.separationReason ?? '',
      premiumExempt: '',
      premiumExemptReason: '',
      reportToNts: opts.reportToNts ? 'Y' : '',
      payYearMonth: yymm,
      payTotalNts: r.taxableGross ?? r.gross ?? 0,
      nontaxable: r.nontaxable ?? 0,
      incomeTax: r.incomeTax ?? 0,
      localTax: r.localTax ?? 0,
    };
  });

  return {
    id: `INSF-${yymm}-${(opts.site?.id ?? 'NA').slice(-6)}-${Date.now().toString(36)}`,
    yearMonth: yymm,
    siteId: opts.site?.id,
    siteName: opts.site?.name ?? '—',
    companyName: opts.companyName,
    managerName: opts.managerName,
    insuranceKind: opts.insuranceKind,
    rows,
    builtAt: new Date().toISOString(),
  };
}

/** 한 명의 일자별 출근 마킹 (1~31 boolean[]) */
function buildDailyMarks(r: FilingInput): boolean[] {
  const arr = new Array<boolean>(31).fill(false);
  if (r.daily && Array.isArray(r.daily)) {
    for (let i = 0; i < 31; i++) {
      arr[i] = (r.daily[i] ?? 0) > 0;
    }
  } else {
    for (let i = 0; i < Math.min(r.workDays ?? 0, 31); i++) arr[i] = true;
  }
  return arr;
}

/** 휴대폰 번호 3분할 — 010-1234-5678 → ['010', '1234', '5678'] */
function splitPhone(phone?: string): [string, string, string] {
  if (!phone) return ['', '', ''];
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length === 11) {
    return [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7)];
  }
  if (digits.length === 10) {
    return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)];
  }
  return [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7)];
}

// ───────── 2. ExcelJS — 양식 채우기 ─────────

/**
 * public/templates/insurance-filing-template.xlsx 로드 →
 * 「서식」시트의 헤더(1행) 아래에 신고 행을 채워서 반환.
 */
export async function downloadInsuranceFilingXlsx(doc: InsuranceFilingDoc): Promise<void> {
  const url = '/templates/insurance-filing-template.xlsx';
  const res = await fetch(url);
  if (!res.ok) throw new Error('템플릿 로드 실패: ' + res.status);
  const buf = await res.arrayBuffer();

  const ExcelJSMod = (await import('exceljs')).default;

  const wb = new ExcelJSMod.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet('서식');
  if (!ws) throw new Error('「서식」 시트를 찾을 수 없습니다');

  // 헤더 다음 행부터 데이터 입력 (양식 1행=헤더, 2행부터 본문)
  let r = 2;
  for (const row of doc.rows) {
    const cells: Array<string | number | undefined> = [
      row.insuranceKind,          // A 보험구분
      row.name,                   // B 성명
      row.rrn,                    // C 주민번호
      Number(row.reportYearMonth),// D 신고월 (숫자)
      row.nationality,            // E 국적
      row.visaCode,               // F 체류자격
      row.phoneArea,              // G 전화 지역
      row.phoneMid,               // H 전화 국번
      row.phoneTail,              // I 전화 뒷
      row.jobCode,                // J 직종
      // 1~31 일자 (K~AO)
      ...row.daysWorked.map((b) => (b ? '1' : undefined)),
      row.workDays,               // AP 근로일수
      row.avgDailyHours,          // AQ 일평균근로시간
      row.baseDays,               // AR 보수지급기초일수
      row.payTotal,               // AS 보수총액(과세)
      row.wageTotal,              // AT 임금총액
      row.separationReason,       // AU 이직사유
      row.premiumExempt,          // AV 보험료부과구분 부호
      row.premiumExemptReason,    // AW 보험료부과구분 사유
      row.reportToNts,            // AX 국세청 일용근로소득 신고
      Number(row.payYearMonth),   // AY 지급월
      row.payTotalNts,            // AZ 총지급액(과세)
      row.nontaxable,             // BA 비과세
      row.incomeTax,              // BB 소득세
      row.localTax,               // BC 지방소득세
    ];
    cells.forEach((v, idx) => {
      if (v === undefined || v === '') return;
      ws.getCell(r, idx + 1).value = v;
    });
    r++;
  }

  const out = await wb.xlsx.writeBuffer();
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `4대보험_근로내용확인신고_${doc.yearMonth}_${doc.siteName.replace(/\s/g, '_')}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ───────── 3. 회신 .xlsx 업로드 파싱 ─────────

/**
 * 토탈서비스에서 신고 후 회신받은 .xlsx (혹은 사용자가 작성한 신고서) 를
 * 우리 시스템 형식으로 다시 파싱.
 */
export async function parseInsuranceFilingFile(file: File): Promise<InsuranceFilingDoc> {
  const ExcelJSMod = (await import('exceljs')).default;
  const wb = new ExcelJSMod.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.getWorksheet('서식') ?? wb.worksheets[0];
  if (!ws) throw new Error('읽을 수 있는 시트가 없습니다');

  const rows: InsuranceFilingRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum === 1) return; // 헤더 스킵
    const get = (i: number): unknown => row.getCell(i).value;
    const kind = String(get(1) ?? '');
    if (!['1', '3', '5'].includes(kind)) return;

    const days: boolean[] = [];
    for (let i = 0; i < 31; i++) {
      const v = get(11 + i);
      days.push(v === 1 || v === '1' || v === true);
    }
    rows.push({
      insuranceKind: kind as '1' | '3' | '5',
      name: String(get(2) ?? '').trim(),
      rrn: String(get(3) ?? '').replace(/[^0-9]/g, ''),
      reportYearMonth: String(get(4) ?? ''),
      nationality: String(get(5) ?? ''),
      visaCode: String(get(6) ?? ''),
      phoneArea: String(get(7) ?? ''),
      phoneMid: String(get(8) ?? ''),
      phoneTail: String(get(9) ?? ''),
      jobCode: String(get(10) ?? ''),
      daysWorked: days,
      workDays: Number(get(42) ?? 0),
      avgDailyHours: Number(get(43) ?? 8),
      baseDays: Number(get(44) ?? 0),
      payTotal: Number(get(45) ?? 0),
      wageTotal: Number(get(46) ?? 0),
      separationReason: (String(get(47) ?? '') as SeparationReason | ''),
      premiumExempt: String(get(48) ?? ''),
      premiumExemptReason: String(get(49) ?? ''),
      reportToNts: String(get(50) ?? '') === 'Y' ? 'Y' : '',
      payYearMonth: String(get(51) ?? ''),
      payTotalNts: Number(get(52) ?? 0),
      nontaxable: Number(get(53) ?? 0),
      incomeTax: Number(get(54) ?? 0),
      localTax: Number(get(55) ?? 0),
    });
  });

  if (rows.length === 0) throw new Error('파싱 가능한 데이터 행을 찾지 못했습니다');

  const yymm = rows[0].reportYearMonth;
  const codes = new Set(rows.map((r) => r.insuranceKind));
  const kind: InsuranceKind = codes.size === 1
    ? (Object.entries(INSURANCE_KIND_CODE).find(([, v]) => v === [...codes][0])?.[0] as InsuranceKind ?? 'BOTH')
    : 'BOTH';

  return {
    id: `INSF-UP-${yymm}-${Date.now().toString(36)}`,
    yearMonth: yymm,
    siteName: '업로드',
    companyName: '',
    managerName: '',
    insuranceKind: kind,
    rows,
    builtAt: new Date().toISOString(),
    responseUploaded: { fileName: file.name, uploadedAt: new Date().toISOString() },
  };
}

// ───────── 4. 누적 보관 (localStorage) ─────────

const ARCHIVE_KEY = 'bodapass.insuranceFilingArchive.v1';

export function loadInsuranceFilingArchive(): InsuranceFilingDoc[] {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function appendInsuranceFilingArchive(doc: InsuranceFilingDoc): void {
  try {
    const arr = loadInsuranceFilingArchive();
    arr.push(doc);
    // 최근 50건만 유지 (용량 제한)
    const trimmed = arr.slice(-50);
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error('신고 이력 저장 실패', e);
  }
}

export function deleteInsuranceFilingArchive(id: string): void {
  try {
    const arr = loadInsuranceFilingArchive().filter((d) => d.id !== id);
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(arr));
  } catch (e) {
    console.error('신고 이력 삭제 실패', e);
  }
}
