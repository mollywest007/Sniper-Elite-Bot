---
name: Vite workflow stdin fix
description: Vite exits when stdin closes in non-TTY workflow environments — fix and diagnosis steps.
---

## Rule

When Vite is run by the Replit artifact workflow manager (non-TTY), it registers a `process.stdin.on('end', ...)` handler that calls `process.exit()` when stdin closes. This causes Vite to start, print its banner, and immediately exit — making the workflow health check fail.

**Fix:** Prefix the `dev` script in `package.json` with `tail -f /dev/null |`:

```json
"dev": "tail -f /dev/null | vite --config vite.config.ts --host 0.0.0.0"
```

`tail -f /dev/null` is a pipe that never sends data or EOF, keeping Vite's stdin open indefinitely.

**Why:** `tail -f /dev/null` pipes an infinite nothing to Vite's stdin, preventing the stdin EOF that would otherwise trigger Vite's exit handler.

**How to apply:** Any react-vite artifact in this monorepo that shows the startup banner but the workflow stays "failed" with `openPorts: null`.

## Diagnosis Steps

1. Workflow logs show Vite starting ("ready in Xms") but `openPorts: null` in `getWorkflowStatus`.
2. Run `PORT=<port> BASE_PATH=/ pnpm --filter @workspace/<slug> run dev &` from bash, wait 8s, curl localhost:<port> — if HTTP 200, the code is fine.
3. The issue is stdin closure in the workflow environment, not a code error.

## Other Notes

- Port 21142 (default assigned by `createArtifact`) is NOT in Replit's supported port list. Change to 3000, 5000, 5173, or 8080 via `verifyAndReplaceArtifactToml`.
- The `restart_workflow` tool may report failure even when using `restartWorkflow()` from code_execution succeeds — prefer the code_execution version.
- TypeScript enum imports from `@workspace/api-client-react/src/generated/api.schemas` (internal path) must use `@workspace/api-client-react` (the barrel export) instead.
