// Anillo de progreso (como el 0% de las series en la app).
export function Ring({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const r = 32, c = 2 * Math.PI * r;
  return (
    <div className="relative size-[76px] shrink-0">
      <svg viewBox="0 0 76 76" className="size-full -rotate-90">
        <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(43,27,14,.12)" strokeWidth="6" />
        <circle cx="38" cy="38" r={r} fill="none" stroke="#f26b0f" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-bold">{pct}%</span>
    </div>
  );
}
