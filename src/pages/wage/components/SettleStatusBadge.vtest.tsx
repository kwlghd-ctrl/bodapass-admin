import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettleStatusBadge } from './SettleStatusBadge';
import type { MonthClose } from '../../../api/attendance.types';

/**
 * Phase CC1 — SettleStatusBadge 단계별 렌더 테스트.
 *
 * 진행 스테이지에 따라 6단계 라벨이 올바르게 표시되는지 확인.
 */

function makeClose(over: Partial<MonthClose> = {}): MonthClose {
  return {
    attStage: 'OPEN',
    wageStage: 'OPEN',
    ...over,
  } as MonthClose;
}

describe('SettleStatusBadge', () => {
  it('renders nothing-special when monthClose is null (default OPEN)', () => {
    render(<SettleStatusBadge monthClose={null} />);
    expect(screen.getByText('현장 출역확정(월)')).toBeInTheDocument();
    expect(screen.getByText('본사 출역확정')).toBeInTheDocument();
    expect(screen.getByText('마감')).toBeInTheDocument();
  });

  it('marks 본사 출역확정 done when attStage=HQ_CONFIRMED', () => {
    render(<SettleStatusBadge monthClose={makeClose({ attStage: 'HQ_CONFIRMED' })} />);
    const role = screen.getByRole('img');
    expect(role.getAttribute('aria-label')).toContain('본사 출역확정✓');
  });

  it('marks 마감 done when wageStage=SETTLED', () => {
    render(<SettleStatusBadge monthClose={makeClose({ attStage: 'HQ_CONFIRMED', wageStage: 'SETTLED' })} />);
    const role = screen.getByRole('img');
    expect(role.getAttribute('aria-label')).toContain('마감✓');
  });
});
