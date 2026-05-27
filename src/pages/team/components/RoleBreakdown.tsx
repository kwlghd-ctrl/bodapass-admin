export function RoleBreakdown({
  total,
  countByRole,
  activeRole,
  onSelect,
}: {
  total: number;
  countByRole: Map<string, number>;
  activeRole: string | null;
  onSelect: (role: string | null) => void;
}) {
  const entries = Array.from(countByRole.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'),
  );
  return (
    <div className="role-bd">
      <button
        type="button"
        className={'role-bd__chip role-bd__chip--all' + (!activeRole ? ' is-active' : '')}
        onClick={() => onSelect(null)}
      >
        전체 <em>{total}</em>
      </button>
      {entries.map(([role, count]) => (
        <button
          key={role}
          type="button"
          className={'role-bd__chip' + (activeRole === role ? ' is-active' : '')}
          onClick={() => onSelect(activeRole === role ? null : role)}
        >
          {role} <em>{count}</em>
        </button>
      ))}
    </div>
  );
}
