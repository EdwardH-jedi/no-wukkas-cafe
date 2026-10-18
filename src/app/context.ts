// The app's shared state: what boot() used to keep in one closure, now one object that boot.ts
// creates and passes explicitly to every wiring module. Wiring modules never import boot.ts or a
// sibling's navigation; they reach it through `nav`, bound late in boot.ts.

import type * as THREE from 'three';
import type { AudioManager } from '../audio/manager';
import type { Music } from '../audio/music';
import type { Sfx } from '../audio/sfx';
import type { Clock } from '../core/clock';
import type { Practice, PracticeAction } from '../core/practice';
import type { Rush, RushAction, RushWeek } from '../core/rush';
import type { ScoresStore } from '../core/save/scores';
import type { SaveStore } from '../core/save/storage';
import type { Trial, TrialInput } from '../core/trial';
import type { Cooldowns } from '../core/week/session';
import type { ShiftEventId } from '../sim/contracts/events';
import type { Ibis } from '../sim/ibis';
import type { ScoreNote } from '../sim/scores';
import type { AudioPanel } from '../ui/audioPanel';
import type { Hud } from '../ui/hud';
import type { PracticeHud } from '../ui/practiceHud';
import type { RushHud } from '../ui/rushHud';
import type { ListenSettings } from '../ui/settings';
import type { CameraFocus, CameraRig } from '../world/camera';
import type { Crowd } from '../world/crowd';
import type { IbisView } from '../world/ibis';
import type { OwnerView } from '../world/owner';
import type { Station } from '../world/station';
import type { Telemetry } from './telemetry';

/** Which day is running. Day 1's trial owns the title screen; practice is latte art on its own. */
export type Mode = 'trial' | 'rush' | 'practice';

/** Moving between days and screens. Bound in boot.ts; call them, never capture them early. */
export interface Nav {
  /** Back to the title screen (fresh Day 1 trial). */
  toTitle(): void;
  /** Start a rush: Day 2 (no week), a week shift or Endless. Called inside a click (iOS audio). */
  startRush(week: RushWeek | null, rushSeed: number): void;
  /** Start the morning rush (from the title or the trial verdict). */
  startDay2(): void;
  /** The shift the week is on. */
  startShift(): void;
  startEndless(): void;
  /** The week's shifts and Endless Rush, over the title screen. */
  openShifts(): void;
  /** Latte-art practice (from the title screen). */
  startPractice(): void;
}

export interface App {
  readonly params: URLSearchParams;
  readonly seed: number;

  // World (three.js) and the page.
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly rig: CameraRig;
  readonly station: Station;
  readonly owner: OwnerView;
  readonly crowd: Crowd;
  readonly ibisView: IbisView;
  /** Where Gaz looks this frame (reused, never reallocated). */
  readonly look: THREE.Vector3;
  readonly focus: CameraFocus;

  // The days.
  readonly trial: Trial;
  readonly clock: Clock;
  mode: Mode;
  practice: Practice | null;
  practiceAction: PracticeAction | null;
  rush: Rush | null;
  rushAction: RushAction | null;
  ibis: Ibis;
  ibisShoo: boolean;
  ibisNoticed: boolean;

  // The week's save and the listening settings.
  listen: ListenSettings;
  readonly store: SaveStore;
  /** Shift-event cooldowns and the last event, kept while the page is open (not saved: Edward,
   *  2026-10-15). */
  cooldowns: Cooldowns;
  lastEvent: ShiftEventId | null;
  /** The playtest log (local only): records open and close with shifts and the trial. */
  readonly telemetry: Telemetry;
  /** The local leaderboard (its own storage key, outside the save). */
  readonly scores: ScoresStore;
  /** The shift that just reached its report, on its board (app/scores.ts); null before then. */
  scoreNote: ScoreNote | null;

  // Audio.
  readonly audio: AudioManager;
  readonly sfx: Sfx;
  readonly music: Music;

  // Input.
  readonly input: TrialInput;
  held: boolean; // mouse/touch
  spaceHeld: boolean;
  keyHeight: number;
  touchHeight: number;
  readonly pointer: { x: number; y: number; has: boolean };

  // View clock.
  /** Test hook (window.__trial.timeScale): game time runs at 0.05–4×. */
  timeScale: number;
  viewTime: number;
  /** Loudness of the line being spoken (0..1), for mouths. */
  voiceLevel: number;

  // DOM roots.
  readonly uiRoot: HTMLElement;
  readonly ibisHint: HTMLElement;
  readonly hud1Root: HTMLElement;
  readonly hud2Root: HTMLElement;
  readonly hud3Root: HTMLElement;

  // The HUDs. Their callbacks read the app, so boot.ts assigns them right after creating it.
  audioPanel: AudioPanel;
  hud: Hud;
  rushHud: RushHud;
  practiceHud: PracticeHud;

  readonly nav: Nav;
  setPaused(p: boolean): void;
  /** Unpause everything together: game clock, menus and audio. */
  resumeAll(): void;
  /** Say the last line again, with its subtitle. */
  replay(): void;
}

/** Fields boot.ts fills in after the app exists (see App). */
export type LateFields = 'audioPanel' | 'hud' | 'rushHud' | 'practiceHud';
