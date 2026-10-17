// Settings: per-bus volume, voice on/off, a test line, replay, and a visible status so a silent
// voice is never a mystery; the listening settings (difficulty, order subtitles, learning mode);
// and the latte-art pour sensitivity. Opened from the title ("Settings") and the in-game Sound
// buttons. Also owns the toast that pops up when audio fails.

import type { AudioManager, AudioStatus, Bus } from '../audio/manager';
import type { Difficulty } from '../sim/listening';
import { bindLogSection, LOG_SECTION_HTML, type LogCallbacks } from './logSection';
import { focusQuietly, menuKeys } from './screens/keys';
import {
  POUR_SENSITIVITY,
  pourSensitivityLabel,
  roundPourSensitivity,
  type ListenSettings,
} from './settings';

export interface AudioPanelCallbacks {
  replay(): void;
  test(): void;
  listen: { get(): ListenSettings; set(s: ListenSettings): void };
  /** The playtest log's Export / Clear (left out, the section isn't shown). */
  log?: LogCallbacks;
}

export interface AudioPanel {
  /** Markup for the Replay + Sound buttons a HUD puts in its top bar. */
  readonly buttonsHtml: string;
  /** Wire any Replay/Sound buttons inside `el`. */
  bind(el: HTMLElement): void;
  open(): void;
  close(): void;
}

const BUS_LABEL: Record<Bus, string> = {
  voice: 'Voices',
  music: 'Music',
  ambience: 'Café ambience',
  sfx: 'Machine & effects',
};

const DOT: Record<AudioStatus, string> = {
  locked: 'idle',
  ok: 'ok',
  off: 'idle',
  fallback: 'warn',
  blocked: 'bad',
  error: 'bad',
};

