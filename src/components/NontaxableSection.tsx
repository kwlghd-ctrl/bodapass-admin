import type { TeamMember } from '../api/team.types';
import {
  NONTAX_LABELS,
  NONTAX_LIMITS,
  childcareLimit,
  totalNontaxable,
} from '../utils/nontaxable';
import './NontaxableSection.css';

type Nontax = NonNullable<TeamMember['nontaxable']>;

interface Props {
  value: Nontax;
  onChange: (next: Nontax) => void;
  monthlyEstimate?: number;
  childrenUnder6Count?: number;
  onChildrenUnder6CountChange?: (n: number) => void;
}

const FIELDS: Array<{ key: keyof Nontax; hint: string }> = [
  { key: 'meal',      hint: '월 20만원 한도 — 사내급식 미제공 시 식비 보전' },
  { key: 'vehicle',   hint: '월 20만원 한도 — 본인 명의 차량을 업무에 사용' },
  { key: 'travel',    hint: '실비 정산 — 영수증 보관 필수' },
  { key: 'childcare', hint: '6세 이하 자녀 1인당 월 20만원 — 자녀 수 입력 필요' },
  { key: 'other',     hint: '기타 비과세 (학자금, 직무발명보상금 등)' },
];

export function NontaxableSection({
  value,
  onChange,
  monthlyEstimate,
  childrenUnder6Count = 0,
  onChildrenUnder6CountChange,
}: Props) {
  const ctx = { childrenUnder6Count };
  const nontaxTotal = totalNontaxable({ nontaxable: value } as unknown as TeamMember, ctx);
  const taxable = monthlyEstimate != null ? Math.max(0, monthlyEstimate - nontaxTotal) : null;
  const childcareLim = childcareLimit(childrenUnder6Count);

  function setField(key: keyof Nontax, raw: string) {
    const num = Number(raw.replace(/[^0-9]/g, ''));
    onChange({ ...value, [key]: isNaN(num) ? 0 : num });
  }

  function setChildren(raw: string) {
    const num = Number(raw.replace(/[^0-9]/g, ''));
    const safe = Math.max(0, Math.min(10, isNaN(num) ? 0 : num));
    onChildrenUnder6CountChange?.(safe);
  }

  return (
    <div className="nontax">
      <div className="nontax__head">
        <strong className="nontax__title">비과세 소득 항목</strong>
        <span className="nontax__hint-top">
          보험료·소득세 산정에서 제외되는 항목입니다 (월 단위, 원).
        </span>
      </div>

      <div
        className="nontax__field"
        style={{
          gridColumn: '1 / -1',
          background: '#f9f9fb',
          borderRadius: 10,
          padding: 12,
          marginBottom: 8,
        }}
      >
        <span className="nontax__label">6세 이하 자녀 수</span>
        <span className="nontax__input-wrap">
          <input
            type="text"
            inputMode="numeric"
            className="nontax__input"
            value={childrenUnder6Count ? String(childrenUnder6Count) : ''}
            onChange={(e) => setChildren(e.target.value)}
            placeholder="0"
            disabled={!onChildrenUnder6CountChange}
            style={{ width: 80, textAlign: 'right' }}
          />
          <span className="nontax__unit">명</span>
        </span>
        <span className="nontax__hint">
          자녀 1인당 월 20만원까지 출산·보육수당 비과세 한도 적용 (현재 한도: {childcareLim.toLocaleString()}원)
        </span>
      </div>

      <div className="nontax__grid">
        {FIELDS.map(({ key, hint }) => {
          const cur = value[key] || 0;
          const limit = key === 'childcare' ? childcareLim : NONTAX_LIMITS[key];
          const exceeded = limit > 0 && cur > limit;
          return (
            <label key={String(key)} className={'nontax__field' + (exceeded ? ' is-exceeded' : '')}>
              <span className="nontax__label">{NONTAX_LABELS[key]}</span>
              <span className="nontax__input-wrap">
                <input
                  type="text"
                  inputMode="numeric"
                  className="nontax__input"
                  value={cur ? cur.toLocaleString() : ''}
                  onChange={(e) => setField(key, e.target.value)}
                  placeholder="0"
                />
                <span className="nontax__unit">원</span>
              </span>
              <span className="nontax__hint">{hint}</span>
              {exceeded && (
                <span className="nontax__warn">
                  한도 {limit.toLocaleString()}원 초과 — 초과분은 과세 처리됩니다.
                </span>
              )}
            </label>
          );
        })}
      </div>

      <div className="nontax__summary">
        <div className="nontax__summary-row">
          <span>비과세 합계 (한도 적용)</span>
          <strong>{nontaxTotal.toLocaleString()}원</strong>
        </div>
        {taxable != null && (
          <div className="nontax__summary-row nontax__summary-row--total">
            <span>과세 보수 (보험료·세금 산정 기준)</span>
            <strong>{taxable.toLocaleString()}원</strong>
          </div>
        )}
      </div>
    </div>
  );
}
