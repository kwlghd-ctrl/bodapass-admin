// FILE_VERSION 1777950611
// MonthPicker — 노임비/퇴직금 월 선택 (V2 분리)
import { MacSelect } from '../../../components/MacSelect';
import { localYearMonth } from '../../../utils/dateLocal';

interface MonthPickerProps {
  value: string;
  onChange: (v: string) => void;
}

export function MonthPicker({ value, onChange }: MonthPickerProps) {
  const [yStr, mStr] = value.split('-');
  const year = Number(yStr);
  const month = Number(mStr);

  function shift(delta: number) {
    let y = year;
    let m = month + delta;
    while (m < 1) { m += 12; y -= 1; }
    while (m > 12) { m -= 12; y += 1; }
    onChange(`${y}-${String(m).padStart(2, '0')}`);
  }
  function toThisMonth() {
    const now = new Date();
    onChange(localYearMonth(now));
  }

  const isThisMonth = (() => {
    const now = new Date();
    return year === now.getFullYear() && month === now.getMonth() + 1;
  })();

  const thisYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = thisYear - 5; y <= thisYear + 1; y += 1) years.push(y);

  return (
    <div className="wage-month-picker">
      <button
        type="button"
        className="wage-month-picker__arrow"
        onClick={() => shift(-1)}
        aria-label="이전 달"
      >‹</button>
      <MacSelect
        value={year}
        onChange={(v) => onChange(`${v}-${String(month).padStart(2, '0')}`)}
        className="wage-month-picker__year"
        options={[...years.map((y) => (
          ({ value: y, label: <>{y}년</> })
        ))]}
      />
      <MacSelect
        value={month}
        onChange={(v) => onChange(`${year}-${String(v).padStart(2, '0')}`)}
        className="wage-month-picker__month"
        options={[...Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          ({ value: m, label: <>{m}월</> })
        ))]}
      />
      <button
        type="button"
        className="wage-month-picker__arrow"
        onClick={() => shift(1)}
        aria-label="다음 달"
      >›</button>
      {!isThisMonth && (
        <button
          type="button"
          className="wage-month-picker__today"
          onClick={toThisMonth}
        >이번 달</button>
      )}
    </div>
  );
}
