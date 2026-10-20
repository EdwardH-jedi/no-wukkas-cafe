// Game-time budgets for specs that wait out the sim (todo.md T5.5). Playwright can't load the
// sim itself (src/data/voice imports JSON without an import attribute), so the numbers live here
// and tests/helpers/budgets.test.ts plays the same shifts headless to keep them honest.

/** Game seconds of service a spec may wait for a fresh save's Monday (normal) to reach its report
 *  when nobody is served. Headless that is 324.6 s; the rest is margin. */
export const MONDAY_UNSERVED_SECONDS = 400;
