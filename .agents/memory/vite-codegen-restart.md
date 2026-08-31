---
name: Vite file-watcher after codegen
description: After orval codegen cleans and regenerates lib files, Vite's FS cache goes stale and pages fail to reload
---

When `pnpm --filter @workspace/api-spec run codegen` runs with `clean: true`, it deletes and recreates the generated files in `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/`. Vite's file-watcher sees the delete event and marks the module as missing, causing errors like:

```
Pre-transform error: Failed to load url /@fs/.../lib/api-client-react/src/generated/api.ts
```

The files exist on disk but Vite doesn't know they were recreated.

**Fix (always do both steps in order):**
1. `pnpm run typecheck:libs` — rebuilds lib `.d.ts` declarations from the new generated files
2. `restart_workflow("artifacts/chainvaultshare: web")` — clears Vite's module graph cache

**Why:** Vite uses an in-memory module graph. A clean-and-recreate cycle looks like a deletion to the watcher, and the new files aren't re-registered until the server restarts.

**How to apply:** Any time you run orval codegen that includes `clean: true`, always follow up with typecheck:libs + frontend workflow restart before editing frontend files.
