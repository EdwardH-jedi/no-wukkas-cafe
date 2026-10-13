// Sound settings: per-bus volume, voice on/off, a test line, replay, and a visible status so a
// silent voice is never a mystery; plus the listening settings (difficulty, order subtitles,
// learning mode). Also owns the toast that pops up when audio fails.

import type { AudioManager, AudioStatus, Bus } from '../audio/manager';
import type { Difficulty } from '../sim/listening';
import type { ListenSettings } from './settings';

export interface AudioPanelCallbacks {
  replay(): void;
  test(): void;
  listen: { get(): ListenSettings; set(s: ListenSettings): void };
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
  panel.setAttribute('aria-label', 'Sound settings');
  panel.innerHTML = `<div class="box">
    <h3>Sound</h3>
    <p class="astatus"><i class="dot"></i><span></span></p>
    ${(['voice', 'music', 'ambience', 'sfx'] as const)
      .map(
        (b) =>
          `<label class="slider"><span>${BUS_LABEL[b]}</span><input type="range" min="0" max="100" step="5" data-bus="${b}" aria-label="${BUS_LABEL[b]} volume"><output data-out="${b}"></output></label>`,
      )
      .join('')}
    <label class="chk"><input type="checkbox" data-voice-on> Voices on</label>
    <h4>Listening (Day 2)</h4>
    <label class="sel"><span>Difficulty</span><select data-l="difficulty">
      <option value="easy">Easy: clear orders, quiet café</option>
      <option value="normal">Normal</option>
      <option value="hard">Hard: fast, slangy, noisy</option></select></label>
    <label class="sel"><span>Order subtitles</span><select data-l="subtitles">
      <option value="auto">Auto (by difficulty)</option>
      <option value="always">Always</option>
      <option value="afterRepeat">Only after “repeat that?”</option>
      <option value="off">Off</option></select></label>
    <label class="chk"><input type="checkbox" data-l="learning"> Learning mode: show what they said once you ring it up</label>
    <p class="fine">Difficulty changes start with the next shift.</p>
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
  const subSel = panel.querySelector('[data-l="subtitles"]') as HTMLSelectElement;
  const learnChk = panel.querySelector('[data-l="learning"]') as HTMLInputElement;
  const syncListen = (): void => {
    const l = cb.listen.get();
    diffSel.value = l.difficulty;
    subSel.value = l.subtitles;
    learnChk.checked = l.learning;
  };
  const setListen = (): void =>
    cb.listen.set({
      difficulty: diffSel.value as Difficulty,
      subtitles: subSel.value as ListenSettings['subtitles'],
      learning: learnChk.checked,
    });
  diffSel.onchange = subSel.onchange = learnChk.onchange = setListen;

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
      panel.classList.remove('hide');
      (panel.querySelector('button[data-a="close"]') as HTMLElement).focus();
    },
    close() {
      panel.classList.add('hide');
    },
  };
  sync();
  return p;
}
