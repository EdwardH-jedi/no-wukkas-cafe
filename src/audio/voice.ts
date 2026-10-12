// Voice lines. Today: the browser's speech synthesis with an Australian voice when one exists
// (often it doesn't: falls back to en-GB, then any English). Kept behind `speak(line, speaker)`
// so Phase 2 can swap in pre-rendered clips without touching sim or UI.

/** 'gaz' or a customer id. */
export type Speaker = string;

export interface VoiceStyle {
  pitch: number;
  rate: number;
  female?: boolean;
}

export interface Voice {
  enabled: boolean;
  unlock(): void;
  speak(line: string, speaker: Speaker, style?: VoiceStyle): void;
  stop(): void;
  pause(): void;
  resume(): void;
}

const MALE =
  /lee|gordon|\bmale\b|daniel|james|william|david|mark|george|ryan|arthur|oliver|aaron|fred|alex|tom|russell/i;
const FEMALE =
  /karen|catherine|female|zira|samantha|serena|sonia|natasha|hazel|susan|libby|moira|tessa|fiona|victoria|nicky|yuna|kate/i;

export function createVoice(): Voice {
  const synth: SpeechSynthesis | null =
    typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
  let voices: SpeechSynthesisVoice[] = [];
  const load = (): void => {
    try {
      voices = synth?.getVoices() ?? [];
    } catch {
      voices = [];
    }
  };
  load();
  if (synth) synth.onvoiceschanged = load;

  const pick = (female = false): SpeechSynthesisVoice | null => {
    const byLang = (l: string): SpeechSynthesisVoice[] =>
      voices.filter((v) => (v.lang || '').replace('_', '-').toLowerCase().startsWith(l));
    for (const l of ['en-au', 'en-gb', 'en']) {
      const pool = byLang(l);
      if (pool.length)
        return pool.find((v) => (female ? FEMALE : MALE).test(v.name)) ?? pool[0] ?? null;
    }
    return null;
  };

  const v: Voice = {
    enabled: true,
    unlock() {
      // iOS only lets speech start from a user gesture: say nothing, quietly, right now.
      if (!synth) return;
      try {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        synth.speak(u);
      } catch {
        /* optional */
      }
    },
    speak(line, speaker, style) {
      if (!synth || !v.enabled) return;
      void speaker;
      try {
        synth.cancel();
        const u = new SpeechSynthesisUtterance(
          line.replace(/tss-tss/gi, 'tss, tss').replace(/[—–]/g, ', '),
        );
        const voice = pick(style?.female === true);
        if (voice) {
          u.voice = voice;
          u.lang = voice.lang;
        } else u.lang = 'en-AU';
        u.pitch = style?.pitch ?? 0.82;
        u.rate = style?.rate ?? 1.06;
        synth.speak(u);
      } catch {
        /* speech is a nice-to-have; subtitles carry the line */
      }
    },
    stop() {
      try {
        synth?.cancel();
      } catch {
        /* ignore */
      }
    },
    pause() {
      try {
        synth?.pause();
      } catch {
        /* ignore */
      }
    },
    resume() {
      try {
        synth?.resume();
      } catch {
        /* ignore */
      }
    },
  };
  return v;
}
