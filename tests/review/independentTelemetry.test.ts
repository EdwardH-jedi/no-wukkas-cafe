import { afterEach, expect, it, vi } from 'vitest';
import { createTelemetry, downloadLog } from '../../src/app/telemetry';
import { createRush } from '../../src/core/rush';
import { createTelemetryStore } from '../../src/core/save/telemetry';
import { createTrial } from '../../src/core/trial';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('exports a valid JSON Blob of generated records without PII fields and clears it', async () => {
  const store = createTelemetryStore(null);
  const recorder = createTelemetry(
    { rush: () => createRush(7), trial: () => createTrial(7) },
    store,
  );
  recorder.startShift();
  recorder.end('title');
  recorder.startTrial();
  recorder.end('title');
  let exported: Blob | undefined;
  const click = vi.fn();
  vi.stubGlobal('document', {
    createElement: () => ({ click, remove: vi.fn() }),
    body: { append: vi.fn() },
  });
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    exported = blob as Blob;
    return 'blob:review';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  downloadLog(store, new Date('2026-10-17T00:00:00Z'));
  expect(click).toHaveBeenCalledOnce();
  expect(exported?.type).toBe('application/json');
  const json = JSON.parse(await exported!.text());
  expect(json.records).toHaveLength(2);
  const keys: string[] = [];
  const visit = (v: unknown): void => {
    if (!v || typeof v !== 'object') return;
    for (const [k, value] of Object.entries(v)) {
      keys.push(k);
      visit(value);
    }
  };
  visit(json);
  expect(
    keys.filter((k) =>
      /^(email|name|fullName|phone|address|ip|ipAddress|userAgent|location|token|password)$/i.test(
        k,
      ),
    ),
  ).toEqual([]);
  expect(json.exportedAt).toBe('2026-10-17T00:00:00.000Z');
  store.clear();
  expect(store.read().records).toEqual([]);
  await new Promise((resolve) => setTimeout(resolve, 5));
});

it('real QuotaExceededError during a gameplay checkpoint falls back to memory and never escapes', () => {
  const store = createTelemetryStore({
    getItem: () => null,
    setItem: () => {
      throw new DOMException('Quota full', 'QuotaExceededError');
    },
  });
  const recorder = createTelemetry(
    { rush: () => createRush(7), trial: () => createTrial(7) },
    store,
  );
  recorder.startShift();
  expect(() => recorder.checkpoint()).not.toThrow();
  expect(store.memoryOnly).toBe(true);
  expect(() => recorder.end('title')).not.toThrow();
  expect(store.read().records).toHaveLength(1);
  expect(store.read().records[0]?.ending).toBe('title');
  expect(() => store.clear()).not.toThrow();
  expect(store.read().records).toEqual([]);
});
