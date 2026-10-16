// Gaz's lines for shift events (sim/events/defs.ts), keyed `event.<event>.<case>`, three variants
// each so the no-repeat pools and cooldowns in sim/owner.ts keep them fresh. Same rules as
// data/ownerLines.ts: the jokes are about the coffee, never about who the customer is, and Gaz
// backs his staff. In the voice script with every other Gaz line (data/voice/script.ts).

import type { LineBook, LinePool } from '../../sim/owner';

const pool = (...lines: string[]): LinePool => ({
  tiers: [lines.map((text) => ({ text }))],
  cooldown: 20,
});

export const GAZ_EVENT_LINES: LineBook = {
  'event.justCoffee.asked': pool(
    "Good. 'A coffee' could mean anything in this town.",
    "Always ask. 'A coffee' isn't an order, it's a mood.",
    'Smart. Nobody wants a surprise long black.',
  ),
  'event.justCoffee.lucky': pool(
    "Flat white for 'a coffee'? Lucky guess. Don't make a habit of it.",
    'Guessed right. The coffee gods smile on you today.',
    'Got away with that one. Ask next time.',
  ),
  'event.justCoffee.wrong': pool(
    "That's what happens when you guess. Ask, mate.",
    "Wrong guess, and that one's going in the bin.",
    "'A coffee' wasn't a flat white, then. Ask first.",
  ),
  'event.theUsual.remembered': pool(
    "Look at you, knowing the regulars. That's how you keep them.",
    "Remembered the usual. That's worth more than any heart on top.",
    'Regulars notice that. Nice work.',
  ),
  'event.theUsual.asked': pool(
    'No shame in asking. Better than guessing their usual.',
    "Ask once, remember forever. That's the deal.",
    'Write it down this time, eh?',
  ),
  'event.theUsual.forgot': pool(
    "You don't know their usual yet. Just ask.",
    "Can't remember an order you've never made. Ask them.",
    "You've not served them enough to know. Ask what it is.",
  ),
  'event.changeMind.remade': pool(
    'Changed their mind. Happens. Remake it and move on.',
    'Fair enough. Bin it and go again.',
    "Customer's allowed to change their mind. Quick remake.",
  ),
  'event.changeMind.busy': pool(
    'Remake it, but keep that queue moving.',
    "Righto, remake, and don't let the line stall.",
    'Changed their mind in a rush. Quick as you can.',
  ),
  'event.changeMind.kept': pool(
    'Already made? Fair call, but say it nicely.',
    "Can't remake everything. You handled it.",
    'Fine, but a smile goes a long way when you say no.',
  ),
  'event.queueJump.sentBack': pool(
    "Good. There's a line for a reason.",
    "Fair's fair. Back of the queue.",
    "Polite and firm. That's the way.",
  ),
  'event.queueJump.letThrough': pool(
    'Let them through? Hope nobody noticed.',
    'Bit soft, but it kept the peace.',
    'Righto, just this once.',
  ),
  'event.queueJump.queueGrumbles': pool(
    "The whole line saw that. They're not happy.",
    'Let one through and the queue revolts. Careful.',
    'That queue is glaring at you now.',
  ),
  'event.wrongMilk.ourBad': pool(
    "That one's on us. Remake it and say sorry.",
    'Wrong milk is our mistake. Fix it, no fuss.',
    "Own it, remake it. That's all they want.",
  ),
  'event.wrongMilk.argued': pool(
    "We got it wrong and you argued? Don't do that.",
    "Never argue when the mistake's ours. Remake it.",
    "That's how you lose a regular. Just fix it.",
  ),
  'event.wrongMilk.goodwill': pool(
    'It was right, but a remake keeps the peace. Good call.',
    'Made it right the first time and remade it anyway. Classy.',
    "Not our mistake, but that's goodwill. Fair enough.",
  ),
  'event.wrongMilk.ticket': pool(
    "Ticket says what they ordered. You're in the clear.",
    "You made what they asked for. I'll back you on that.",
    "Calm and clear. That's how you handle it.",
  ),
  'event.callManager.backsYou': pool(
    "I'm the manager. My barista made it right. Anything else?",
    "You want the manager? You've got him. They did their job.",
    "I'll take it from here. You keep the line moving.",
  ),
  'event.callManager.smoothed': pool(
    "Nicely handled. I didn't even have to come over.",
    "That's how you calm someone down. Good.",
    'You sorted that better than I would have.',
  ),
  'event.callManager.showsOut': pool(
    'Nobody talks to my staff like that. Out.',
    "That's enough. You're done here.",
    "We don't serve people who treat staff like that.",
  ),
  'event.theName.asked': pool(
    'Good. Ask them to spell it. People care about their name.',
    'Spelling it right takes two seconds. Worth it.',
    "That's the way. Ask, don't guess.",
  ),
  'event.theName.gotIt': pool(
    'Spelt it right first go. Nice ear.',
    "Got the name right. They'll remember that.",
    "Good listening. Name's right on the cup.",
  ),
  'event.theName.misspelt': pool(
    "Name's wrong on the cup. Next time, ask them to spell it.",
    "That's not how they spell it. Ask next time.",
    "Getting someone's name right matters. Ask.",
  ),
  'event.rareBird.shooed': pool(
    "Bin chicken's out. Back to the coffee.",
    "Gently does it. Good, it's gone.",
    'Out it goes. Wash your hands.',
  ),
  'event.rareBird.busy': pool(
    "Shoo it, but the queue's waiting.",
    'Bird first, then the line. Quick.',
    "Righto, bird's out. Now those customers.",
  ),
  'event.rareBird.ignored': pool(
    'You left the bin chicken to it. Look at that bin.',
    "Ignored the ibis? Now we've got rubbish everywhere.",
    "That's a bin raid. Clean it up later.",
  ),
};
