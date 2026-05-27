export function MiniKpi({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="mini-kpi">
      <p className="mini-kpi__label">{label}</p>
      <p className="mini-kpi__value" style={{ color }}>{value}</p>
      <p className="mini-kpi__sub">{sub}</p>
    </div>
  );
}
