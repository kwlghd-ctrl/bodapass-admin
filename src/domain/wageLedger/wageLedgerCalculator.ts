/**
 * wageLedgerCalculator — 월별 노임대장 (WageLedger) 예상값 계산 (Phase T4)
 *
 * 이 파일은 Phase T4 부터 진짜 계산 엔진의 「본체」 입니다.
 *   - 이전: src/utils/wageLedgerCalculation.ts 에 본체가 있었고 domain 은 re-export 만.
 *   - 현재: domain 이 본체, utils 는 deprecated wrapper.
 *
 * 변경 사항 (Phase T):
 *   T3. WageLedger.dailyTaxRows 가 「전체 DailyTaxRow」 (16개 필드) 를 그대로 보관.
 *        compactRows 축약 제거 — workerId/siteId/employmentId/grossPay/taxableIncome/
 *        calculatedIncomeTax/earnedIncomeTaxCredit/determinedIncomeTax/withheldIncomeTax/
 *        totalTax 모두 보존.
 *   T5. AttendanceRecord.nonTaxablePay 가 입력으로 들어오면 일자별 정식 비과세 사용.
 *        모든 record 가 미입력이면 월총액 균등 안분(레거시) + 명시 워닝.
 *
 * 기존 (Phase S2) 와 동일:
 *   - records 일자별 합산 → calculateDailyIncomeTaxRows
 *   - records 미전달 시 ESTIMATED + 워닝
 *   - WageLedger.incomeTax = dailyTaxRows 합
 *
 * 4대보험 — calculateSocialInsurance() + getSocialInsurancePolicyByDate() 사용.
 *
 * 산재보험: 사업주 100% 부담 — 근로자 공제에서 제외.
 *   WageLedger.industrialAccidentInsurance 는 사업주 부담분 (보고용).
 */

import type { Employment } from '../../api/employment.types';
import type { Site } from '../../api/site.types';
import type { Worker } from '../../api/worker.types';
import type { AttendanceRecord } from '../../api/attendanceV2.types';
import type { MonthlyAttendanceSummary } from '../../api/monthlyAttendance.types';
import type { WageLedger } from '../../api/wageLedger.types';
import { lookupPolicy } from '../../mock/legalPolicies';
import { resolveSeveranceFundDaily, loadFundSetting } from '../../utils/severance';
import { totalNontaxable } from '../../utils/nontaxable';
import {
  calculateDailyIncomeTaxRows,
  type DailyIncomeTaxInput,
  type DailyTaxRow,
} from '../../utils/incomeTaxDaily';
import { determineInsuranceEligibility } from '../../utils/insuranceEligibility';
import {
  calculateSocialInsurance,
  getSocialInsurancePolicyByDate,
} from '../socialInsurance';

interface CalcInput {
  summary: MonthlyAttendanceSummary;
  employment: Pick<Employment,
    | 'id' | 'workerId' | 'dailyWage'
    | 'insurance' | 'nontaxable'
    | 'insuranceApplied' | 'severanceApplied' | 'taxApplied'
  >;
  worker?: Pick<Worker,
    | 'taxProfile' | 'insuranceProfile'
    | 'birthDate' | 'residentType' | 'visaType'
  > | null;
  site?: Pick<Site,
    | 'bidNoticeDate' | 'contractDate'
    | 'severanceApplicable'
    | 'severanceFundMode' | 'severanceFundCustomAmount'
  > | null;
  /** 일별 record (선택) — 있으면 일자별 정식 세금. 없으면 합산행 1개로 폴백. */
  records?: AttendanceRecord[];
  /** lockLevel 강제 (시연용) — 미제공 시 ESTIMATED */
  lockLevel?: WageLedger['lockLevel'];
}

/** 일자별 합산 행 (Phase S2) — 같은 workDate 안의 record 들을 합쳐 1행으로 압축 */
interface DailySum {
  workDate: string;
  workerId?: string;
  siteId?: string;
  employmentId?: string;
  payAmount: number;
  nonTaxablePay: number;
  /** 본 일자 record 중 1건이라도 nonTaxablePay 가 명시되어 있으면 true */
  hasExplicitNonTaxable: boolean;
  gongsu: number;
  workedMinutes: number;
  dailyWageSnapshot?: number;
}

