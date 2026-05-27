import type { Site } from '../../../api/site.types';
import type { SeveranceMonthSummary } from '../../../api/wage.types';
import {
  classifyForSeverance,
  loadFundSetting,
  resolveSeveranceFundDaily,
  mutualAidAccrued,
  legalSeverance,
} from '../../../utils/severance';

export function SeveranceTab({
  data,
  site,
}: {
  data: SeveranceMonthSummary | null;
  site: Site | null;
}) {
  if (!data) return null;
  if (data.rows.length === 0) {
    return <div className="wage__empty card">해당 현장에 등록된 팀원이 없습니다.</div>;
  }

  // SeveranceHero 와 동일한 우선순위로 일액 결정 — site override > 전역 setting.
  const fundDaily = resolveSeveranceFundDaily({
    site,
    globalSetting: loadFundSetting(),
  }).fundDaily;
  // 기준일: data.year/month 의 말일 — 그 시점 기준 계속근로 판정
  const refDate = new Date(data.year, data.month, 0);

  // 분류
  type Classified = (typeof data.rows)[number] & {
    group: 'MUTUAL_AID' | 'LEGAL';
    tenureLabel: string;
    daysUntilOneYear: number;
    totalDays: number;
    /** 산출 금액 (그룹별 의미가 다름) */
    computedAmount: number;
    isApproachingOneYear: boolean;
  };
  const classified: Classified[] = data.rows.map((r) => {
    const cls = classifyForSeverance(r.joinedAt, refDate);
    const computedAmount = cls.group === 'LEGAL'
      ? legalSeverance({ avgDailyWage: r.dailyWage, serviceDays: cls.tenure.totalDays })
      : mutualAidAccrued({ workDays: r.totalWorkDays, fundDaily });
    return {
      ...r,
      group: cls.group,
      tenureLabel: cls.label,
      daysUntilOneYear: cls.tenure.daysUntilOneYear,
      totalDays: cls.tenure.totalDays,
      computedAmount,
      isApproachingOneYear: cls.tenure.isApproachingOneYear,
    };
  });

  const mutualRows = classified.filter((r) => r.group === 'MUTUAL_AID');
  const legalRows = classified.filter((r) => r.group === 'LEGAL');
  const approachingRows = classified.filter((r) => r.isApproachingOneYear);

  const mutualTotal = mutualRows.reduce((s, r) => s + r.computedAmount, 0);
  const legalTotal = legalRows.reduce((s, r) => s + r.computedAmount, 0);

  return (
    <>
      {approachingRows.length > 0 && (
        <section
          className="card"
          style={{
            padding: '12px 16px',
            background: '#fff8ec',
            border: '1px solid #ffd9a3',
            color: '#7a4a00',
            fontSize: 13,
            margin: '12px 0',
            borderRadius: 12,
          }}
        >
          ⚠ 30일 이내 만 1년 도래 예정 — {approachingRows.map((r) => `${r.memberName}(D-${r.daysUntilOneYear})`).join(', ')}.
          이 시점부터 공제회 신고를 중단하고 법정퇴직금으로 전환하셔야 합니다.
        </section>
      )}

      <section className="wage__grid card">
        <h3>
          1년 미만 — 퇴직공제부금 ({data.year}.{String(data.month).padStart(2, '0')})
          <span style={{ fontSize: 12, fontWeight: 400, color: '#6b6b73', marginLeft: 8 }}>
            출역일 × 부금 일액 ({fundDaily.toLocaleString()}원/일)
          </span>
        </h3>
        {mutualRows.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#8e8e93', fontSize: 13 }}>
            1년 미만 근로자가 없습니다.
          </div>
        ) : (
          <div className="wage__grid-scroll">
            <table className="wage-table wage-table--wide">
              <thead>
                <tr>
                  <th>번호</th>
                  <th>성명</th>
                  <th>직종</th>
                  <th>입사일</th>
                  <th className="wage-table__num">계속근로</th>
                  <th className="wage-table__num">총 출역일</th>
                  <th className="wage-table__num">부금 일액</th>
                  <th className="wage-table__num">누적 부금</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {mutualRows.map((r, i) => (
                  <tr key={r.memberId} style={r.isApproachingOneYear ? { background: '#fff8ec' } : undefined}>
                    <td>{i + 1}</td>
                    <td className="wage-table__name">{r.memberName}</td>
                    <td>{r.role}</td>
                    <td className="wage-table__mono">{r.joinedAt.slice(0, 10)}</td>
                    <td className="wage-table__num">{Math.max(0, r.totalDays)}일</td>
                    <td className="wage-table__num">{r.totalWorkDays}</td>
                    <td className="wage-table__num">{fundDaily.toLocaleString()}</td>
                    <td className="wage-table__num wage-table__num--net">{r.computedAmount.toLocaleString()}</td>
                    <td style={{ fontSize: 12, color: r.isApproachingOneYear ? '#c75c00' : '#6b6b73' }}>
                      {r.isApproachingOneYear ? `D-${r.daysUntilOneYear} 임박` : `D-${Math.max(0, r.daysUntilOneYear)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>합계 ({mutualRows.length}명)</td>
                  <td className="wage-table__num">{mutualRows.reduce((s, r) => s + r.totalWorkDays, 0)}</td>
                  <td></td>
                  <td className="wage-table__num wage-table__num--net">{mutualTotal.toLocaleString()}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="wage__grid card" style={{ marginTop: 16 }}>
        <h3>
          1년 이상 — 법정퇴직금 ({data.year}.{String(data.month).padStart(2, '0')})
          <span style={{ fontSize: 12, fontWeight: 400, color: '#6b6b73', marginLeft: 8 }}>
            평균임금 × 30일 × (계속근로일수 ÷ 365) — 평균임금은 일당으로 추정
          </span>
        </h3>
        {legalRows.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#8e8e93', fontSize: 13 }}>
            1년 이상 계속근로자가 없습니다.
          </div>
        ) : (
          <div className="wage__grid-scroll">
            <table className="wage-table wage-table--wide">
              <thead>
                <tr>
                  <th>번호</th>
                  <th>성명</th>
                  <th>직종</th>
                  <th>입사일</th>
                  <th className="wage-table__num">계속근로</th>
                  <th className="wage-table__num">평균임금(추정)</th>
                  <th className="wage-table__num">법정퇴직금</th>
                  <th className="wage-table__num">기지급</th>
                  <th className="wage-table__num">잔액</th>
                </tr>
              </thead>
              <tbody>
                {legalRows.map((r, i) => (
                  <tr key={r.memberId}>
                    <td>{i + 1}</td>
                    <td className="wage-table__name">{r.memberName}</td>
                    <td>{r.role}</td>
                    <td className="wage-table__mono">{r.joinedAt.slice(0, 10)}</td>
                    <td className="wage-table__num">
                      {Math.floor(r.totalDays / 365)}년 {r.totalDays % 365}일
                    </td>
                    <td className="wage-table__num">{r.dailyWage.toLocaleString()}</td>
                    <td className="wage-table__num wage-table__num--net">{r.computedAmount.toLocaleString()}</td>
                    <td className="wage-table__num">{r.paidTotal.toLocaleString()}</td>
                    <td className="wage-table__num wage-table__num--net">{(r.computedAmount - r.paidTotal).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6}>합계 ({legalRows.length}명)</td>
                  <td className="wage-table__num wage-table__num--net">{legalTotal.toLocaleString()}</td>
                  <td className="wage-table__num">{legalRows.reduce((s, r) => s + r.paidTotal, 0).toLocaleString()}</td>
                  <td className="wage-table__num wage-table__num--net">{(legalTotal - legalRows.reduce((s, r) => s + r.paidTotal, 0)).toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
