import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SeveranceHero } from './SeveranceHero';
import type { SeveranceMonthSummary } from '../../../api/wage.types';

/**
 * Phase BB5 — SeveranceHero 기본 렌더 테스트 (Vitest + React Testing Library)
 *
 * 실행: npm run test:ui
 */

describe('SeveranceHero', () => {
  it('renders nothing when data is null', () => {
    const { container } = render(<SeveranceHero data={null} site={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders tiles when data is provided', () => {
    const data: SeveranceMonthSummary = {
      year: 2026,
      month: 5,
      attendedToday: 12,
      rows: [],
    } as unknown as SeveranceMonthSummary;
    render(<SeveranceHero data={data} site={null} />);
    expect(screen.getByText(/당일 출력 인원/)).toBeInTheDocument();
  });
});
