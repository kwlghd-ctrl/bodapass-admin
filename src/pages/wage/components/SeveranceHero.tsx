import type { Site } from '../../../api/site.types';
import type { SeveranceMonthSummary } from '../../../api/wage.types';
import {
  classifyForSeverance,
  loadFundSetting,
  resolveSeveranceFundDaily,
  mutualAidAccrued,
  legalSeverance,
} from '../../../utils/severance';
import { UI_LABEL_TEXT } from '../../../utils/legalDataValidation';
import { krw } from '../utils/wageUtils';

export function SeveranceHero({
  data,
  site,
}: {
  data: SeveranceMonthSummary | null;
  site: Site | null;
}) {
  if (!data) return null;

  // 사이트 컨텍스트가 있으면 site.severanceFundMode override 적용.
  // 없으면 전역 SettingsPage 설정에 따름.
  const decision = resolveSeveranceFundDaily({
    site,
    globalSetting: loadFundSetting(),
  });
  const fundDaily = decision.fundDaily;
  const refDate = new Date(data.year, data.month, 0);

  let mutualCount = 0, legalCount = 0, approachingCount = 0;
  let mutualTotal = 0, legalTotal = 0;
  for (const r of data.rows) {
    const cls = classifyForSeverance(r.joinedAt, refDate);
    if (cls.group === 'LEGAL') {
      legalCount++;
      legalTotal += legalSeverance({ avgDailyWage: r.dailyWage, serviceDays: cls.tenure.totalDays });
    } else {
      mutualCount++;
      mutualTotal += mutualAidAccrued({ workDays: r.totalWorkDays, fundDaily });
      if (cls.tenure.isApproachingOneYear) approachingCount++;
    }
  }

  // 화면 상단 라벨 — 「예상값」 정책.
  // decision.confidence 가 low 면 BLOCKED 에 준하는 경고, medium 이면 ESTIMATED, high 면 CONFIRMED.
  const uiLabel =
    decision.confidence === 'low'
      ? UI_LABEL_TEXT.ESTIMATED
      : UI_LABEL_TEXT.CONFIRMED;
  const labelTone =
    decision.confidence === 'low' ? '#cc7700' : '#157efb';
  const labelBg =
    decision.confidence === 'low' ? 'rgba(255,165,0,0.10)' : 'rgba(0,122,255,0.08)';

  const tiles = ([
    { key: 'today',  label: '당일 출력 인원',     raw: <><b>{data.attendedToday}</b>명</>,                          tone: 'plain' as const },
    { key: 'mutual', label: '공제회 부금 누적',   raw: <><b>{krw(mutualTotal)}</b> · {mutualCount}명</>,           tone: 'info'  as const },
    { key: 'legal',  label: '법정퇴직금 대상',    raw: <><b>{legalCount}</b>명 · {krw(legalTotal)}</>,             tone: 'ok'    as const },
    { key: 'soon',   label: '1년 임박 (≤30일)',  raw: <><b>{approachingCount}</b>명</>,                            tone: 'plain' as const },
  ]);

  // 일액 출처 라벨 — 사용자에게 어떤 정책이 적용됐는지 노출
  const sourceText: Record<typeof decision.source, string> = {
    SITE_OVERRIDE:  '현장 override',
    GLOBAL_SETTING: '전역 설정',
    AUTO_POLICY:    '자동',
  };
  const modeText: Record<typeof decision.mode, string> = {
    AUTO_BY_SITE_DATE: '자동',
    FORCE_6500:        '6,500원 강제',
    FORCE_8700:        '8,700원 강제',
    CUSTOM:            '직접 입력',
  };

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          margin: '4px 0 8px',
          fontSize: 12,
          color: '#3a3a3c',
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 999,
            color: labelTone,
            background: labelBg,
            fontWeight: 700,
            fontSize: 11,
          }}
        >
          {uiLabel}
        </span>
        <span style={{ color: '#6b6b73' }}>
          적용 일액 <strong style={{ color: '#1c1c1e' }}>{fundDaily.toLocaleString()}원</strong>
        </span>
        <span style={{ color: '#6b6b73' }}>
          방식 <strong style={{ color: '#1c1c1e' }}>{modeText[decision.mode]}</strong>
          <span style={{ color: '#8e8e93', marginLeft: 4 }}>({sourceText[decision.source]})</span>
        </span>
        <span style={{ color: '#6b6b73' }}>
          기준일 <strong style={{ color: '#1c1c1e' }}>{decision.basisDate ?? '없음'}</strong>
        </span>
        {decision.warning && (
          <span style={{ color: '#cc7700' }}>⚠ {decision.warning}</span>
        )}
      </div>
    <div className="att-daily-kpi att-daily-kpi--notif">
      {tiles.map((s, i) => (
        <button key={i} type="button" className={'att-hero__tile att-hero__tile--' + s.tone}>
          <span className="att-hero__icon" aria-hidden>
            <svg viewBox="0 0 36 36" width="36" height="36">
              <rect x="0.5" y="0.5" width="35" height="35" rx="8" fill="#FAFAFA" stroke="#E5E7EB" />
              <g stroke="#D1D5DB" strokeWidth="0.5">
                <line x1="0" y1="9"  x2="36" y2="9" />
                <line x1="0" y1="18" x2="36" y2="18" />
                <line x1="0" y1="27" x2="36" y2="27" />
                <line x1="9"  y1="0" x2="9"  y2="36" />
                <line x1="18" y1="0" x2="18" y2="36" />
                <line x1="27" y1="0" x2="27" y2="36" />
              </g>
              <circle cx="18" cy="18" r="6" fill="none" stroke="#9CA3AF" strokeWidth="0.6" />
              <circle cx="18" cy="18" r="1.2" fill="#9CA3AF" />
            </svg>
          </span>
          <span className="att-hero__body">
            <strong className="att-hero__title">{s.label}</strong>
            <span className="att-hero__sub">{s.raw}</span>
          </span>
          <span className="att-hero__time">월</span>
        </button>
      ))}
    </div>
    </>
  );
}
