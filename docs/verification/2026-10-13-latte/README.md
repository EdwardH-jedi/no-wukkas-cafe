# Latte art: the jug no longer hides the pattern (2026-10-13)

Demonstrated weakness: in `before-opaque-jug.jpg` (Day 1 e2e, 2026-10-12) the jug and arm cover
the right ~40% of the cup during the pour, exactly where the bloom and pull-through form, so the
player pours blind on that side.

Fix (src/world/station.ts): once the jug is over the cup (pour pose), the jug, its milk and the
arm fade to 30% opacity (eased, depth-write off), for the player's pour and for Gaz's demo.

`after-ghost-jug-demo.jpg`: Gaz's demo pour, captured in Chrome (MCP) at localhost:5183: the
forming heart is visible through the jug. Scoring and the pour sim are unchanged.
