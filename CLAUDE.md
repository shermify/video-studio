# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Goal

Build a React web app for video generation jobs using Sora and Veo providers:
- Create video generation jobs
- Unified Jobs list with status/progress, filtering, sorting
- View job details, play/download outputs
- Sora: remix completed videos
- Veo: poll long-running operations, reference images, lastFrame, extend-video

## Commands

```bash
# Install dependencies
yarn install

# Run both client and server in development
yarn start

# Run only client (Vite dev server on https://localhost:5173)
yarn workspace @video/client start

# Run only server (Fastify on port 3000)
yarn workspace @video/server start

# Lint and fix
yarn lint

# Type check
yarn typecheck

# Build client
yarn workspace @video/client build

# Prisma commands (run from packages/server)
cd packages/server
npx prisma generate
npx prisma migrate dev
```

## Architecture

**Monorepo** using Yarn 4 workspaces with two packages:

### `packages/client` (@video/client)
- React 19 + Vite + TypeScript
- Tailwind CSS 4 with Radix UI components (shadcn/ui style in `src/components/ui/`)
- Redux Toolkit for state management (`src/store.ts`)
- Path alias: `@/` maps to `src/`
- Proxies `/api/*` to server at localhost:3000

### `packages/server` (@video/server)
- Fastify with SSE support (fastify-sse-v2)
- Prisma ORM with PostgreSQL
- Uses `tsx --watch` for development
- Environment loaded from root `.env` file

## Key Files

- `packages/client/src/store.ts` - Redux store with typed hooks (`useAppDispatch`, `useAppSelector`)
- `packages/client/src/api/index.ts` - RTK Query API slice with all endpoints
- `packages/client/src/features/jobs/jobsSlice.ts` - Jobs UI state (selectedJobId, filters, draft form, favorites)
- `packages/server/prisma/schema.prisma` - Database schema
- `packages/client/vite.config.ts` - Dev server config with API proxy

## Frontend Architecture

Three-pane studio layout (see `FRONT_END_PLAN.md` for full design spec):

| Pane | Component | Status |
|------|-----------|--------|
| Left (w-80) | `DraftBuilder` | ✅ Complete - provider/model select, mode toggle, prompt, aspect ratio, duration, generate button |
| Center | `Preview` | 🔲 Stub - needs video player, output strip, A/B compare |
| Right (w-96) | `Queue` | ✅ Complete - tabs, search, job cards with status/progress/actions |

### RTK Query Endpoints (`src/api/index.ts`)
- `useListProvidersQuery` - fetch available providers
- `useListJobsQuery` - list jobs with filters
- `useGetJobQuery` - single job details
- `useCreateJobMutation` - create new job
- `useDeleteJobMutation`, `useRefreshJobMutation`, `useRemixJobMutation`, `useExtendJobMutation`

### Jobs Slice State (`src/features/jobs/jobsSlice.ts`)
- `selectedJobId` - currently selected job for preview
- `filters` - queue filtering (provider, status, search query)
- `draft` - form state (provider, prompt, mode, params, assets)
- `favorites` - starred job IDs

### Provider-Specific Config (in DraftBuilder.tsx)
- **Veo**: models `veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview` | durations 4, 6, 8s
- **Sora**: model `sora-2` | durations 4, 8, 12s

## Next Steps

1. **Preview pane**: Video player, job details, output thumbnails for multi-sample
2. **Fork actions**: Remix/Extend/Re-run buttons that prefill DraftBuilder
3. **Asset tray**: Drag/drop for reference images, extend input videos
