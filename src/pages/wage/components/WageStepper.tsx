// WageStepper — Wage 페이지 정산 진행 큰 스텝퍼 (Phase Z3 분리)
//
// 5단계: 출역확정(월) / 노무비 확정 / 지급 / 명세서발행 / 마감.
// 순수 컴포넌트 — props: monthClose, isAllMode. 상태 없음.
import type { MonthClose } from '../../../api/attendance.types';

export function WageStepper({
  monthClose,
  isAllMode,
}: {
  monthClose: MonthClose | null;
  isAllMode: boolean;
}) {
  const att = monthClose?.attStage ?? 'OPEN';
  const wage = monthClose?.wageStage ?? 'OPEN';

  const steps: Array<{ label: string; done: boolean; current?: boolean }> = [
    { label: '출역확정(월)', done: att === 'HQ_CONFIRMED' },
    { label: '노무비 확정',  done: wage === 'HQ_CONFIRMED' || wage === 'PAID' || wage === 'SETTLED' },
    { label: '지급',          done: wage === 'PAID' || wage === 'SETTLED' },
    { label: '명세서발행',    done: wage === 'PAID' || wage === 'SETTLED' },
    { label: '마감',          done: wage === 'SETTLED' },
  ];

  // 현재 단계 = 가장 마지막 done 의 다음 항목
  const currentIdx = steps.findIndex((s) => !s.done);
  if (currentIdx >= 0) steps[currentIdx].current = true;

  return (
    <section className="wage-stepper">
      <header className="wage-stepper__head">
        <h3 className="wage-stepper__title">정산 진행</h3>
        {isAllMode && (
          <span className="wage-stepper__hint">전체 모드 — 단일 현장 선택 시 진행도 표시</span>
        )}
      </header>
      <ol className={'wage-stepper__list' + (isAllMode ? ' is-disabled' : '')}>
        {steps.map((s, i) => (
          <li
            key={s.label}
            className={
              'wage-stepper__step' +
              (s.done ? ' is-done' : '') +
              (s.current ? ' is-current' : '')
            }
          >
            <span className="wage-stepper__num">{s.done ? '✓' : i + 1}</span>
            <span className="wage-stepper__label">{s.label}</span>
            {i < steps.length - 1 && <span className="wage-stepper__line" aria-hidden />}
          </li>
        ))}
      </ol>
    </section>
  );
}
