/**
 * Phase BB6 — DashHeroKPI 의 stats 계산 로직을 순수 함수로 분리.
 *
 * 원본: src/pages/DashboardPage.tsx DashHeroKPI 의 useMemo 콜백
 * 목적: 함수가 컴포넌트 내부에 묻혀 있어 단위 테스트가 어렵고 재사용 불가.
 *       UI 와 무관한 입력 → 출력 매핑이므로 services 로 옮긴다.
 *
 * UI 동작은 동일 — DashHeroKPI 가 이 함수를 호출하도록 교체했다.
 */
export interface HeroKpiInputs {
  sites: Array<{ id: string; status?: string }>;
  todayBySite: Record<string, {
    summary?: { workingCount?: number; doneCount?: number };
    members?: Array<{
      record?: {
        payAmount?: number;
        checkInMethod?: string;
        geofenceResult?: string;
      };
    }>;
  }>;
  allMembers: Array<{
    leftAt?: string | null;
    contractSigned?: boolean;
    safetyEduCompleted?: boolean;
  }>;
}

export interface HeroKpiStats {
  totalAttended: number;
  totalDone: number;
  totalWorking: number;
  totalMembers: number;
  totalPay: number;
  score: number;
  needAction: number;
  attendRate: number;
}

export function computeHeroKpiStats(input: HeroKpiInputs): HeroKpiStats {
  const { sites, todayBySite, allMembers } = input;
  const inProgress = sites.filter((s) => s.status !== 'COMPLETED');
  let totalAttended = 0, totalDone = 0, totalWorking = 0;
  let totalPayToday = 0;
  let manualBoost = 0, gpsBoost = 0;
  let totalRecords = 0;
  for (const s of inProgress) {
    const t = todayBySite[s.id];
    if (!t) continue;
    totalAttended += (t.summary?.workingCount ?? 0) + (t.summary?.doneCount ?? 0);
    totalDone    += t.summary?.doneCount ?? 0;
    totalWorking += t.summary?.workingCount ?? 0;
    for (const tm of t.members ?? []) {
      if (!tm.record) continue;
      totalRecords += 1;
      totalPayToday += tm.record.payAmount || 0;
      if (tm.record.checkInMethod === 'MANUAL') manualBoost += 1;
      if (tm.record.geofenceResult && tm.record.geofenceResult !== 'INSIDE') gpsBoost += 1;
    }
  }
  // 「오늘 노무비」 = 오늘 출역 records 의 payAmount 합산.
  //   대시보드와 노임비 화면 모두 같은 attendance bucket 을 본다.
  const totalPay = totalPayToday;
  const totalMembers = allMembers.filter((m) => !m.leftAt).length;
  const noContract = allMembers.filter((m) => !m.leftAt && !m.contractSigned).length;
  const noEdu = allMembers.filter((m) => !m.leftAt && !m.safetyEduCompleted).length;
  const denomR = Math.max(1, totalRecords);
  const denomM = Math.max(1, totalMembers);
  const score = Math.max(0, Math.round(100
    - (manualBoost / denomR) * 30
    - (gpsBoost / denomR) * 30
    - (noContract / denomM) * 20
    - (noEdu / denomM) * 20));
  const attendRate = totalMembers > 0 ? Math.round((totalAttended / totalMembers) * 100) : 0;
  const needAction = manualBoost + gpsBoost + noContract + noEdu;
  return {
    totalAttended, totalDone, totalWorking, totalMembers,
    totalPay, score, needAction, attendRate,
  };
}
