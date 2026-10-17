// What the audio says about itself (split out of audio/manager.ts): its status and message for the
// sound panel, the listeners told of every change, and the record of recent lines (tests and the
// debug handle read it).

import type { AudioStatus, PlayRecord } from './types';

export interface StatusBoard {
  readonly status: AudioStatus;
  readonly message: string;
  set(s: AudioStatus, m: string): void;
  onChange(cb: () => void): void;
  /** Tell the listeners (volumes and switches change without a status change). */
  emit(): void;
  /** The last 40 lines. */
  readonly history: PlayRecord[];
  /** The latest line's record. */
  readonly current: PlayRecord | null;
  record(r: PlayRecord): void;
}

export function createStatusBoard(): StatusBoard {
  let status: AudioStatus = 'locked';
  let message = 'Click Start to turn on sound.';
  const listeners: Array<() => void> = [];
  const history: PlayRecord[] = [];
  let current: PlayRecord | null = null;
  const emit = (): void => {
    for (const l of listeners) l();
  };
  return {
    get status() {
      return status;
    },
    get message() {
      return message;
    },
    set(s, m) {
      if (s === status && m === message) return;
      status = s;
      message = m;
      emit();
    },
    onChange(cb) {
      listeners.push(cb);
    },
    emit,
    history,
    get current() {
      return current;
    },
    record(r) {
      history.push(r);
      if (history.length > 40) history.shift();
      current = r;
    },
  };
}
