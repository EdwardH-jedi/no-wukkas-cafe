// Day 2, the per-frame view: the rush's events into the HUD, audio, crowd and Gaz, then the station,
// camera and sounds. Split out of rushWiring.ts with no behaviour change.

import { customerByKey, type Rush } from '../core/rush';
import { ibisPresent } from '../sim/ibis';
import { surfacing } from '../sim/latte/field';
import { pitcherFlow } from '../sim/latte/pitcher';
import type { StationView } from '../world/station';
import type { App } from './context';
import { makeIbis } from './shared';
import { onShiftSummary } from './weekWiring';

/** The rush's events and view for one frame. */
export function createRushFrame(app: App): (r: Rush, dt: number) => void {
  const { trial, station, owner, crowd, ibisView, camera, rig, audio, sfx, canvas } = app;
  const sv: StationView = {
    phase: 'idle',
    phaseTime: 0,
    attempt: 0,
    espresso: trial.espresso,
    steam: trial.steam,
    pour: trial.pour,
    pitcher: trial.pitcher,
    demoActive: false,
    demoEndedAt: -1,
    drink: null,
    water: 0,
    dispensing: false,
  };
  const ownerScene = {
    phase: 'service',
    speech: { current: null as unknown },
    owner: { frustration: 0 },
  };
  const WORKING = new Set(['grind', 'lock', 'shot', 'shotSteam', 'water', 'steam', 'pour']);
  const { look, focus, pointer } = app;

  return function rushFrame(r: Rush, dt: number): void {
    const { rushHud, viewTime, voiceLevel } = app;
    for (const ev of r.events) {
      if (ev.type === 'say') {
        const u = ev.line;
        rushHud.onSay(u);
        if (u.speaker === 'gaz') owner.onSay(u, viewTime);
        audio.say({
          speaker: u.speaker,
          text: u.text,
          delivery: u.delivery ?? 'normal',
          listen: u.listen === true,
          ...(u.voice?.kind === 'segments' ? { segments: u.voice.ids } : {}),
        });
      } else if (ev.type === 'phase') {
        rushHud.onPhase(ev.phase, r);
        if (ev.phase === 'intro') {
          crowd.clear();
          app.ibis = makeIbis(app); // a restarted shift gets its bird (or not) afresh
          canvas.classList.remove('aim'); // a restart mid-pour must give the cursor back
        }
      } else if (ev.type === 'station') canvas.classList.toggle('aim', ev.phase === 'pour');
      else if (ev.type === 'sfx') sfx.play(ev.id);
      else if (ev.type === 'ticket') {
        sfx.play('tick');
        const c = customerByKey(r, ev.customer);
        if (c) rushHud.onTicket(c);
      } else if (ev.type === 'ticketFixed') {
        const c = customerByKey(r, ev.customer);
        if (c) rushHud.onTicketFixed(c);
      } else if (ev.type === 'ask') rushHud.onAsk(ev.text);
      else if (ev.type === 'served')
        crowd.react(
          ev.customer,
          ev.result.satisfaction >= 75 ? 'cheer' : ev.result.satisfaction >= 45 ? 'nod' : 'huff',
        );
      else if (ev.type === 'rejected') crowd.react(ev.customer, 'shake');
      else if (ev.type === 'walkout' || ev.type === 'refused') crowd.react(ev.customer, 'huff');
      else if (ev.type === 'gone') {
        // A line of theirs whose clip lands (or fails over to the browser voice) after they've
        // left never starts in an empty doorway.
        const c = customerByKey(r, ev.customer);
        if (c) audio.stopSpeaker(c.def.id);
      } else if (ev.type === 'summary') onShiftSummary(app, r, ev);
    }
    r.events.length = 0;

    const b = r.barista;
    // Two hands (shot running + steaming) has its own view: the shot and the jug side by side.
    const shown = b.phase;
    sv.phase = r.phase === 'service' ? shown : 'idle';
    sv.phaseTime = b.phaseTime;
    sv.espresso = b.espresso;
    sv.steam = b.steam;
    sv.pour = b.pour;
    sv.pitcher = b.pitcher;
    sv.drink = b.drink;
    sv.water = b.water;
    sv.dispensing = b.dispensing;
    station.update(sv, dt, viewTime);
    const customerTalking = r.speech.current !== null && r.speech.current.speaker !== 'gaz';
    ibisView.update(app.ibis, dt, viewTime);
    app.ibisHint.classList.toggle(
      'hide',
      !(r.phase === 'service' && ibisPresent(app.ibis) && app.ibis.state !== 'leaving'),
    );
    crowd.update(
      r,
      dt,
      viewTime,
      camera.position,
      customerTalking && audio.clipPlaying ? voiceLevel : -1,
    );

    const working = r.phase === 'service' && WORKING.has(b.phase);
    const gazTalking = r.speech.current?.speaker === 'gaz';
    ownerScene.phase =
      r.phase === 'service'
        ? b.phase === 'pour'
          ? 'pour'
          : 'service'
        : r.phase === 'wrapup'
          ? 'summary'
          : r.phase;
    ownerScene.speech.current = gazTalking ? r.speech.current : null;
    ownerScene.owner = r.owner;
    // Gaz watches whoever is ordering, the cup while you work, and you when he talks; when he's
    // talking about the bin chicken, he looks at it.
    if (gazTalking && r.speech.current?.key.startsWith('ibis.') && ibisPresent(app.ibis))
      look.copy(ibisView.position).setY(0.5);
    else if (!gazTalking && crowd.registerPos(look)) {
      /* looking at the customer at the register */
    } else if (working && !gazTalking) look.copy(station.cupRim);
    else look.copy(camera.position);
    owner.update(ownerScene, dt, viewTime, look, gazTalking && audio.clipPlaying ? voiceLevel : -1);

    const camPhase =
      r.phase === 'intro'
        ? 'intro'
        : r.phase === 'service'
          ? working
            ? shown
            : 'service'
          : 'summary';
    const px = pointer.has ? (pointer.x / window.innerWidth) * 2 - 1 : 0;
    const py = pointer.has ? (pointer.y / window.innerHeight) * 2 - 1 : 0;
    rig.update(camPhase, b.phaseTime, dt, viewTime, focus, px, py, !working);
    rushHud.update(r, dt);

    sfx.update({
      grind: b.phase === 'grind' && b.espresso.grinding ? 1 : 0,
      pump: (b.phase === 'shot' || b.phase === 'shotSteam') && b.espresso.extracting ? 1 : 0,
      steam: (shown === 'steam' || shown === 'shotSteam') && b.steam.valveOpen ? 1 : 0,
      steamZone: shown === 'steam' || shown === 'shotSteam' ? b.steam.zone : 'off',
      pour:
        b.phase === 'pour' ? pitcherFlow(b.pitcher) : b.phase === 'water' && b.dispensing ? 0.7 : 0,
      pourHigh: b.phase === 'water' ? 0.8 : 1 - surfacing(b.pitcher.height),
    });
  };
}
