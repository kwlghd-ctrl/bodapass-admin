/**
 * adaptLedgersToWageMonthSummary — WageLedger[] → 레거시 WageMonthSummary (Phase T2)
 *
 * mockBackend /wage/month 의 응답 형식을 유지하면서, 본체는 calculateMonthlyWageLedger
 * 엔진 결과를 그대로 1:1 매핑.
 *
 * 매핑:
 *   WageLedger.grossWage           → WageRow.baseAmount
 *   WageLedger.incomeTax            → deductionIncomeTax
 *   WageLedger.localIncomeTax       → deductionLocalTax
 *   WageLedger.healthInsurance + longTermCareInsurance → deductionHealth
 *   WageLedger.nationalPension      → deductionPension
 *   WageLedger.employmentInsurance  → deductionEmployment
 *   0 (산재는 사업주 100%)            → deductionAccident
 *   WageLedger.deductionTotal       → deductionTotal
 *   WageLedger.netPay               → netAmount
 *   WageLedger.severanceFundAmount  → severanceAccrued
 */
import type { WageLedger } from '../api/wageLedger.types';
import type { WageMonthSummary, WageRow } from '../api/wage.types';
import type { WorkerRole } from '../api/team.types';

export interface LedgerToWageRowContext {
  /** employmentId → display name. 없으면 employmentId 그대로 노출 */
  nameByEmploymentId: Map<string, string>;
  /** employmentId → role */
  roleByEmploymentId: Map<string, WorkerRole>;
  /** employmentId → idMasked */
  idMaskedByEmploymentId: Map<string, string>;
  /** employmentId → dailyWage */
  dailyWageByEmploymentId: Map<string, number>;
  year: number;
  month: number;
}

export function adaptLedgersToWageMonthSummary(
  ledgers: WageLedger[],
  ctx: LedgerToWageRowContext,
): WageMonthSummary {
  const rows: WageRow[] = ledgers.map((l) => {
    const memberId = l.employmentId;
    const name = ctx.nameByEmploymentId.get(memberId) ?? memberId;
    const role = (ctx.roleByEmploymentId.get(memberId) ?? '') as WorkerRole;
    const idMasked = ctx.idMaskedByEmploymentId.get(memberId) ?? '------';
    const dailyWage = ctx.dailyWageByEmploymentId.get(memberId) ?? 0;
    return {
      memberId,
      memberName: name,
      idNumberMasked: idMasked,
      role,
      workDays: l.workDays,
      dailyWage,
      baseAmount: l.grossWage,
      deductionPension: l.nationalPension,
      deductionHealth: l.healthInsurance + l.longTermCareInsurance,
      deductionEmployment: l.employmentInsurance,
      deductionAccident: 0,
      deductionIncomeTax: l.incomeTax,
      deductionLocalTax: l.localIncomeTax,
      deductionTotal: l.deductionTotal,
      netAmount: l.netPay,
      severanceAccrued: l.severanceFundAmount ?? 0,
      /* ── Phase U2: WageLedger 메타데이터 보존 ── */
      calculationStatus: l.calculationStatus,
      warnings: l.warnings,
      taxableWage: l.taxableWage,
      nonTaxableAmount: l.nonTaxableAmount,
      policyVersion: l.policyVersion,
      dailyTaxRows: l.dailyTaxRows,
      // Phase Z1: 노임대장 1~31일 칸의 실제 finalGongsu
      dailyAttendanceRows: l.dailyAttendanceRows,
      severanceFundDaily: l.severanceFundDaily,
      severanceFundAmount: l.severanceFundAmount,
      industrialAccidentInsurance: l.industrialAccidentInsurance,
    };
  });

  const byRoleMap = new Map<string, { count: number; days: number; net: number }>();
  for (const r of rows) {
    const cur = byRoleMap.get(r.role) ?? { count: 0, days: 0, net: 0 };
    byRoleMap.set(r.role, { count: cur.count + 1, days: cur.days + r.workDays, net: cur.net + r.netAmount });
  }

  return {
    year: ctx.year,
    month: ctx.month,
    totalDays: rows.reduce((s, r) => s + r.workDays, 0),
    totalBase: rows.reduce((s, r) => s + r.baseAmount, 0),
    totalDeduction: rows.reduce((s, r) => s + r.deductionTotal, 0),
    totalNet: rows.reduce((s, r) => s + r.netAmount, 0),
    totalSeverance: rows.reduce((s, r) => s + r.severanceAccrued, 0),
    byRole: Array.from(byRoleMap.entries()).map(([role, v]) => ({ role: role as WorkerRole, ...v })),
    rows,
  };
}
