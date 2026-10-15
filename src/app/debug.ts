// The read-only debug handle (window.__trial) for e2e tests and the console. Every value is a
// getter, read when asked, never a copy taken at boot.

import * as THREE from 'three';
import { RIM, GROUP_SPOUT } from '../world/station';
import type { App } from './context';

export function createDebugHandle(app: App) {
  const { seed, station, camera, audio, music, ibisView, store, crowd, renderer, clock, trial } =
    app;
  // ---------------------------------------------------------------- debug handle (e2e + console)
  const projV = new THREE.Vector3();
  return {
    seed,
    /** Test hook: run game time slower (precise input at ~20 fps software GL) or up to 4×
     *  faster (waiting out timers). Each frame still advances at most 0.1 s of game time. */
    get timeScale() {
      return app.timeScale;
    },
    set timeScale(v: number) {
      app.timeScale = Math.min(4, Math.max(0.05, v));
    },
    /** Screen position (CSS px) the pointer must be at to aim the jug at cup-rim coords (cx, cy). */
    project(cx: number, cy: number): { x: number; y: number } {
      projV
        .set(station.cupRim.x + cx * RIM, station.cupRim.y, station.cupRim.z - cy * RIM)
        .project(camera);
      return {
        x: ((projV.x + 1) / 2) * window.innerWidth,
        y: ((1 - projV.y) / 2) * window.innerHeight,
      };
    },
    /** Screen position (CSS px, plus whether it's inside the view) of the group head's spout or
     *  the milk jug's spout tip. */
    projectAnchor(which: 'groupHead' | 'jug'): { x: number; y: number; inView: boolean } {
      projV.copy(which === 'groupHead' ? GROUP_SPOUT : station.jugTip).project(camera);
      return {
        x: ((projV.x + 1) / 2) * window.innerWidth,
        y: ((1 - projV.y) / 2) * window.innerHeight,
        inView: Math.abs(projV.x) <= 1 && Math.abs(projV.y) <= 1 && projV.z < 1,
      };
    },
    get mode() {
      return app.mode;
    },
    get phase() {
      return trial.phase;
    },
    /** Audio evidence for tests: what played, how long the decoded buffer was, peak loudness. */
    get audio() {
      return {
        status: audio.status,
        message: audio.message,
        contextState: audio.context?.state ?? 'none',
        currentTime: audio.context?.currentTime ?? 0,
        voiceEnabled: audio.voiceEnabled,
        speaking: audio.speaking,
        clipCount: audio.clipCount,
        history: audio.history.map((h) => ({ ...h })),
        voices: audio.voices,
        output: audio.outputInfo,
        music: { mood: music.mood, duck: audio.musicDuck, scheduled: music.scheduled },
        masterRms: audio.masterRms(),
      };
    },
    /** The bin chicken, with where it is on screen (CSS px) for tests that click it. */
    get ibis() {
      projV.copy(ibisView.position).setY(0.5).project(camera);
      return {
        state: app.ibis.state,
        scheduledAt: app.ibis.scheduledAt,
        shoos: app.ibis.shoos,
        binRaided: app.ibis.binRaided,
        screen: {
          x: ((projV.x + 1) / 2) * window.innerWidth,
          y: ((1 - projV.y) / 2) * window.innerHeight,
        },
      };
    },
    /** Cheap per-frame snapshot for audio/subtitle sync tests (Day 1 or Day 2). */
    get audioTick() {
      const last = audio.history[audio.history.length - 1];
      const line = app.mode === 'rush' ? (app.rush?.speech.current ?? null) : trial.speech.current;
      const c = app.rush?.customers.find((x) => x.state === 'ordering' || x.state === 'deciding');
      return {
        t: audio.context?.currentTime ?? 0,
        sim: app.mode === 'rush' ? (app.rush?.time ?? 0) : trial.time,
        clip: last ? { text: last.text, endedAt: last.endedAt, via: last.via } : null,
        playing: audio.clipPlaying,
        line: line ? line.text : null,
        subs:
          (
            document.querySelector(
              app.mode === 'rush' ? '#rsubs .text' : '#subs .text',
            ) as HTMLElement | null
          )?.textContent ?? '',
        counter: c ? { id: c.def.id, state: c.state } : null,
        live: audio.voices.live - audio.voices.fading,
      };
    },
    /** The week's save as stored (shift, menu, receipts, tips). */
    get save() {
      return { ...store.load(), memoryOnly: store.memoryOnly };
    },
    /** Day 2 state for tests (null on Day 1). */
    get rush() {
      const r = app.rush;
      if (!r) return null;
      const b = r.barista;
      return {
        phase: r.phase,
        serviceTime: r.serviceTime,
        station: b.phase,
        stationTime: b.phaseTime,
        drink: b.drink,
        dose: b.espresso.dose,
        shotTime: b.espresso.shotTime,
        extracting: b.espresso.extracting,
        shotDone: b.espresso.done,
        temp: b.steam.temp,
        aeration: b.steam.aeration,
        steamDone: b.steam.done,
        water: b.water,
        ready: b.ready
          ? { type: b.ready.type, temp: b.ready.temp, milkType: b.ready.milkType }
          : null,
        fill: b.pour.fill,
        controls: { ...b.controls },
        customers: r.customers.map((c) => ({
          id: c.def.id,
          state: c.state,
          patience: c.patience,
          max: c.maxPatience,
          key: c.key,
          arriveAt: c.arriveAt,
          ticket: c.ticket,
          outcome: c.outcome,
          rejected: c.rejected,
          satisfaction: c.result?.satisfaction ?? null,
          lineId: c.line.id,
          segments: c.line.voice?.kind === 'segments' ? c.line.voice.ids.length : 0,
          order: { ...c.order },
          heard: c.heard ? { ...c.heard } : null,
          listen: { ...c.listen, clarified: [...c.listen.clarified] },
        })),
        difficulty: r.difficulty,
        week: r.week
          ? {
              week: r.week.week ?? 1,
              shiftIndex: r.week.shiftIndex,
              endless: r.week.endless === true,
            }
          : null,
        event: r.shiftEvents.current
          ? {
              id: r.shiftEvents.current.def.id,
              customer: r.shiftEvents.current.customer?.def.id ?? null,
              choices: r.shiftEvents.current.def.choices.map((c) => c.id),
            }
          : null,
        eventsFired: r.shiftEvents.log.fired.map((f) => f.id),
        listening: r.listening.map((x) => ({ ...x, wrong: [...x.wrong] })),
        records: r.records.map((x) => ({ ...x })),
        summary: r.summary,
        line: r.speech.current
          ? {
              speaker: r.speech.current.speaker,
              key: r.speech.current.key,
              text: r.speech.current.text,
              delivery: r.speech.current.delivery ?? 'normal',
            }
          : null,
        crowd: crowd.count,
        drawCalls: renderer.info.render.calls,
        paused: clock.paused,
      };
    },
    /** Practice state for tests (null outside practice). */
    get practice() {
      const p = app.practice;
      if (!p) return null;
      return {
        phase: p.phase,
        phaseTime: p.phaseTime,
        count: p.count,
        best: p.best,
        guide: p.guide,
        fill: p.pour.fill,
        poured: p.pour.poured,
        spill: p.pour.spill,
        armed: p.gate.armed,
        step: p.log.step,
        controls: { ...p.controls },
        pitcher: { ...p.pitcher },
        demoActive: p.demoActive,
        demoRate: p.demo.rate,
        line: p.speech.current?.text ?? null,
        attempts: p.attempts.map((a) => ({
          n: a.n,
          art: a.score.art,
          shape: a.score.shape,
          symmetry: a.score.symmetry,
          position: a.score.position,
          findings: a.findings.map((f) => f.id),
        })),
        paused: clock.paused,
        drawCalls: renderer.info.render.calls,
      };
    },
    /** Cheap per-tick read for test drivers. */
    get tick() {
      return {
        phase: trial.phase,
        phaseTime: trial.phaseTime,
        line: trial.speech.current?.text ?? null,
      };
    },
    get state() {
      return {
        phase: trial.phase,
        attempt: trial.attempt,
        dose: trial.espresso.dose,
        shotTime: trial.espresso.shotTime,
        temp: trial.steam.temp,
        aeration: trial.steam.aeration,
        fill: trial.pour.fill,
        spill: trial.pour.spill,
        poured: trial.pour.poured,
        pitcher: { ...trial.pitcher },
        controls: { ...trial.controls },
        phaseTime: trial.phaseTime,
        demoActive: trial.demoActive,
        results: trial.results.map((r) => ({
          total: r.total,
          valid: r.valid,
          band: r.band,
          faults: r.faults,
          art: r.pattern.art,
        })),
        outcome: trial.outcome,
        line: trial.speech.current?.text ?? null,
        paused: clock.paused,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
      };
    },
  };
}

/** Put the handle on window.__trial: dev builds, or any build with ?debug. */
export function installDebugHandle(app: App): void {
  const debug = createDebugHandle(app);
  if (import.meta.env.DEV || app.params.has('debug'))
    (window as unknown as { __trial: typeof debug }).__trial = debug;
}
