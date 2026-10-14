// Everything Gaz says. Keyed by gameplay event; `tiers` = [calm-sarcastic, annoyed, fed up].
// Rules (AGENTS.md §6): the jokes are about the coffee, never about who the player is.
// Australian English and spelling. Slang used: mate, champ, bloody, reckon, righto, rack off,
// servo, flattie, stuff it up, slower than a wet week, have a crack, pokie machine, no wukkas.
// TODO(slang-check): "flat as a tack" means low on energy; it's used as a pun on flat (unstretched)
// milk in 'steam.flat'. Edward to confirm it reads naturally.

import type { LineBook, LineDef } from '../sim/owner';

/** Opening sequence. Variants for the first line keep restarts from feeling canned. */
export const GREETING_OPENERS: readonly LineDef[] = [
  { text: "Oi. You the trial? You're late. Well, you're not, but I like saying it.", mood: 'smug' },
  {
    text: "G'day. You must be the trial. Coffee hasn't kicked in yet, so let's keep this quick.",
    mood: 'sceptical',
  },
  {
    text: "Right, you're the new one. Doors open at seven, so you've got till then to impress me.",
    mood: 'sceptical',
    gesture: 'tapWatch',
  },
];

export const GREETING: readonly LineDef[] = [
  {
    text: "I'm Gaz. My café, my machine. Treat her better than you treat yourself.",
    mood: 'neutral',
    gesture: 'point',
  },
  {
    text: 'Job is one flat white with a heart on top. Three goes. Impress me, or rack off.',
    mood: 'smug',
  },
];

/** Day 2 opening, said in order. */
export const RUSH_INTRO: readonly LineDef[] = [
  { text: "Righto, you're on the books. Welcome to your first paid shift.", mood: 'smug' },
  {
    text: "Seven o'clock rush. Tradies, nurses, Nan Beryl, the lot. Keep the line moving.",
    mood: 'neutral',
    gesture: 'point',
  },
  {
    text: 'Listen to the order and ring it up right. Flat whites, long blacks, oat, soy, almond. Then make it and hand it to the right person. Easy.',
    mood: 'sceptical',
  },
];

