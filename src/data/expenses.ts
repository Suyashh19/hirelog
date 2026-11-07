import { all, one, save, softDelete, uuid, now, getWorkspace } from '../db/repo';

/** Costs per machine / vehicle / service: fuel, repairs, parts, wages… (Pro). Profit per machine is Business. */
export const EXPENSE_CATEGORIES = [
  { id: 'fuel', label: 'Fuel / diesel', icon: 'gas-station' },
  { id: 'repair', label: 'Repair / service', icon: 'wrench-outline' },
  { id: 'parts', label: 'Parts / tyres', icon: 'cog-outline' },
  { id: 'wages', label: 'Operator / driver pay', icon: 'account-cash-outline' },
  { id: 'insurance', label: 'Insurance / tax / permit', icon: 'shield-outline' },
  { id: 'loan', label: 'Loan / EMI', icon: 'bank-outline' },
  { id: 'other', label: 'Other', icon: 'dots-horizontal' },
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]['id'];

export interface Expense {
  id: string; resourceId: string | null; category: ExpenseCategory; amountPaise: number; spentAt: number; litres: number | null; note: string | null;
}
export interface ExpenseRow extends Expense { resourceName: string | null }

export function addExpense(x: { resourceId: string | null; category: ExpenseCategory; amountPaise: number; spentAt?: number; litres?: number | null; note?: string | null }) {
  const ws = getWorkspace();
  if (!ws) return null;
  const id = uuid();
  save('expenses', {
    id, workspaceId: ws.id, resourceId: x.resourceId, category: x.category, amountPaise: x.amountPaise,
    spentAt: x.spentAt ?? now(), litres: x.litres ?? null, note: x.note ?? null, deletedAt: null,
  });
  return id;
}
export const deleteExpense = (id: string) => softDelete('expenses', id);

export const listExpenses = (from: number, to: number) =>
  all<ExpenseRow>(`SELECT x.*, r.name AS resource_name FROM expenses x LEFT JOIN resources r ON r.id=x.resource_id
                   WHERE x.deleted_at IS NULL AND x.spent_at>=? AND x.spent_at<? ORDER BY x.spent_at DESC`, [from, to]);

export const expenseTotal = (from: number, to: number) =>
  one<{ s: number }>('SELECT COALESCE(SUM(amount_paise),0) AS s FROM expenses WHERE deleted_at IS NULL AND spent_at>=? AND spent_at<?', [from, to])?.s ?? 0;

/** Earned, spent and profit for each machine / vehicle / service in a period. */
export function profitByResource(from: number, to: number) {
  const earned = all<{ id: string; name: string; earned: number }>(
    `SELECT r.id, r.name,
       COALESCE((SELECT SUM(t.amount_paise + COALESCE((SELECT SUM(ROUND(i.amount_paise*i.quantity)) FROM entry_items i WHERE i.entry_id=t.id AND i.deleted_at IS NULL),0))
                 FROM time_entries t WHERE t.resource_id=r.id AND t.deleted_at IS NULL AND t.status<>'running' AND t.started_at>=? AND t.started_at<?),0) AS earned
     FROM resources r WHERE r.deleted_at IS NULL`, [from, to]);
  const spent = all<{ resourceId: string | null; s: number }>(
    'SELECT resource_id, SUM(amount_paise) AS s FROM expenses WHERE deleted_at IS NULL AND spent_at>=? AND spent_at<? GROUP BY resource_id', [from, to]);
  const spentBy = new Map(spent.map((x) => [x.resourceId, x.s]));
  const rows = earned.map((r) => ({ name: r.name, earned: r.earned, spent: spentBy.get(r.id) ?? 0, profit: r.earned - (spentBy.get(r.id) ?? 0) }))
    .filter((r) => r.earned || r.spent);
  const general = spentBy.get(null) ?? 0;
  if (general) rows.push({ name: 'General (not one machine)', earned: 0, spent: general, profit: -general });
  return rows.sort((a, b) => b.profit - a.profit);
}

/** Fuel use per machine: litres and cost (for "unusual use" checks). */
export const fuelByResource = (from: number, to: number) =>
  all<{ name: string; litres: number; spent: number }>(
    `SELECT COALESCE(r.name,'General') AS name, COALESCE(SUM(x.litres),0) AS litres, SUM(x.amount_paise) AS spent
     FROM expenses x LEFT JOIN resources r ON r.id=x.resource_id
     WHERE x.deleted_at IS NULL AND x.category='fuel' AND x.spent_at>=? AND x.spent_at<? GROUP BY name`, [from, to]);
