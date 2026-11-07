export interface BillLite {
  id: string;
  subtotalPaise: number;
  sortKey: number;
  status: string;
}

/**
 * Applies a customer's total payments to their sent bills oldest-first (after the opening balance).
 * Returns the new status for each non-draft bill: sent | partly_paid | paid.
 */
export function allocatePayments(
  openingBalancePaise: number,
  totalPaidPaise: number,
  bills: BillLite[],
): Record<string, 'sent' | 'partly_paid' | 'paid'> {
  const out: Record<string, 'sent' | 'partly_paid' | 'paid'> = {};
  let cumulative = Math.max(0, openingBalancePaise);
  const sorted = bills.filter((b) => b.status !== 'draft').sort((a, b) => a.sortKey - b.sortKey);
  for (const b of sorted) {
    const before = cumulative;
    cumulative += b.subtotalPaise;
    out[b.id] = totalPaidPaise >= cumulative ? 'paid' : totalPaidPaise > before ? 'partly_paid' : 'sent';
  }
  return out;
}

export function ageBucket(daysOld: number): '0-7' | '8-15' | '16-30' | '30+' {
  if (daysOld <= 7) return '0-7';
  if (daysOld <= 15) return '8-15';
  if (daysOld <= 30) return '16-30';
  return '30+';
}
