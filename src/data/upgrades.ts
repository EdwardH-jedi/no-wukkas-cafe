// Café upgrades: data only. Each names the station parameter it changes, as a multiplier or a
// count against today's behaviour (`from`); wiring the effect into the barista is a reported hook
// (docs/integration/T5-hook.md). TODO(balance): prices are placeholders until the economy is
// ported and `npm run balance` can check them (AGENTS.md §6). Money is integer cents.

export interface Upgrade {
  id: string;
  name: string;
  description: string;
  costCents: number;
  /** The station parameter it changes. */
  param: 'grindSpeed' | 'groupHeads' | 'steamSpeed' | 'ticketsShown';
  from: number;
  to: number;
}

export const UPGRADES: readonly Upgrade[] = [
  {
    id: 'grinder',
    name: 'Better grinder',
    description: 'Grinds a dose in less time.',
    costCents: 45_000,
    param: 'grindSpeed',
    from: 1,
    to: 1.4,
  },
  {
    id: 'secondGroup',
    name: 'Second group head',
    description: 'Pull two shots at once.',
    costCents: 120_000,
    param: 'groupHeads',
    from: 1,
    to: 2,
  },
  {
    id: 'steamWand',
    name: 'Better steam wand',
    description: 'Heats milk faster without scalding it.',
    costCents: 60_000,
    param: 'steamSpeed',
    from: 1,
    to: 1.3,
  },
  {
    id: 'docketRail',
    name: 'Docket rail',
    description: 'Keeps more tickets in view.',
    costCents: 15_000,
    param: 'ticketsShown',
    from: 3,
    to: 6,
  },
];
