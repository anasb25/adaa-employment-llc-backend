export interface AirTicketHistoryEntry {
  at: string;
  type: 'add' | 'subtract';
  amount: number;
  balance_after: number;
  reason?: string;
}

export function parseAirTicketsHistory(raw: unknown): AirTicketHistoryEntry[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as AirTicketHistoryEntry[];
  return [];
}

export function appendAirTicketsHistory(
  history: AirTicketHistoryEntry[],
  previousBalance: number,
  nextBalance: number,
  reason: string,
): { history: AirTicketHistoryEntry[]; changed: boolean } {
  const prev = Math.max(0, Math.floor(Number(previousBalance) || 0));
  const next = Math.max(0, Math.floor(Number(nextBalance) || 0));
  if (prev === next) {
    return { history, changed: false };
  }
  const delta = Math.abs(next - prev);
  const type: 'add' | 'subtract' = next > prev ? 'add' : 'subtract';
  const entry: AirTicketHistoryEntry = {
    at: new Date().toISOString(),
    type,
    amount: delta,
    balance_after: next,
    reason,
  };
  return { history: [...history, entry], changed: true };
}