export function createAudioPanel(
  root: HTMLElement,
  audio: AudioManager,
  cb: AudioPanelCallbacks,
): AudioPanel {
  const panel = document.createElement('div');
  panel.id = 'audioPanel';
  panel.className = 'hide';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  // The in-game buttons and the e2e specs know it as "Sound settings".
  panel.setAttribute('aria-label', 'Sound settings');
  panel.innerHTML = `<div class="box">
    <h3>Settings</h3>
    <h4>Sound</h4>
    <p class="astatus"><i class="dot"></i><span></span></p>
    ${(['voice', 'music', 'ambience', 'sfx'] as const)
      .map(
        (b) =>
          `<label class="slider"><span>${BUS_LABEL[b]}</span><input type="range" min="0" max="100" step="5" data-bus="${b}" aria-label="${BUS_LABEL[b]} volume"><output data-out="${b}"></output></label>`,
      )
      .join('')}
    <label class="chk"><input type="checkbox" data-voice-on> Voices on</label>
    <h4>Listening</h4>
    <label class="sel"><span>Difficulty</span><select data-l="difficulty">
      <option value="easy">Easy: clear orders, quiet café</option>
      <option value="normal">Normal</option>
      <option value="hard">Hard: fast, slangy, noisy</option></select></label>
    <label class="chk"><input type="checkbox" data-l="captions"> Show subtitles</label>
    <label class="chk"><input type="checkbox" data-l="subtitles"> Subtitles: always (accessibility)</label>
    <label class="chk"><input type="checkbox" data-l="learning"> Learning mode: show what they said once you ring it up</label>
    <p class="fine">Difficulty changes start with the next shift.</p>
    <h4>Latte art</h4>
    <label class="slider"><span>Pour sensitivity</span><input type="range" min="${POUR_SENSITIVITY.min}" max="${POUR_SENSITIVITY.max}" step="${POUR_SENSITIVITY.step}" data-l="pour" aria-label="Pour sensitivity"><output data-out="pour"></output></label>
    <p class="fine">How strongly the jug answers your hand: lower for a gentler pour, higher for a quicker one. 1.0× is as tuned.</p>
    ${cb.log ? LOG_SECTION_HTML : ''}
    <div class="titleBtns">
      <button class="btn small" data-a="test">Test voice</button>
      <button class="btn small ghost" data-a="replay">Replay last line</button>
      <button class="btn small ghost" data-a="close">Done</button>
    </div>
    <p class="fine">Voices are placeholder recordings (macOS system voices) until licensed voice actors are in.</p>
  </div>`;
  const toast = document.createElement('div');
  toast.id = 'audioToast';
  toast.className = 'gone';
  toast.setAttribute('role', 'alert');
  root.append(panel, toast);

  const statusText = panel.querySelector('.astatus span') as HTMLElement;
  const statusDot = panel.querySelector('.astatus .dot') as HTMLElement;
  const voiceOn = panel.querySelector('[data-voice-on]') as HTMLInputElement;
  const sliders = panel.querySelectorAll<HTMLInputElement>('input[data-bus]');
  const diffSel = panel.querySelector('[data-l="difficulty"]') as HTMLSelectElement;
  const capChk = panel.querySelector('[data-l="captions"]') as HTMLInputElement;
  const subChk = panel.querySelector('[data-l="subtitles"]') as HTMLInputElement;
  const learnChk = panel.querySelector('[data-l="learning"]') as HTMLInputElement;
  const pourIn = panel.querySelector('[data-l="pour"]') as HTMLInputElement;
  const pourOut = panel.querySelector('[data-out="pour"]') as HTMLElement;
  const syncListen = (): void => {
    const l = cb.listen.get();
    diffSel.value = l.difficulty;
    capChk.checked = l.captions !== false;
    subChk.checked = l.subtitles === 'always';
    learnChk.checked = l.learning;
    pourIn.value = String(roundPourSensitivity(l.pourSensitivity));
    pourOut.textContent = pourSensitivityLabel(l.pourSensitivity);
  };
  const setListen = (): void => {
    const prev = cb.listen.get();
    const was = prev.subtitles;
    cb.listen.set({
      ...prev, // keeps settings this panel doesn't show (e.g. pour sensitivity)
      version: 2,
      difficulty: diffSel.value as Difficulty,
      // Unticked: back to following the difficulty (an older saved choice is kept).
      subtitles: subChk.checked ? 'always' : was === 'always' ? 'auto' : was,
      learning: learnChk.checked,
      captions: capChk.checked,
    });
  };
  diffSel.onchange = capChk.onchange = subChk.onchange = learnChk.onchange = setListen;
  const log = cb.log ? bindLogSection(panel, cb.log) : null;
  pourIn.oninput = () => {
    const v = roundPourSensitivity(Number(pourIn.value));
    pourOut.textContent = pourSensitivityLabel(v);
    cb.listen.set({ ...cb.listen.get(), pourSensitivity: v });
  };

  let toastTimer = 0;
  let lastToast = '';
  const showToast = (msg: string): void => {
    toast.textContent = msg;
    toast.classList.remove('gone');
    clearTimeout(toastTimer);
    // Cosmetic timer only (AGENTS.md §4.3).
    toastTimer = window.setTimeout(() => toast.classList.add('gone'), 5000);
  };
  toast.onclick = () => {
    audio.unlock();
    toast.classList.add('gone');
  };

  const sync = (): void => {
    const dot = DOT[audio.status];
    statusDot.className = `dot ${dot}`;
    statusText.textContent = audio.message;
    voiceOn.checked = audio.voiceEnabled;
    sliders.forEach((s) => {
      const b = s.dataset.bus as Bus;
      const v = Math.round(audio.volume(b) * 100);
      if (Number(s.value) !== v) s.value = String(v);
      const out = panel.querySelector(`[data-out="${b}"]`) as HTMLElement;
      out.textContent = `${v}%`;
    });
    root.querySelectorAll<HTMLElement>('[data-audio-btn] .dot').forEach((d) => {
      d.className = `dot ${dot}`;
    });
    root.querySelectorAll<HTMLElement>('[data-audio-btn]').forEach((b) => {
      b.title = audio.message;
    });
    if ((dot === 'warn' || dot === 'bad') && audio.message !== lastToast) {
      lastToast = audio.message;
      showToast(audio.message);
    }
  };
  audio.onChange(sync);

  sliders.forEach((s) => {
    s.oninput = () => audio.setVolume(s.dataset.bus as Bus, Number(s.value) / 100);
  });
  voiceOn.onchange = () => {
    audio.voiceEnabled = voiceOn.checked;
  };
  panel.querySelectorAll<HTMLButtonElement>('button[data-a]').forEach((b) => {
    b.onclick = () => {
      audio.unlock();
      if (b.dataset.a === 'test') cb.test();
      else if (b.dataset.a === 'replay') cb.replay();
      else p.close();
    };
  });
  panel.onclick = (e) => {
    if (e.target === panel) p.close();
  };
  // A dialog: Esc closes it, Tab stays inside, and keys pressed in it never reach the game.
  menuKeys(panel, { modal: true, escape: () => p.close() });
  /** What had focus when the panel opened (the title's Settings, or a HUD's Sound button). */
  let opener: Element | null = null;

  const p: AudioPanel = {
    buttonsHtml:
      '<button class="iconbtn" data-replay-btn aria-label="Replay the last line" title="Replay the last line (R)">↻ Replay</button>' +
      '<button class="iconbtn" data-audio-btn aria-label="Sound settings"><i class="dot idle"></i>Sound</button>',
    bind(el) {
      el.querySelectorAll<HTMLButtonElement>('[data-replay-btn]').forEach((b) => {
        b.onclick = () => {
          audio.unlock();
          cb.replay();
        };
      });
      el.querySelectorAll<HTMLButtonElement>('[data-audio-btn]').forEach((b) => {
        b.onclick = () => {
          audio.unlock();
          p.open();
        };
      });
      sync();
    },
    open() {
      sync();
      syncListen();
      log?.sync();
      if (panel.classList.contains('hide')) opener = document.activeElement;
      panel.classList.remove('hide');
      panel.scrollTop = 0;
      (panel.querySelector('button[data-a="close"]') as HTMLElement).focus({
        preventScroll: true,
      });
    },
    close() {
      if (panel.classList.contains('hide')) return;
      panel.classList.add('hide');
      // Back to the title's Settings button. In a shift, focus is let go instead: a focused Sound
      // button would turn the player's next Enter into "open settings" rather than the game's.
      if (
        opener instanceof HTMLElement &&
        opener.closest('#title') &&
        opener.getClientRects().length
      )
        focusQuietly(opener);
      else if (
        document.activeElement instanceof HTMLElement &&
        panel.contains(document.activeElement)
      )
        document.activeElement.blur();
      opener = null;
    },
  };
  sync();
  return p;
}
