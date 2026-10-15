// Listening stats for the shift report: how often each part of the order was rung up right, from
// the field-by-field ticket diff. Milk, temperature and heart only count on flat whites whose drink
// was heard right (a wrong drink trumps the rest, as in wrongFields()).

import { diffTickets, type TicketField } from '../contracts/ticket';
import { normaliseOrder, ORDER_FIELDS, type ListenRecord } from '../listening';

export interface FieldAccuracy {
  /** Orders where this field could be heard right or wrong. */
  total: number;
  correct: number;
}

export function accuracyByField(
  records: readonly ListenRecord[],
): Record<TicketField, FieldAccuracy> {
  const out = Object.fromEntries(ORDER_FIELDS.map((f) => [f, { total: 0, correct: 0 }])) as Record<
    TicketField,
    FieldAccuracy
  >;
  for (const r of records) {
    if (!r.heard) continue;
    const wrong = diffTickets(r.truth, r.heard).map((d) => d.field);
    out.drink.total++;
    if (!wrong.includes('drink')) out.drink.correct++;
    if (wrong.includes('drink') || normaliseOrder(r.truth).type !== 'flatWhite') continue;
    for (const f of ['milk', 'temp', 'heart'] as const) {
      out[f].total++;
      if (!wrong.includes(f)) out[f].correct++;
    }
  }
  return out;
}