export const OWNER_LINES: LineBook = {
  'grind.intro': {
    tiers: [
      [
        {
          text: 'Grinder first. Hold it down. Eighteen to twenty grams. Not a bucket.',
          gesture: 'point',
        },
        {
          text: 'Hold the grinder. I want eighteen to twenty grams on that scale.',
          gesture: 'point',
        },
      ],
    ],
    mood: 'neutral',
  },
  'grind.over': {
    tiers: [
      [
        { text: "Whoa, whoa! That's a dose, not a sandcastle." },
        { text: "Easy, champ. We're not feeding a horse." },
      ],
      [{ text: "Mate! Stop! The grinder's not a pokie machine." }],
    ],
    mood: 'shocked',
    gesture: 'throwHands',
    cooldown: 6,
  },
  'grind.empty': {
    tiers: [[{ text: "There's nothing in the basket. Grind first, genius." }]],
    mood: 'sceptical',
    cooldown: 3,
  },
  'dose.good': {
    tiers: [
      [
        { text: 'Bang on. Even a broken clock, eh.' },
        { text: "Right on the money. Don't let it go to your head." },
      ],
    ],
    mood: 'impressed',
    gesture: 'nod',
  },
  'dose.light': {
    tiers: [
      [
        { text: "Bit light, that. Shot'll gush through. Your funeral." },
        { text: "That's a dusting, not a dose. Whatever, keep going." },
      ],
    ],
    mood: 'sceptical',
    gesture: 'shrug',
  },
  'dose.heavy': {
    tiers: [
      [
        { text: "That's way too much coffee. It'll choke. Your call." },
        { text: "Overdosed it. That basket's packed like a Sydney train." },
      ],
    ],
    mood: 'sceptical',
    gesture: 'shakeHead',
  },
  'shot.intro': {
    tiers: [
      [
        {
          text: 'Hit the button to start, hit it again to stop. Twenty-five to thirty seconds.',
          gesture: 'point',
        },
        {
          text: 'Pull the shot. Stop it between twenty-five and thirty. Watch the timer, not me.',
          gesture: 'point',
        },
      ],
    ],
    mood: 'neutral',
  },
  'shot.long': {
    tiers: [
      [
        { text: "Stop it! It's going bitter!" },
        { text: "That's past thirty, mate. It's turning to tar." },
      ],
      [{ text: 'Stop the shot! Are you waiting for a written invitation?' }],
    ],
    mood: 'shocked',
    gesture: 'throwHands',
    cooldown: 5,
  },
  'shot.good': {
    tiers: [
      [
        { text: "Nice. Proper shot, that. Don't get used to compliments." },
        { text: "Look at that crema. I'm almost impressed. Almost." },
      ],
    ],
    mood: 'impressed',
    gesture: 'nod',
  },
  'shot.short': {
    tiers: [
      [
        { text: "That's sour as. Customers'd send it straight back." },
        { text: 'Pulled it early. Sour little shot, that one.' },
      ],
    ],
    mood: 'sceptical',
    gesture: 'shakeHead',
  },
  'shot.over': {
    tiers: [
      [
        { text: "That's burnt. Smells like a tyre fire in here." },
        { text: "Over-extracted. That'll taste like an ashtray." },
      ],
    ],
    mood: 'annoyed',
    gesture: 'facepalm',
  },
  /** Day 2: the first time the milk is steamed while the shot is still running. */
  'shot.overlap': {
    tiers: [[{ text: "Two hands. Now you're a barista." }]],
    mood: 'impressed',
  },
  'shot.handoff': {
    tiers: [[{ text: "I'll pull the next shots myself. You're slower than a wet week." }]],
    mood: 'smug',
  },
  'steam.intro': {
    tiers: [
      [
        {
          text: 'Milk. Hold to steam. Tip just under the surface first till it goes tss-tss, then raise the jug and let it spin. Off at sixty.',
          gesture: 'point',
        },
      ],
    ],
    mood: 'neutral',
  },
  'steam.again': {
    tiers: [
      [
        { text: 'Shot is in. Steam some fresh milk. Same deal: stretch, spin, off at sixty.' },
        { text: "Fresh jug of milk. Don't overthink it. Tss-tss, spin, sixty." },
      ],
      [{ text: 'Fresh milk. Try listening to it this time.' }],
      [{ text: "Milk. Again. Sixty degrees. It's not rocket science." }],
    ],
    mood: 'neutral',
  },
  'steam.screech': {
    tiers: [
      [
        { text: "Oi! You're spraying milk everywhere. Tip in the milk!" },
        { text: "Hear that screaming? That's the milk begging for help." },
      ],
      [{ text: "It's screeching, mate! Get the tip back in!" }],
    ],
    mood: 'shocked',
    gesture: 'throwHands',
    cooldown: 5,
  },
  'steam.noAir': {
    tiers: [
      [
        { text: "You've gotta stretch it, mate. Tip near the top, get some air in." },
        { text: "That's just hot milk. No air, no foam, no art." },
      ],
    ],
    mood: 'sceptical',
    gesture: 'point',
    cooldown: 8,
  },
  'steam.tooMuchAir': {
    tiers: [[{ text: "That's a bubble bath, not microfoam. Bury the tip!" }]],
    mood: 'annoyed',
    gesture: 'point',
    cooldown: 8,
  },
  'steam.hot': {
    tiers: [
      [
        { text: "That's hot enough! Turn it off!" },
        { text: "Sixty-six, sixty-seven... you're cooking it." },
      ],
      [{ text: 'Off! Off! It is boiling, mate!' }],
    ],
    mood: 'shocked',
    gesture: 'throwHands',
    cooldown: 6,
  },
  'steam.tooEarly': {
    tiers: [[{ text: "That's still cold. Keep going." }, { text: 'Barely warm. Keep it on.' }]],
    mood: 'sceptical',
    cooldown: 3,
  },
  'steam.good': {
    tiers: [
      [
        { text: 'Silky, shiny, sixty. Who taught you that?' },
        { text: "Now that's milk. Lovely texture." },
      ],
    ],
    mood: 'impressed',
    gesture: 'nod',
  },
  'steam.cold': {
    tiers: [
      [
        { text: "Lukewarm. Customers'll think we've lost the plot." },
        { text: 'Bit cool, that. Nobody wants a tepid flattie.' },
      ],
    ],
    mood: 'sceptical',
  },
  'steam.hotDone': {
    tiers: [[{ text: "Too hot. It'll taste cooked. Off earlier next time." }]],
    mood: 'annoyed',
    gesture: 'shakeHead',
  },
  'steam.scalded': {
    tiers: [[{ text: 'Scalded. Lovely. Smells like burnt custard in here.' }]],
    mood: 'furious',
    gesture: 'facepalm',
  },
  'steam.flat': {
    tiers: [[{ text: 'No foam in that. Flat as a tack. Good luck drawing with it.' }]],
    mood: 'sceptical',
    gesture: 'shrug',
  },
  'steam.stiff': {
    tiers: [[{ text: "That's cappuccino froth. Stiff as a board. It won't flow." }]],
    mood: 'annoyed',
    gesture: 'shakeHead',
  },
  'demo.intro': {
    tiers: [
      [{ text: "Right. Watch and learn, 'cause I'm only doing this once.", gesture: 'point' }],
    ],
    mood: 'smug',
  },
  'demo.again': {
    tiers: [
      [{ text: 'Again? Alright. Eyes on the jug.' }, { text: 'Fine. Watch closer this time.' }],
    ],
    mood: 'sceptical',
  },
  'demo.fill': {
    tiers: [[{ text: 'Start high. Let it dive under the crema and fill the cup.' }]],
    mood: 'neutral',
  },
  'demo.drop': {
    tiers: [[{ text: 'Now drop it right down, close. Let the white come up and bloom.' }]],
    mood: 'neutral',
  },
  'demo.pull': {
    tiers: [[{ text: 'Lift, ease off, and pull straight through. Done.' }]],
    mood: 'smug',
  },
  'demo.after': {
    tiers: [
      [
        { text: "See? Easy. Your turn. Don't stuff it up." },
        { text: "That's a heart. Now you have a crack." },
      ],
    ],
    mood: 'smug',
    gesture: 'point',
  },
  'pour.intro': {
    tiers: [
      [
        {
          text: 'Your go. Mouse moves the jug, hold to pour. Scroll, or W and S, for up and down.',
          gesture: 'point',
        },
      ],
    ],
    mood: 'neutral',
  },
  'pour.again': {
    tiers: [
      [
        { text: 'Go again. Fresh cup. Breathe.' },
        { text: 'Righto, go again. Concentrate this time.' },
      ],
      [
        { text: 'Again. And this time, make it look like something.' },
        { text: "Here's another cup. They're not free, you know." },
      ],
      [{ text: "Go again. My blood pressure can't take many more." }],
    ],
    mood: 'neutral',
  },
  'pour.last': {
    tiers: [
      [{ text: 'Last go. Make it count.' }, { text: 'Third and final cup. No pressure.' }],
      [{ text: 'Last chance, champ. Do me a favour and make it count.' }],
    ],
    mood: 'smug',
  },
  'pour.outside': {
    tiers: [
      [
        { text: "That's the counter, mate. Cup's over here." },
        { text: "Wrong target. The cup's the round thing." },
      ],
      [{ text: "You're pouring on my bench! The cup, mate!" }],
      [{ text: 'Are you blindfolded? Cup!' }],
    ],
    mood: 'shocked',
    gesture: 'point',
    cooldown: 4,
  },
  'pour.overflow': {
    tiers: [
      [
        { text: "Whoa, whoa! It's a cup, not a bathtub!" },
        { text: "It's running over! Stop pouring!" },
      ],
      [{ text: 'My bench is swimming. Stop!' }],
    ],
    mood: 'shocked',
    gesture: 'throwHands',
    cooldown: 4,
  },
  'pour.tooHigh': {
    tiers: [
      [
        { text: "Too high, it's all sinking. Get closer!" },
        { text: "Drop the jug! The art won't happen from up there." },
      ],
      [{ text: 'Lower! Closer to the coffee!' }],
    ],
    mood: 'annoyed',
    gesture: 'point',
    cooldown: 5,
  },
  'pour.earlyLow': {
    tiers: [[{ text: 'Too early! Fill it up first, then go low.' }]],
    mood: 'sceptical',
    cooldown: 8,
  },
  'pour.hesitate': {
    tiers: [
      [
        { text: 'Any day now.', gesture: 'tapWatch' },
        { text: "The milk's not getting any younger.", gesture: 'tapWatch' },
      ],
      [{ text: 'Hello? Pour the milk.', gesture: 'tapWatch' }],
    ],
    mood: 'annoyed',
    cooldown: 7,
  },
  'pour.bloom': {
    tiers: [[{ text: "That's it... that's it..." }, { text: 'Ooh. Keep going...' }]],
    mood: 'impressed',
    cooldown: 12,
  },
  'pour.dry': {
    tiers: [[{ text: "Jug's empty. That's all you get." }]],
    mood: 'sceptical',
    cooldown: 10,
  },
  'inspect.look': {
    tiers: [[{ text: "Let's have a look..." }, { text: 'Right. Show me.' }, { text: 'Hmm.' }]],
    mood: 'neutral',
    gesture: 'leanIn',
  },
  'art.noArt': {
    tiers: [
      [{ text: "Where's the art? That's just a brown puddle." }],
      [{ text: 'Nothing. Zip. Not even a smudge.' }],
      [{ text: 'I asked for a heart and got a brown pond.' }],
    ],
    mood: 'annoyed',
    gesture: 'facepalm',
  },
  'art.blob': {
    tiers: [
      [
        { text: 'Mate, is that a heart or a dead possum?' },
        { text: "That's a blob. A white blob. You forgot to pull through." },
      ],
      [
        { text: "Blob. Again. I didn't ask for a cloud." },
        { text: 'My nan could pour better than that.' },
      ],
      [{ text: 'Another blob. I need a lie-down.' }],
    ],
    mood: 'annoyed',
    gesture: 'shakeHead',
  },
  'art.split': {
    tiers: [
      [
        { text: "You've cut it clean in half. That's a bum, not a heart." },
        { text: "Pulled through way too hard. It's two blobs having a fight." },
      ],
    ],
    mood: 'sceptical',
    gesture: 'shakeHead',
  },
  'art.noTip': {
    tiers: [
      [
        { text: 'No point on it. Pull right through to the far side.' },
        { text: 'Nice start, but you chickened out. Follow through!' },
      ],
    ],
    mood: 'sceptical',
    gesture: 'point',
  },
  'art.noCleft': {
    tiers: [
      [
        { text: "That's a teardrop. Hearts have a dip at the top, mate." },
        { text: 'No dip at the top. Start the pull-through from the back edge.' },
      ],
    ],
    mood: 'sceptical',
    gesture: 'point',
  },
  'art.lopsided': {
    tiers: [
      [
        { text: "It's leaning like a bloke at the pub at closing time." },
        { text: 'Lopsided. Keep the jug straight when you pull.' },
      ],
      [{ text: 'Crooked again. Straight line, mate. Straight.' }],
    ],
    mood: 'sceptical',
    gesture: 'shakeHead',
  },
  'art.offCentre': {
    tiers: [
      [
        { text: 'Bit off to the side. Pour in the middle, not the suburbs.' },
        { text: "It's hiding in the corner. Centre it." },
      ],
    ],
    mood: 'sceptical',
    gesture: 'point',
  },
  'art.tooSmall': {
    tiers: [
      [
        { text: 'Is that a heart or a freckle? Bigger.' },
        { text: 'Tiny. Get low sooner and let it bloom.' },
      ],
    ],
    mood: 'sceptical',
  },
  'art.tooBig': {
    tiers: [[{ text: "You've whited out the whole cup. That's not a heart, that's a snowfield." }]],
    mood: 'sceptical',
  },
  'art.muddy': {
    tiers: [
      [
        { text: "It's all muddy. You were too high when you dropped in." },
        { text: 'Beige. Everything is beige. Get closer to the surface.' },
      ],
    ],
    mood: 'annoyed',
    gesture: 'shakeHead',
  },
  'art.decent': {
    tiers: [
      [
        { text: 'Not bad. Not good. But not bad.' },
        { text: "That's... actually a heart. Rough round the edges." },
        { text: "Customers would take that. Wouldn't post it, but they'd take it." },
      ],
    ],
    mood: 'neutral',
    gesture: 'nod',
  },
  'art.great': {
    tiers: [
      [
        { text: "Bloody hell. That's a proper heart." },
        { text: "Okay. Okay! That's lovely, that is." },
        { text: "Now we're talking. That's a heart." },
      ],
    ],
    mood: 'impressed',
    gesture: 'thumbsUp',
  },
  'invalid.nothingPoured': {
    tiers: [[{ text: "You didn't even pour it. Bold strategy." }]],
    mood: 'shocked',
    gesture: 'throwHands',
  },
  'invalid.mostlySpilled': {
    tiers: [[{ text: "Most of that's on my bench. Can't even judge it." }]],
    mood: 'furious',
    gesture: 'facepalm',
  },
  'invalid.halfEmpty': {
    tiers: [[{ text: "Half a cup? Are we rationing now? Doesn't count." }]],
    mood: 'annoyed',
    gesture: 'shrug',
  },
  'extra.overflow': {
    tiers: [
      [{ text: 'And it overflowed. Wipe that up.' }, { text: 'Plus my bench is sticky now.' }],
    ],
    mood: 'annoyed',
  },
  'extra.spill': {
    tiers: [[{ text: "And there's milk all over my bench. Lovely." }]],
    mood: 'annoyed',
  },
  'extra.underfilled': {
    tiers: [[{ text: "Cup's not even full. Right to the brim next time." }]],
    mood: 'sceptical',
  },
  'extra.improved': {
    tiers: [
      [
        { text: 'Better. See what happens when you listen?' },
        { text: "That's an improvement. Small mercies." },
      ],
    ],
    mood: 'pleased',
  },
  'extra.sameMistake': {
    tiers: [
      [
        { text: 'Same stuff-up as last time. Were you even listening?' },
        { text: 'Same problem as your last cup. Read the card, mate.' },
      ],
      [{ text: "Same mistake. Again. I'm starting to think it's on purpose." }],
    ],
    mood: 'annoyed',
    gesture: 'facepalm',
  },
  'extra.improvedAgain': {
    tiers: [
      [
        { text: "Better again. Two in a row. Don't let it go to your head." },
        { text: "Getting better every cup. Keep that up and I'll have to pay you." },
      ],
    ],
    mood: 'pleased',
    gesture: 'nod',
  },
  'extra.failedAgain': {
    tiers: [
      [{ text: "That's two in a row, champ. Shake it off." }],
      [{ text: "Two duds in a row. Milk's not free, mate." }],
      [{ text: "Another dud. I'm running out of cups and patience." }],
    ],
    mood: 'annoyed',
    gesture: 'shakeHead',
  },
  'extra.worse': {
    tiers: [
      [{ text: 'Went backwards there, champ.' }, { text: 'Worse. How is that even possible?' }],
    ],
    mood: 'annoyed',
  },
  'water.overflow': {
    tiers: [[{ text: "Whoa, that's a bath, not a long black. Leave room for the shot!" }]],
    mood: 'shocked',
    gesture: 'throwHands',
  },
  // ------------------------------------------------------------ Day 2: the morning rush
  // {name}, {ordered} and {drink} are filled in by core/rush.ts.
  'rush.firstCustomer': {
    tiers: [[{ text: 'Here comes {name}. Take the order, mate.', gesture: 'point' }]],
    mood: 'neutral',
  },
  'rush.registerNag': {
    tiers: [
      [
        { text: 'Customer at the register, mate!' },
        { text: 'You gonna take that order or just admire them?' },
      ],
      [{ text: "{name}'s been standing there for ages. Order!" }],
      [{ text: 'Take. The. Order.' }],
    ],
    mood: 'annoyed',
    gesture: 'point',
    cooldown: 9,
  },
  'rush.slow': {
    tiers: [
      [
        { text: 'Tickets are piling up. Move it.' },
        { text: "That {ordered} isn't gonna make itself." },
      ],
      [{ text: "{name}'s been waiting forever. Speed it up." }],
      [{ text: "We'll be here till lunch at this rate." }],
    ],
    mood: 'annoyed',
    gesture: 'tapWatch',
    cooldown: 14,
  },
  'rush.wrongDrink': {
    tiers: [
      [
        { text: 'Wrong drink, champ. {name} ordered a {ordered}.' },
        { text: '{name} wanted a {ordered}, not a {drink}. Read the ticket!' },
      ],
      [{ text: "Tickets, mate! {ordered}! It's written down!" }],
      [{ text: 'Again with the wrong drink. Unbelievable.' }],
    ],
    mood: 'annoyed',
    gesture: 'facepalm',
  },
  'rush.misheard': {
    tiers: [
      [
        { text: "That's what the ticket says, mate, but it's not what {name} said. Listen first." },
        { text: 'You rang that up wrong. {name} told you exactly what they wanted.' },
      ],
      [{ text: 'Ears, mate! Listen to the customer, then ring it up.' }],
      [{ text: "Wrong ticket again. If you didn't catch it, ask!" }],
    ],
    mood: 'annoyed',
    gesture: 'point',
  },
  'rush.posNag': {
    tiers: [
      [
        { text: "Ring it up, mate. {name}'s not getting any younger." },
        { text: "Didn't catch it? Ask. Then ring it up." },
      ],
      [{ text: 'Today, champ. Ring. It. Up.' }],
    ],
    mood: 'annoyed',
    gesture: 'tapWatch',
    cooldown: 12,
  },
  'rush.askedTwice': {
    tiers: [
      [
        { text: 'Twice? Write it on your hand next time.' },
        { text: "Listen harder, mate. They won't say it a third time." },
      ],
    ],
    mood: 'sceptical',
    cooldown: 20,
  },
  // A flat white with the wrong milk that wasn't a listening mistake (made for someone else).
  'rush.wrongMilk': {
    tiers: [
      [
        { text: "Wrong milk, champ. That's not what {name}'s ticket says." },
        { text: "{name} can't have that milk. Check the ticket before you hand it over." },
      ],
      [{ text: 'Milk, mate! Read the ticket! Oat, soy, almond. It matters.' }],
    ],
    mood: 'annoyed',
    gesture: 'facepalm',
  },
  // ------------------------------------------------------------ the bin chicken (sim/ibis.ts)
  'ibis.enter': {
    tiers: [
      [
        { text: 'Oi! Bin chicken! Who left the door open?', gesture: 'point' },
        { text: "Not again. There's a bin chicken in my café." },
      ],
    ],
    mood: 'shocked',
    gesture: 'throwHands',
  },
  'ibis.bin': {
    tiers: [
      [
        { text: "It's in the bin. Of course it's in the bin." },
        { text: 'Shoo it out, mate. Gently. Before a customer sees it.' },
      ],
    ],
    mood: 'annoyed',
    gesture: 'point',
  },
  'ibis.out': {
    tiers: [
      [{ text: 'And stay out, you feathery menace.' }, { text: 'Nicely done. Out you go, champ.' }],
    ],
    mood: 'pleased',
    gesture: 'thumbsUp',
  },
  'ibis.ignored': {
    tiers: [[{ text: "Great. It's had breakfast. Now I'm cleaning the bin." }]],
    mood: 'annoyed',
    gesture: 'facepalm',
  },
  'rush.binned': {
    tiers: [
      [
        { text: "Into the bin. That's money down the sink." },
        { text: 'Binning it? Fair enough. Better than serving it.' },
      ],
    ],
    mood: 'sceptical',
    cooldown: 8,
  },
  'rush.walkout': {
    tiers: [
      [
        { text: "And there goes {name}. They'll tell their mates." },
        { text: 'Lost {name}. Lovely.' },
      ],
      [{ text: "Another walkout. We're a café, not a waiting room." }],
      [{ text: "At this rate I'll be serving myself." }],
    ],
    mood: 'furious',
    gesture: 'throwHands',
  },
  'rush.goodServe': {
    tiers: [
      [
        { text: "Nice. Keep 'em coming." },
        { text: "See? That's how it's done." },
        { text: 'Not bad. {name} looked happy.' },
      ],
    ],
    mood: 'impressed',
    gesture: 'nod',
    cooldown: 18,
  },
  'rush.poorServe': {
    tiers: [[{ text: 'You served that? Bold.' }, { text: "{name}'s face says it all." }]],
    mood: 'sceptical',
    gesture: 'shakeHead',
  },
  'rush.coldDrink': {
    tiers: [
      [
        { text: "Don't let drinks sit on the pass. They go cold." },
        { text: 'That one sat there too long. Lukewarm.' },
      ],
    ],
    mood: 'annoyed',
  },
  'rush.notHotEnough': {
    tiers: [[{ text: '{name} asked for extra hot, mate. That was barely warm.' }]],
    mood: 'annoyed',
    gesture: 'facepalm',
  },
  'rush.noHeart': {
    tiers: [[{ text: 'No heart? {name} asked nicely, too.' }]],
    mood: 'sceptical',
    gesture: 'shakeHead',
  },
  'rush.streakGood': {
    tiers: [[{ text: 'Three in a row. Who are you and what have you done with the trainee?' }]],
    mood: 'impressed',
    gesture: 'thumbsUp',
  },
  'rush.streakBad': {
    tiers: [[{ text: 'Two stuff-ups on the trot. Breathe, mate.' }]],
    mood: 'annoyed',
  },
  'rush.karenManager': {
    tiers: [[{ text: "I am the manager. And no, she's not getting a free one." }]],
    mood: 'smug',
  },
  'rush.lastOrder': {
    tiers: [[{ text: 'Last one. Finish strong.' }]],
    mood: 'neutral',
  },
  'rush.wasteLeft': {
    tiers: [[{ text: 'And you left a drink on the pass. Somebody paid for those beans.' }]],
    mood: 'sceptical',
  },
  'rush.end.excellent': {
    tiers: [[{ text: 'Bloody oath. Five for five. You might actually be good at this.' }]],
    mood: 'impressed',
    gesture: 'thumbsUp',
  },
  'rush.end.good': {
    tiers: [[{ text: 'Not bad for a first shift. Not bad at all.' }]],
    mood: 'pleased',
    gesture: 'nod',
  },
  'rush.end.okay': {
    tiers: [[{ text: 'We survived. Just. Tomorrow, faster.' }]],
    mood: 'sceptical',
  },
  'rush.end.poor': {
    tiers: [[{ text: 'That was rough, mate. Real rough. Practise your flatties tonight.' }]],
    mood: 'annoyed',
    gesture: 'shakeHead',
  },
  'rush.end.disaster': {
    tiers: [[{ text: 'Half my regulars walked out. Go home, have a lie-down, try again.' }]],
    mood: 'furious',
    gesture: 'facepalm',
  },
  'verdict.disaster': {
    tiers: [
      [
        { text: "Mate. I've had better coffee at a servo. Thanks for coming in. Door's that way." },
        { text: "That was a disaster. My insurance doesn't cover this. Off you go." },
      ],
    ],
    mood: 'furious',
    gesture: 'point',
  },
  'verdict.failed': {
    tiers: [
      [
        { text: 'Look, you tried. Badly, but you tried. Not today, mate.' },
        { text: 'Nah. Practise at home and come back when you can pour a heart.' },
      ],
    ],
    mood: 'annoyed',
    gesture: 'shakeHead',
  },
  'verdict.almost': {
    tiers: [
      [
        { text: "Close. Real close. Come back Saturday, do a proper shift, and we'll see." },
        { text: "You're not hopeless. Weekend trial. Don't make me regret it." },
      ],
    ],
    mood: 'neutral',
    gesture: 'nod',
  },
  'verdict.hired': {
    tiers: [[{ text: "Bloody hell. Alright, you're hired." }]],
    mood: 'impressed',
    gesture: 'thumbsUp',
  },
  'verdict.hiredAfter': {
    tiers: [
      [
        { text: 'Six sharp Monday. Bring your own apron.' },
        { text: "Start Monday. Six on the dot. And no wukkas if you're early." },
      ],
    ],
    mood: 'pleased',
  },
};
