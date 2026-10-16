// Café upgrades: data only. Each names the station parameter it changes, as a multiplier or a
// count against today's behaviour (`from`); src/sim/shop.ts turns owned ones into the station.
// Prices are in an average player's tips (`npm run balance`: about $10 a shift in week 1, $52 by
// Friday): the docket rail after Monday–Tuesday, one station upgrade by the end of week 1, the
// steam wand in week 2, the second group head the long goal. Money is integer cents.
// The second group head changes nothing yet (one group head) and the docket rail only the view.

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
    costCents: 3_000,
    param: 'grindSpeed',
    from: 1,
    to: 1.4,
  },
  {
    id: 'secondGroup',
    name: 'Second group head',
    description: 'Pull two shots at once.',
    costCents: 10_000,
    param: 'groupHeads',
    from: 1,
    to: 2,
  },
  {
    id: 'steamWand',
    name: 'Better steam wand',
    description: 'Heats milk faster without scalding it.',
    costCents: 5_000,
    param: 'steamSpeed',
    from: 1,
    to: 1.3,
  },
  {
    id: 'docketRail',
    name: 'Docket rail',
    description: 'Keeps more tickets in view.',
    costCents: 1_500,
    param: 'ticketsShown',
    from: 3,
    to: 6,
  },
];
