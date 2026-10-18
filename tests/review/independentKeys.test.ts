// Production panel wiring on a small DOM adapter; no game handlers are copied or mocked.
// The adapter preserves onclick replacement and window listener removal, the two boundaries
// exercised here. This is not evidence of browser layout or native keyboard activation.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAudioManager } from '../../src/audio/manager';
import { DEFAULT_KEYS, type KeyMap } from '../../src/sim/contracts/save';
import { createAudioPanel } from '../../src/ui/audioPanel';
import { loadListenSettings } from '../../src/ui/settings';

class Node {
  id = '';
  className = '';
  textContent = '';
  value = '';
  checked = false;
  scrollTop = 0;
  dataset: Record<string, string> = {};
  children: Node[] = [];
  onclick: (() => void) | null = null;
  private singles = new Map<string, Node>();
  classList = {
    contains: (name: string) => this.className.split(' ').includes(name),
    add: (name: string) => {
      this.className += ` ${name}`;
    },
    remove: (name: string) => {
      this.className = this.className
        .split(' ')
        .filter((x) => x !== name)
        .join(' ');
    },
  };
  set innerHTML(html: string) {
    // Read the production markup, so querySelectorAll includes the reset button exactly as
    // the DOM does. The tests do not manufacture its data-a attribute or handler.
    this.children = [...html.matchAll(/<(button|input)\b([^>]*)>/g)].map((m) => {
      const n = new Node();
      for (const a of m[2]!.matchAll(/data-([\w-]+)="([^"]*)"/g)) n.dataset[a[1]!] = a[2]!;
      return n;
    });
  }
  setAttribute(): void {}
  append(...nodes: Node[]): void {
    this.children.push(...nodes);
  }
  focus(): void {}
  blur(): void {}
  closest(): null {
    return null;
  }
  contains(n: Node): boolean {
    return this.children.includes(n);
  }
  querySelector(selector: string): Node {
    const attr = selector.match(/\[data-([\w-]+)="([^"]*)"\]/);
    const found = attr && this.children.find((n) => n.dataset[attr[1]!] === attr[2]);
    if (found) return found;
    if (!this.singles.has(selector)) this.singles.set(selector, new Node());
    return this.singles.get(selector)!;
  }
  querySelectorAll(selector: string): Node[] {
    const attr = selector.match(/^(?:button|input)\[data-([\w-]+)\]$/);
    return attr ? this.children.filter((n) => attr[1]! in n.dataset) : [];
  }
}

function setup() {
  const win = new EventTarget();
  // Toast timing is unrelated to key binding; do not leave real timers behind this fixture.
  vi.stubGlobal('window', Object.assign(win, { setTimeout: () => 0 }));
  vi.stubGlobal('HTMLElement', Node);
  vi.stubGlobal('document', { createElement: () => new Node(), activeElement: null });
  vi.stubGlobal('localStorage', { getItem: () => null });
  const root = new Node();
  let keys: KeyMap = { action: 'j', replay: 'k', serve: 'n' };
  const panel = createAudioPanel(
    root as unknown as HTMLElement,
    createAudioManager('/', { persist: false }),
    {
      test: () => undefined,
      replay: () => undefined,
      listen: { get: loadListenSettings, set: () => undefined },
      keys: {
        get: () => keys,
        set: (next) => {
          keys = next;
        },
      },
    },
  );
  panel.open();
  const dom = root.children[0]!;
  const click = (selector: string) => {
    const node = dom.querySelector(selector);
    expect(node.onclick, `missing click handler: ${selector}`).toBeTypeOf('function');
    node.onclick!();
  };
  const press = (key: string) => {
    const event = Object.assign(new Event('keydown', { cancelable: true }), { key });
    win.dispatchEvent(event);
    return event;
  };
  return { panel, dom, click, press, keys: () => keys };
}

afterEach(() => vi.unstubAllGlobals());

describe('independent Settings key lifecycle', () => {
  it('Usual keys must restore all three bindings instead of only closing Settings', () => {
    const h = setup();
    h.click('[data-a="keysReset"]');
    expect(h.keys()).toEqual(DEFAULT_KEYS);
  });

  it('closing Settings while awaiting a binding must not steal the next gameplay key', () => {
    const h = setup();
    const before = { ...h.keys() };
    h.click('button[data-key="action"]');
    h.click('[data-a="close"]');
    expect(h.dom.classList.contains('hide')).toBe(true);
    const e = h.press('q');
    expect.soft(h.keys(), 'a hidden settings panel changed the action binding').toEqual(before);
    expect(e.defaultPrevented, 'the next gameplay key was intercepted').toBe(false);
  });

  it('an explicit key choice still saves; Escape cancels without changing it', () => {
    const h = setup();
    h.click('button[data-key="action"]');
    h.press('q');
    expect(h.keys().action).toBe('q');
    h.click('button[data-key="action"]');
    h.press('Escape');
    expect(h.keys().action).toBe('q');
    expect(h.press('x').defaultPrevented).toBe(false);
  });

  it('reset during capture cancels the capture, keeps Settings open, and restores every label', () => {
    const h = setup();
    h.click('button[data-key="action"]');
    h.click('[data-a="keysReset"]');
    expect(h.keys()).toEqual(DEFAULT_KEYS);
    expect(h.dom.classList.contains('hide')).toBe(false);
    expect(h.press('q').defaultPrevented).toBe(false);
    expect(h.keys()).toEqual(DEFAULT_KEYS);
    for (const action of ['action', 'replay', 'serve'])
      expect(h.dom.querySelector(`button[data-key="${action}"]`).textContent).not.toBe(
        'Press a key…',
      );
  });

  it('backdrop close cancels capture and reopening permits a fresh explicit key choice', () => {
    const h = setup();
    h.click('button[data-key="replay"]');
    const backdropClick = h.dom.onclick as unknown as (e: { target: Node }) => void;
    backdropClick({ target: h.dom });
    expect(h.dom.classList.contains('hide')).toBe(true);
    expect(h.press('q').defaultPrevented).toBe(false);
    expect(h.keys().replay).toBe('k');
    expect(h.dom.querySelector('button[data-key="replay"]').textContent).toBe('K');
    h.panel.open();
    h.click('button[data-key="replay"]');
    h.press('q');
    expect(h.keys()).toEqual({ action: 'j', replay: 'q', serve: 'n' });
  });
});