export function calculateMonthlyWageLedger(input: CalcInput): WageLedger {
  const { summary, employment, worker, site, records } = input;
  const warnings: string[] = [];
  const hasRecordsProvided = Array.isArray(records) && records.length > 0;

  // 0) 정책 조회 — 해당 yearMonth 의 첫째날 기준
  const policyDate = `${summary.yearMonth}-01`;
  const incomeTaxPolicy = lookupPolicy<{ rate: number; dailyDeduction: number }>(
    'INCOME_TAX_RATE_DAILY',
    policyDate,
  );
  const localTaxPolicy = lookupPolicy<number>('LOCAL_TAX_RATE', policyDate);
  const siPolicy = getSocialInsurancePolicyByDate(policyDate);

  if (!incomeTaxPolicy) warnings.push('소득세 정책을 찾을 수 없습니다.');
  // Phase U5: worker 누락 시 워닝 (4대보험 자격판정·외국인 거주자/비거주자 구분 불가)
  if (!worker) {
    warnings.push('worker 정보 없음 — 4대보험 적격성 및 거주자 구분이 기본값으로 적용되었습니다.');
  }

  // 1) grossWage — summary 에서 가져옴
  const grossWage = summary.grossWage;

  // 2) nonTaxableAmount — 한도 적용 (월 총합)
  const ctx = { childrenUnder6Count: worker?.taxProfile?.childrenUnder6Count ?? 0 };
  const nonTaxableAmount = totalNontaxable(
    { nontaxable: employment.nontaxable } as any,
    ctx,
  );

  // 3) taxableWage
  const taxableWage = Math.max(0, grossWage - nonTaxableAmount);

  // 3.5) Phase Z1 — records → workDate 별 합산 (한 번만 계산, 세금/출역 양쪽에서 재사용)
  const dailySums = new Map<string, DailySum>();
  if (hasRecordsProvided) {
    const empRecords = (records ?? []).filter(
      (r) => r.employmentId === summary.employmentId,
    );
    for (const r of empRecords) {
      const wd = r.workDate ?? r.date;
      if (!wd) continue;
      if (r.status === 'ABSENT' || r.status === 'OFF') continue;
      const ex = dailySums.get(wd) ?? {
        workDate: wd,
        workerId: r.workerCode,
        siteId: r.siteId,
        employmentId: r.employmentId,
        payAmount: 0,
        nonTaxablePay: 0,
        hasExplicitNonTaxable: false,
        gongsu: 0,
        workedMinutes: 0,
        dailyWageSnapshot: r.dailyWageSnapshot ?? r.dailyWage ?? employment.dailyWage,
      };
      ex.payAmount += r.payAmount ?? 0;
      ex.gongsu += r.gongsu ?? 0;
      ex.workedMinutes += r.workedMinutes ?? 0;
      // Phase T5: nonTaxablePay 가 record 에 명시되어 있으면 누적
      if (typeof r.nonTaxablePay === 'number') {
        ex.nonTaxablePay += r.nonTaxablePay;
        ex.hasExplicitNonTaxable = true;
      }
      dailySums.set(wd, ex);
    }
  }

  // 4) 소득세 — 일자별 (records 우선 + 같은 날짜 합산, 없으면 합산행 폴백 + 추정 워닝)
  let incomeTax = 0;
  let localIncomeTax = 0;
  let dailyTaxRows: DailyTaxRow[] | undefined;
  if (employment.taxApplied !== false && incomeTaxPolicy) {
    const policy = {
      rate: incomeTaxPolicy.value.rate,
      dailyDeduction: incomeTaxPolicy.value.dailyDeduction,
      localRate: (localTaxPolicy?.value as number | undefined) ?? 0.1,
    };

    // 폴백용 — 일자별 비과세 균등 안분 (모든 record 가 nonTaxablePay 미입력일 때만 사용)
    const perDayNontaxableFallback = summary.paidWorkDays > 0
      ? Math.floor(nonTaxableAmount / summary.paidWorkDays)
      : 0;

    let taxInputs: DailyIncomeTaxInput[];
    if (hasRecordsProvided) {
      // T5: 모든 일자가 nonTaxablePay 미입력이면 월 총액 균등 안분 + warning
      const anyExplicit = Array.from(dailySums.values()).some((d) => d.hasExplicitNonTaxable);
      if (!anyExplicit && perDayNontaxableFallback > 0) {
        warnings.push('일자별 비과세 미입력 — 월 총액 균등 안분 (예상값)');
      }

      taxInputs = Array.from(dailySums.values()).map((d): DailyIncomeTaxInput => ({
        workDate: d.workDate,
        workerId: d.workerId,
        siteId: d.siteId,
        employmentId: d.employmentId,
        payAmount: d.payAmount,
        nonTaxablePay: d.hasExplicitNonTaxable ? d.nonTaxablePay : perDayNontaxableFallback,
        dailyWageSnapshot: d.dailyWageSnapshot,
        gongsu: d.gongsu,
      }));
    } else {
      // 폴백 — record 없음. 월 합산을 1개의 합성행으로 처리 + 명시 워닝.
      warnings.push('원본 출역기록 없음 — 세금 추정값 (확정 신고/엑셀 출력에 사용 금지)');
      if (summary.paidWorkDays > 0 && grossWage > 0) {
        taxInputs = [{
          workDate: policyDate,
          workerId: employment.workerId,
          siteId: summary.siteId,
          employmentId: summary.employmentId,
          payAmount: grossWage,
          nonTaxablePay: nonTaxableAmount,
          dailyWageSnapshot: summary.dailyWageAverage,
          gongsu: summary.paidWorkDays,
        }];
      } else {
        taxInputs = [];
      }
    }

    const result = calculateDailyIncomeTaxRows(taxInputs, policy);
    dailyTaxRows = result.rows;
    incomeTax = result.totalIncomeTax;
    localIncomeTax = result.totalLocalIncomeTax;
    for (const w of result.warnings) warnings.push(w.message);
  }

  // 4.5) Phase Z1 — dailyAttendanceRows: 노임대장 1~31일 칸에 실제 finalGongsu 출력용
  let dailyAttendanceRows: WageLedger['dailyAttendanceRows'];
  if (hasRecordsProvided) {
    dailyAttendanceRows = Array.from(dailySums.values())
      .sort((a, b) => a.workDate.localeCompare(b.workDate))
      .map((d) => ({
        workDate: d.workDate,
        workerId: d.workerId,
        employmentId: d.employmentId,
        finalGongsu: d.gongsu,
        workedMinutes: d.workedMinutes,
        payAmount: d.payAmount,
      }));
  } else {
    dailyAttendanceRows = [];
    warnings.push('원본 출역기록 없음 — 노임대장 일자별 공수 칸은 0 으로 표시됩니다');
  }

  // 5) 4대보험 — calculateSocialInsurance 위임
  const insApplied = employment.insuranceApplied !== false;
  let nationalPension = 0;
  let healthInsurance = 0;
  let longTermCareInsurance = 0;
  let employmentInsurance = 0;
  let industrialAccidentInsurance: number | undefined;

  if (insApplied && taxableWage > 0) {
    let elig = {
      nationalPensionTarget: true,
      healthInsuranceTarget: true,
      employmentInsuranceTarget: true,
      industrialAccidentTarget: true,
    };
    if (worker) {
      const eResult = determineInsuranceEligibility({
        birthDate: worker.birthDate ?? null,
        residentType: worker.residentType === 'FOREIGN' ? 'NON_RESIDENT' : 'RESIDENT',
        visaType: worker.visaType ?? null,
        attendanceDays: summary.attendanceDays,
        workedMinutesTotal: summary.workedMinutesTotal,
        insuranceApplied: employment.insuranceApplied,
        insuranceProfile: worker.insuranceProfile
          ? {
              insuranceHistoryLast12Months: worker.insuranceProfile.insuranceHistoryLast12Months,
            }
          : null,
        asOfDate: policyDate,
      });
      elig = {
        nationalPensionTarget: eResult.nationalPensionTarget,
        healthInsuranceTarget: eResult.healthInsuranceTarget,
        employmentInsuranceTarget: eResult.employmentInsuranceTarget,
        industrialAccidentTarget: eResult.industrialAccidentTarget,
      };
      for (const w of eResult.warnings) warnings.push(w.message);
    } else {
      warnings.push('Worker 정보 없음 — 4대보험 대상 여부 모두 true 로 추정');
    }

    const insFlags = employment.insurance ?? {};
    if ((insFlags as any).pension === false) elig.nationalPensionTarget = false;
    if ((insFlags as any).health === false) elig.healthInsuranceTarget = false;
    if ((insFlags as any).employment === false) elig.employmentInsuranceTarget = false;
    if ((insFlags as any).accident === false) elig.industrialAccidentTarget = false;

    const siInput = {
      workerId: employment.workerId,
      siteId: summary.siteId,
      yearMonth: summary.yearMonth,
      grossWage,
      taxableWage,
      insuredWorkDays: summary.insuredWorkDays ?? summary.attendanceDays,
      employmentType: 'DAILY',
      isEligibleForNationalPension: elig.nationalPensionTarget,
      isEligibleForHealthInsurance: elig.healthInsuranceTarget,
      isEligibleForEmploymentInsurance: elig.employmentInsuranceTarget,
      isEligibleForIndustrialAccident: elig.industrialAccidentTarget,
    };
    const siResult = calculateSocialInsurance(siInput, siPolicy);
    nationalPension = siResult.nationalPensionEmployee;
    healthInsurance = siResult.healthInsuranceEmployee;
    longTermCareInsurance = siResult.longTermCareEmployee;
    employmentInsurance = siResult.employmentInsuranceEmployee;
    industrialAccidentInsurance = siResult.industrialAccidentEmployer;
    for (const w of siResult.verificationWarnings) warnings.push(w);
  }

  // 6) deductionTotal
  const deductionTotal =
    incomeTax + localIncomeTax +
    nationalPension + healthInsurance + longTermCareInsurance + employmentInsurance;

  // 7) netPay
  const netPay = Math.max(0, grossWage - deductionTotal);

  // 8) 퇴직공제부금
  let severanceFundDaily: number | undefined;
  let severanceFundAmount: number | undefined;
  if (employment.severanceApplied !== false && (site?.severanceApplicable ?? true)) {
    const decision = resolveSeveranceFundDaily({
      site: site ?? null,
      globalSetting: loadFundSetting(),
    });
    severanceFundDaily = decision.fundDaily;
    severanceFundAmount = Math.round(summary.severanceWorkDays * decision.fundDaily);
    if (decision.warning) warnings.push(decision.warning);
  }

  warnings.push(...summary.warnings);

  const policyVersion = [
    incomeTaxPolicy?.policy.version,
    `SI:${siPolicy.year}/${siPolicy.verificationStatus}`,
  ].filter(Boolean).join(' / ');

  const hasBlockingIssue = grossWage === 0 || summary.paidWorkDays === 0;
  let calculationStatus: WageLedger['calculationStatus'];
  if (hasBlockingIssue) {
    calculationStatus = 'BLOCKED';
  } else if (hasRecordsProvided && dailyTaxRows && dailyTaxRows.length > 0) {
    calculationStatus = 'READY';
  } else {
    calculationStatus = 'ESTIMATED';
  }

  return {
    employmentId: summary.employmentId,
    siteId: summary.siteId,
    companyId: summary.companyId,
    yearMonth: summary.yearMonth,
    workDays: summary.paidWorkDays,
    gongsuTotal: summary.gongsuTotal,
    workedMinutesTotal: summary.workedMinutesTotal,
    grossWage,
    taxableWage,
    nonTaxableAmount,
    incomeTax,
    localIncomeTax,
    nationalPension,
    healthInsurance,
    longTermCareInsurance,
    employmentInsurance,
    industrialAccidentInsurance,
    deductionTotal,
    netPay,
    severanceWorkDays: summary.severanceWorkDays,
    severanceFundDaily,
    severanceFundAmount,
    calculationStatus,
    policyVersion: policyVersion || undefined,
    warnings,
    // Phase T3: 전체 DailyTaxRow 16개 필드를 그대로 보존 (compact 축약 X)
    dailyTaxRows,
    // Phase Z1: 실제 출역 finalGongsu 보존 (노임대장 1~31일 칸 출력용)
    dailyAttendanceRows,
    lockLevel: input.lockLevel ?? 'ESTIMATED',
  };
}

