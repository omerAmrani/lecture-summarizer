import { STATUS_LABEL } from '@/lib/status';

export function Status({ s, pct }: { s: string; pct?: number }) {
  return (
    <span className="status" data-s={s}>
      <span className="status__dot" />
      {STATUS_LABEL[s] || s}
      {pct !== undefined && <span data-testid="status-pct"> {Math.round(pct)}%</span>}
    </span>
  );
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: 'short' });
}

export function fmtDateLong(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: 'long', year: 'numeric' });
}
