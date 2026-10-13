// Stable dialogue IDs shared by the game and the voice render script. A clip is identified by who
// says it and a hash of the exact words, so every filled-in template variant ("{name} wanted a
// {ordered}…") gets its own recording and editing a line automatically invalidates its clip.

/** 32-bit FNV-1a, hex. Deterministic in Node and every browser. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Delivery variants of the same words: 'slow' is the "sorry, could you repeat that?" take. */
export type Delivery = 'normal' | 'slow';

export function dialogueId(speaker: string, text: string, delivery: Delivery = 'normal'): string {
  return `${speaker}:${fnv1a(delivery === 'normal' ? text : `${delivery}|${text}`)}`;
}