/** 합계 계산 — 화면 hero 표시용 */
export function summarizeWageLedgers(ledgers: WageLedger[]) {
  return {
    grossWage: ledgers.reduce((s, l) => s + l.grossWage, 0),
    taxableWage: ledgers.reduce((s, l) => s + l.taxableWage, 0),
    nonTaxableAmount: ledgers.reduce((s, l) => s + l.nonTaxableAmount, 0),
    incomeTax: ledgers.reduce((s, l) => s + l.incomeTax, 0),
    localIncomeTax: ledgers.reduce((s, l) => s + l.localIncomeTax, 0),
    nationalPension: ledgers.reduce((s, l) => s + l.nationalPension, 0),
    healthInsurance: ledgers.reduce((s, l) => s + l.healthInsurance, 0),
    longTermCareInsurance: ledgers.reduce((s, l) => s + l.longTermCareInsurance, 0),
    employmentInsurance: ledgers.reduce((s, l) => s + l.employmentInsurance, 0),
    industrialAccidentInsurance: ledgers.reduce((s, l) => s + (l.industrialAccidentInsurance ?? 0), 0),
    deductionTotal: ledgers.reduce((s, l) => s + l.deductionTotal, 0),
    netPay: ledgers.reduce((s, l) => s + l.netPay, 0),
    severanceFundAmount: ledgers.reduce((s, l) => s + (l.severanceFundAmount ?? 0), 0),
    warningCount: ledgers.reduce((s, l) => s + (l.warnings?.length ?? 0), 0),
    count: ledgers.length,
  };
}
