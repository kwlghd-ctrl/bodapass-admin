import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MonthPicker } from './MonthPicker';

/**
 * Phase CC1 — MonthPicker 기본 인터랙션 테스트.
 *
 * value="YYYY-MM" 으로 받고 onChange 가 호출되는지 검증.
 */

describe('MonthPicker', () => {
  it('renders prev/next arrow buttons', () => {
    const onChange = vi.fn();
    render(<MonthPicker value="2026-05" onChange={onChange} />);
    expect(screen.getByLabelText('이전 달')).toBeInTheDocument();
    expect(screen.getByLabelText('다음 달')).toBeInTheDocument();
  });

  it('calls onChange with previous month when prev arrow clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MonthPicker value="2026-05" onChange={onChange} />);
    await user.click(screen.getByLabelText('이전 달'));
    expect(onChange).toHaveBeenCalledWith('2026-04');
  });

  it('calls onChange with next month when next arrow clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MonthPicker value="2026-05" onChange={onChange} />);
    await user.click(screen.getByLabelText('다음 달'));
    expect(onChange).toHaveBeenCalledWith('2026-06');
  });

  it('wraps year when going prev from January', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MonthPicker value="2026-01" onChange={onChange} />);
    await user.click(screen.getByLabelText('이전 달'));
    expect(onChange).toHaveBeenCalledWith('2025-12');
  });
});
