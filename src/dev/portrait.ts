// Small SVG portraits for the casting page, drawn from the same look data the 3D customers use
// (data/customers.ts) so a card matches who walks into the café. One face template for everyone:
// only skin, hair, clothes and accessories change, never features (AGENTS.md §6).

import type { CustomerLook } from '../data/customers';

/** Gaz's colours, mirrored from world/owner.ts (grey hair, charcoal shirt, green apron). */
export const GAZ_LOOK: CustomerLook & { apron: string } = {
  skin: '#e2ad8c',
  hair: 'short',
  hairC: '#9a948c',
  top: '#3b4048',
  legs: '#2c3a52',
  build: 1.1,
  height: 1,
  apron: '#2f4a3a',
};

const HIVIS = '#d8e83a';

export function portraitSvg(look: CustomerLook & { apron?: string }, title: string): string {
  const top = look.top === 'hivis' ? HIVIS : look.top;
  const hair = look.hairC;
  const back: Record<CustomerLook['hair'], string> = {
    short: '',
    none: '',
    pony: `<path d="M66 34 q14 6 10 26 q-4 -10 -12 -14z" fill="${hair}"/>`,
    curly: `<circle cx="34" cy="38" r="9" fill="${hair}"/><circle cx="66" cy="38" r="9" fill="${hair}"/>`,
    long: `<path d="M28 34 q-4 28 4 40 h36 q8 -12 4 -40z" fill="${hair}"/>`,
    bob: `<path d="M27 32 q-2 22 6 30 h34 q8 -8 6 -30z" fill="${hair}"/>`,
  };
  const front: Record<CustomerLook['hair'], string> = {
    short: `<path d="M31 34 q2 -16 19 -16 q17 0 19 16 q-6 -7 -19 -7 q-13 0 -19 7z" fill="${hair}"/>`,
    none: '',
    pony: `<path d="M31 35 q1 -17 19 -17 q18 0 19 17 q-8 -8 -19 -8 q-11 0 -19 8z" fill="${hair}"/>`,
    curly: `<path d="M30 36 q0 -19 20 -19 q20 0 20 19 q-3 -6 -8 -7 q-4 -6 -12 -5 q-8 -1 -12 5 q-5 1 -8 7z" fill="${hair}"/>`,
    long: `<path d="M30 36 q1 -18 20 -18 q19 0 20 18 q-6 -9 -20 -9 q-14 0 -20 9z" fill="${hair}"/>`,
    bob: `<path d="M30 37 q0 -19 20 -19 q20 0 20 19 l-4 -1 q-4 -9 -16 -9 q-12 0 -16 9z" fill="${hair}"/>`,
  };
  const hat =
    look.hat === 'hardhat'
      ? `<path d="M29 31 q2 -17 21 -17 q19 0 21 17z" fill="#f2c230"/><rect x="25" y="29" width="50" height="5" rx="2" fill="#e0b020"/>`
      : look.hat === 'cap'
        ? `<path d="M31 31 q2 -14 19 -14 q17 0 19 14z" fill="${look.hatC ?? '#333'}"/><path d="M50 29 h24 q2 3 -2 4 h-22z" fill="${look.hatC ?? '#333'}"/>`
        : '';
  const glasses = look.glasses
    ? `<g fill="none" stroke="#2a2420" stroke-width="1.6"><circle cx="43" cy="41" r="5"/><circle cx="57" cy="41" r="5"/><path d="M48 41 h4"/></g>`
    : look.sunnies
      ? `<g fill="#1b1714"><rect x="37" y="37" width="11" height="7" rx="3"/><rect x="52" y="37" width="11" height="7" rx="3"/><rect x="47" y="39" width="6" height="1.6"/></g>`
      : '';
  const stripes =
    look.top === 'hivis'
      ? `<path d="M30 84 l10 -14 M70 84 l-10 -14" stroke="#c9ccd1" stroke-width="4"/>`
      : '';
  const apron = look.apron
    ? `<path d="M38 74 h24 v26 h-24z" fill="${look.apron}"/><path d="M38 74 l-4 -6 M62 74 l4 -6" stroke="${look.apron}" stroke-width="2"/>`
    : '';
  const bag = look.bag ? `<path d="M30 72 L66 100" stroke="${look.bag}" stroke-width="3"/>` : '';
  return `<svg viewBox="0 0 100 100" role="img" aria-label="${title}" xmlns="http://www.w3.org/2000/svg">
  <title>${title}</title>
  ${back[look.hair]}
  <path d="M18 100 q2 -28 32 -30 q30 2 32 30z" fill="${top}"/>
  ${stripes}${apron}${bag}
  <rect x="44" y="56" width="12" height="12" rx="4" fill="${look.skin}"/>
  <ellipse cx="50" cy="42" rx="18" ry="20" fill="${look.skin}"/>
  <circle cx="43" cy="42" r="1.8" fill="#2a2420"/><circle cx="57" cy="42" r="1.8" fill="#2a2420"/>
  <path d="M45 51 q5 3 10 0" stroke="#7a4636" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  ${front[look.hair]}${hat}${glasses}
</svg>`;
}
