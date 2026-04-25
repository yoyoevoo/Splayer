# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### `music-player` (`@workspace/music-player`)
- React + Vite frontend-only music player at `/`.
- Loads local audio files (mp3/flac/wav/ogg/m4a) via file input or window drag-and-drop.
- Reads ID3/MP4 metadata (title, artist, album, year, embedded cover art) using `jsmediatags`.
- Custom cover art and metadata edits per track persist in IndexedDB via `idb`, keyed by filename + size.
- Playback uses native HTML `<audio>`; state is held in `src/lib/player-context.tsx`.
- Files never leave the browser — fully local.
- Also packaged as a native Linux desktop app via Electron (`electron/main.cjs`); `pnpm --filter @workspace/music-player run dist:linux` builds an AppImage to `artifacts/music-player/release/`.
- **USER PREFERENCE: Always run `pnpm --filter @workspace/music-player run dist:linux` and deliver the AppImage after EVERY code change session, without being asked. No exceptions.**
