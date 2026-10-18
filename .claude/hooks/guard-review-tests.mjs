// PreToolUse guard: the implementer session may not edit the reviewer's acceptance tests.
// Set CLAUDE_ROLE=review in the reviewer's shell to lift the guard there.
import { readFileSync } from "node:fs";
const input = JSON.parse(readFileSync(0, "utf8"));
const p = input?.tool_input?.file_path ?? input?.tool_input?.path ?? "";
const protectedPaths = [
  /tests\/review\/independent[^/]*\.ts$/,
  /tests\/review\/[^/]*\.browser\.ts$/,
  /tests\/review\/playwright\.[^/]*\.config\.ts$/,
  /tests\/fuzz\//,
];
if (process.env.CLAUDE_ROLE !== "review" && protectedPaths.some((re) => re.test(p))) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        `${p} is a reviewer acceptance test. Make it green by changing src/. ` +
        `If the test asserts a defect that a decision in docs/DECISIONS.md now makes false, ` +
        `SendMessage the 'review' session to re-issue it; do not edit it here.`,
    },
  }));
}
