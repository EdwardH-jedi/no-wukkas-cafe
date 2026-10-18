// index.html is what a shared link shows (todo.md T3.2): the game's name, a description that says
// what the week is, Open Graph + Twitter card tags, and a 1200×630 public/og.png small enough to
// fetch (≤ 300 kB). The og:image URL is made absolute at deploy time (vite.config.ts siteUrl).

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');

/** The content of <meta name|property="key">. */
function meta(key: string): string | null {
  const tag = [...html.matchAll(/<meta\b[^>]*>/gs)]
    .map((m) => m[0])
    .find((t) => new RegExp(`(?:name|property)="${key}"`).test(t));
  return (
    tag
      ?.match(/content="([^"]*)"/s)?.[1]
      ?.replace(/\s+/g, ' ')
      .trim() ?? null
  );
}

describe('index.html share tags', () => {
  it('is titled after the game, not Day 1', () => {
    expect(html.match(/<title>([^<]*)<\/title>/)?.[1]).toBe('No Wukkas Café');
  });

  it('describes the week of morning rushes', () => {
    const d = meta('description');
    expect(d).toMatch(/Surry Hills/);
    expect(d).toMatch(/week/i);
  });

  it('has Open Graph and Twitter card tags', () => {
    expect(meta('og:title')).toBe('No Wukkas Café');
    expect(meta('og:description')).toBe(meta('description'));
    expect(meta('og:type')).toBe('website');
    expect(meta('og:image')).toBe('__NWC_SITE_URL__og.png');
    expect(meta('og:image:width')).toBe('1200');
    expect(meta('og:image:height')).toBe('630');
    expect(meta('twitter:card')).toBe('summary_large_image');
  });

  it('ships a 1200×630 PNG under 300 kB as public/og.png', () => {
    const file = join(ROOT, 'public/og.png');
    expect(existsSync(file)).toBe(true);
    const png = readFileSync(file);
    expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
    expect(statSync(file).size).toBeLessThanOrEqual(300_000);
  });
});
