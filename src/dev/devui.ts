// Small helpers shared by the dev review pages (dev/casting.html, dev/listening.html).

export const esc = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );

/** A dB / LUFS figure, "−∞" for silence. */
export const fmt = (x: number, digits = 1): string =>
  Number.isFinite(x) ? x.toFixed(digits) : '−∞';

let toastTimer = 0;
/** Show a short status message in the page's [data-toast] element (UI-only timer). */
export function toast(msg: string, bad = false): void {
  const t = document.querySelector<HTMLElement>('[data-toast]');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast show${bad ? ' bad' : ''}`;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.className = 'toast'), 3500);
}

/** Download a JSON file. */
export function downloadJson(name: string, data: unknown): void {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** A file saved earlier through the dev server, or null (scripts/vite-dev-tools.ts). */
export async function loadFromDevServer(kind: 'casting' | 'listening'): Promise<unknown> {
  try {
    const r = await fetch(`/__dev/load/${kind}`, { cache: 'no-store' });
    return r.ok ? ((await r.json()) as { data: unknown }).data : null;
  } catch {
    return null;
  }
}

/** POST JSON to the dev server's fixed save endpoint (scripts/vite-dev-tools.ts). */
export async function saveToDevServer(kind: 'casting' | 'listening', data: unknown): Promise<void> {
  try {
    const r = await fetch(`/__dev/save/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const j = (await r.json()) as { ok: boolean; file?: string; error?: string };
    if (j.ok) toast(`Saved to ${j.file}.`);
    else toast(`Not saved: ${j.error}`, true);
  } catch (e) {
    toast(`Not saved: ${(e as Error).message}`, true);
  }
}
