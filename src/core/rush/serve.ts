// Day 2 at the pass: handing a made drink to a customer, judging it against their order, hand-backs
// (wrong drink, wrong milk) and setting a misheard ticket straight, and the reactions from the
// customer and Gaz. Split out of core/rush.ts and core/rushListening.ts with no behaviour change.

import type { CustomerId } from '../../data/customers';
import { answerFor, wrongFields } from '../../sim/listening';
import { addFrustration } from '../../sim/owner';
import { evaluateServe, REJECT_PENALTY, type MadeDrink } from '../../sim/rush';
import { returnReady, takeReady } from '../barista';
import { eventHandedBack } from './events';
import { customerSay, forgetCustomer, gaz, varsFor } from './speech';
import { setState, type Rush, type RushCustomer } from './state';

/**
 * A handed-back drink that matches its ticket means the ticket was wrong: a listening mistake.
 * They set you straight at the pass (naming the milk if that was it) and the ticket is
 * corrected; the cost was the wasted drink, the time and their patience. Returns false when the
 * drink simply didn't match the ticket (a making mistake, not a listening one).
 */
export function fixMisheardTicket(
  r: Rush,
  c: RushCustomer,
  drink: MadeDrink,
  wrongMilk: boolean,
): boolean {
  const t = c.heard;
  if (!t) return false;
  const matchesTicket =
    drink.type === t.type && (drink.type !== 'flatWhite' || drink.milkType === (t.milk ?? 'full'));
  if (!matchesTicket || wrongFields(t, c.order).length === 0) return false;
  if (wrongMilk) {
    const text = answerFor(c.def.answers, c.order, 'milk');
    customerSay(r, c, `${c.def.id}.answer.milk`, text, 'annoyed', 'order');
  }
  c.heard = { ...c.order };
  r.events.push({ type: 'ticketFixed', customer: c.def.id });
  gaz(r, 'rush.misheard', 'react', varsFor(c, drink.type));
  return true;
}

export function serve(r: Rush, id: CustomerId): void {
  const b = r.barista;
  const c = r.customers.find((x) => x.def.id === id);
  if (!b.ready || !c || c.state !== 'waiting') return;
  const drink = takeReady(b, []);
  if (!drink) return;
  const judged = evaluateServe(c.order, drink, {
    waited: r.time - (c.registerAt ?? r.time),
    patience: c.def.patience,
    tolerance: c.def.tolerance,
    tipCents: c.def.tipCents,
  });
  // Shift events (week mode) leave them a little happier or crosser with the same drink.
  const result =
    judged.accepted && c.eventSatisfaction !== 0
      ? {
          ...judged,
          satisfaction: Math.round(
            Math.min(100, Math.max(0, judged.satisfaction + c.eventSatisfaction)),
          ),
        }
      : judged;
  if (!result.accepted) {
    // They hand it back: it stays on the pass, still cooling, and their patience takes a hit.
    returnReady(b, drink);
    c.rejected++;
    c.patience = Math.max(1, c.patience - c.def.patience * REJECT_PENALTY);
    c.reaction = 'annoyed';
    const wrongMilk = result.complaints.includes('wrongMilk');
    customerSay(
      r,
      c,
      wrongMilk ? `${c.def.id}.rejectedMilk` : `${c.def.id}.rejected`,
      wrongMilk ? c.def.lines.rejectedMilk : c.def.lines.rejected[c.order.type],
      'annoyed',
      'order',
    );
    // A listening mistake, the wrong milk (drink made for someone else), or the wrong drink.
    if (!fixMisheardTicket(r, c, drink, wrongMilk))
      gaz(r, wrongMilk ? 'rush.wrongMilk' : 'rush.wrongDrink', 'react', varsFor(c, drink.type));
    if (wrongMilk) eventHandedBack(r, c);
    addFrustration(r.owner, 0.8);
    r.streak.good = 0;
    r.streak.bad++;
    if (r.streak.bad === 2) gaz(r, 'rush.streakBad', 'react');
    r.events.push({ type: 'rejected', customer: c.def.id });
    return;
  }
  c.outcome = 'served';
  c.result = result;
  setState(c, 'leaving');
  forgetCustomer(r, c, true);
  r.records.push({
    customer: c.def.id,
    accepted: true,
    correct: result.correct,
    waited: r.time - (c.registerAt ?? r.time),
    satisfaction: result.satisfaction,
    tipCents: result.tipCents,
  });
  r.events.push({ type: 'served', customer: c.def.id, result });
  r.events.push({ type: 'sfx', id: result.satisfaction >= 60 ? 'good' : 'bad' });

  // What the customer says: delighted, a specific grumble, or a shrug.
  const lines = c.def.lines;
  const grumble = result.complaints.map((k) => lines.complaint[k]).find((t) => t !== undefined);
  const good = result.satisfaction >= 75 && result.correct;
  c.reaction = good ? 'pleased' : result.satisfaction < 45 ? 'annoyed' : 'neutral';
  if (good) customerSay(r, c, `${c.def.id}.happy`, lines.happy, 'pleased', 'order');
  else if (grumble) customerSay(r, c, `${c.def.id}.complaint`, grumble, 'annoyed', 'order');
  else customerSay(r, c, `${c.def.id}.okay`, lines.okay, 'neutral', 'order');

  // Gaz: the specific miss first, then quality, then the occasional compliment.
  const v = varsFor(c, drink.type);
  if (result.complaints.includes('notHotEnough')) gaz(r, 'rush.notHotEnough', 'react', v);
  else if (result.complaints.includes('noHeart')) gaz(r, 'rush.noHeart', 'react', v);
  else if (result.complaints.includes('lukewarm')) gaz(r, 'rush.coldDrink', 'react', v);
  else if (result.satisfaction < 45) gaz(r, 'rush.poorServe', 'react', v);
  else if (result.satisfaction >= 85 && r.praised++ % 2 === 0) gaz(r, 'rush.goodServe', 'react', v);

  if (good) {
    r.streak.good++;
    r.streak.bad = 0;
    addFrustration(r.owner, -0.5);
    if (r.streak.good === 3) gaz(r, 'rush.streakGood', 'react');
  } else if (result.satisfaction < 50) {
    r.streak.good = 0;
    r.streak.bad++;
    addFrustration(r.owner, 0.6);
    if (r.streak.bad === 2) gaz(r, 'rush.streakBad', 'react');
  }
}
