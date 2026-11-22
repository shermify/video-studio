# Video Generation Studio

A web application for creating and managing AI video generation jobs using MiniMax H3, OpenAI Sora, and Google Veo.

<img width="1206" height="856" alt="Screenshot 2025-12-27 at 12 25 43 PM" src="https://github.com/user-attachments/assets/8d4d3623-33ac-4e70-971c-166c7ad0f50d" />

## Features

- **Multi-Provider Support**: Generate videos using MiniMax H3, OpenAI Sora, or Google Veo
- **Job Queue Management**: Track all generation jobs with status, progress, filtering, and search
- **Video Preview**: Play completed videos directly in the browser with download support
- **Provider-Specific Features**:
  - **MiniMax H3**: Text, first/last frames, mixed image/video/audio references, generated audio, queued cancellation, and 768P-to-2K regeneration
  - **Sora**: Remix completed videos with modified prompts
  - **Veo**: Extend videos, use reference images, multiple model options
- **Background Jobs**: The server submits and polls jobs even when the browser is closed
- **Local Media**: Retain original uploads and completed H3 videos independently of expiring provider URLs

## Architecture

```
video-studio/
├── packages/
│   ├── client/          # React frontend
│   ├── server/          # Fastify API server, Drizzle schema/migrations, .env
│   └── types/           # Shared TypeScript types
├── package.json         # Root scripts
└── pnpm-workspace.yaml  # Workspace config
```

### Client (`@video-studio/client`)

- **React 19** with Vite for fast development
- **Tailwind CSS 4** with Radix UI components (shadcn/ui style)
- **Redux Toolkit** with RTK Query for state and API management
- Three-pane studio layout:
  - **DraftBuilder** (left): Create new video generation jobs
  - **Preview** (center): View job details and play completed videos
  - **Queue** (right): Browse and manage all jobs

### Server (`@video-studio/server`)

- **Fastify** with a coordinated background job worker
- **Drizzle ORM** with local TursoDB (`@tursodatabase/database`)
- RESTful API with consistent error handling
- Provider abstraction layer for MiniMax H3, Sora, and Veo

## Prerequisites

- Node.js 26.13.1+ (26.x)
- pnpm 12
- FFmpeg's `ffprobe` on PATH for inspecting uploaded media (or set `FFPROBE_PATH`)
- API keys for video providers:
  - OpenAI API key (for Sora)
  - MiniMax pay-as-you-go API key (for H3)
  - Google Cloud project with Vertex AI enabled (for Veo)

## Setup

Run all commands from the repository root.

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Configure environment variables**:

   Copy the server environment template, then fill in your provider credentials:
   ```bash
   cp packages/server/.env.example packages/server/.env
   ```

   ```env
   # Database
   DB_FILE_NAME="sqlite.db"

   # OpenAI (Sora)
   OPENAI_API_KEY="sk-..."

   # MiniMax H3
   MINIMAX_API_KEY="..."
   MEDIA_DIR="./data/media"

   # Google Cloud (Veo)
   GOOGLE_CLOUD_PROJECT="your-project-id"
   GOOGLE_CLOUD_LOCATION="us-central1"
   GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
   ```

3. **Set up the database**:
   ```bash
   pnpm --filter @video-studio/server migrate
   ```

   This creates a local database and applies the checked-in Drizzle migrations.
   `DB_FILE_NAME` defaults to `sqlite.db`; relative paths resolve from
   `packages/server` when using these scripts, so the default file is
   `packages/server/sqlite.db`. No database service or credentials are required.

The local database starts empty. Existing PostgreSQL data is not imported.
Prompt search follows SQLite's `LIKE` behavior: case-insensitive matching applies
to ASCII letters; non-ASCII characters are case-sensitive.

After changing the Drizzle schema, generate and apply a migration:
```bash
pnpm --filter @video-studio/server db:generate
pnpm --filter @video-studio/server migrate
```

## Development

Run both client and server in development mode:
```bash
pnpm dev
```

Or run them separately:
```bash
# Client only (http://localhost:5174)
pnpm dev:client

# Server only (http://localhost:3000)
pnpm dev:server
```

The client dev server proxies `/api/*` requests to the server.
Providers without configured credentials use visibly labeled demo adapters. Set
`USE_STUB_ADAPTERS=true` to force demo behavior for all providers.

Run one server process per database. Job submission is claimed in the database
before calling a provider; concurrent refreshes share the same operation. On a
network failure or server interruption during submission, the job becomes
`unknown` and is not resubmitted automatically. Check the provider's task history
before creating another generation. Use queued cancellation for active H3 jobs;
running provider tasks cannot be canceled or deleted from the local queue.

`MEDIA_DIR` defaults to `packages/server/data/media` when using the pnpm scripts.
Back up this directory together with the database. Uploaded originals and archived
outputs are retained when a job is deleted, so derived jobs can keep their sources.
Completed H3 outputs are saved locally with byte-range playback and download
support. Failed downloads remain tracked and are retried by the worker.

## Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Run client and server in development mode |
| `pnpm lint:fix` | Lint and auto-fix all packages |
| `pnpm typecheck` | Type-check all packages |
| `pnpm test` | Run package tests |
| `pnpm --filter @video-studio/client build` | Build client for production |
| `pnpm --filter @video-studio/server db:generate` | Generate a Drizzle migration from schema changes |
| `pnpm --filter @video-studio/server migrate` | Apply pending database migrations |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/healthz` | Health check |
| `GET` | `/api/providers` | List available providers |
| `GET` | `/api/jobs` | List jobs (supports `?provider=`, `?status=`, `?q=`) |
| `POST` | `/api/jobs` | Create a new job |
| `GET` | `/api/jobs/:id` | Get job details |
| `DELETE` | `/api/jobs/:id` | Delete a job |
| `POST` | `/api/jobs/:id/refresh` | Refresh job status from provider |
| `POST` | `/api/jobs/:id/cancel` | Cancel an unsubmitted or supported queued job |
| `GET` | `/api/jobs/:id/content` | Stream video content |
| `POST` | `/api/jobs/:id/remix` | Remix a completed job (Sora) |
| `POST` | `/api/jobs/:id/extend` | Extend a completed video (Veo) |
| `POST` | `/api/jobs/:id/regenerate` | Regenerate a qualifying MiniMax 768P output at 2K |
| `POST` | `/api/media` | Upload one original media file as multipart `file` |
| `GET` | `/api/media/:id` | Preview uploaded media |

The application API contract is in [docs/openapi.yaml](docs/openapi.yaml).
Creation and derived-job requests accept a `requestId` UUID. Reusing it with the
same body returns the existing job; reusing it with different settings returns
409. Creation returns a queued record before making any generation request.

## Provider Configuration

### MiniMax H3

| Model | Resolutions | Duration |
|-------|-------------|----------|
| `MiniMax-H3` | 768P, 2K | 4–15 seconds |
| `MiniMax-H3-Highspeed` | 480P, 768P | 4–15 seconds |
| `MiniMax-H3-Lite` | 480P, 768P | 4–15 seconds |
| `MiniMax-H3-Max` | 480P, 768P | 5–15 seconds |

- Frame mode supports first frame, last frame, or both. Reference mode supports
  up to nine images, three video clips, and three audio clips. The two modes
  cannot be mixed.
- Local file inputs are stored as originals and uploaded to MiniMax just before
  generation. Previously uploaded MiniMax files expire after seven days; local
  originals allow a new generation to upload fresh copies.
- Images: JPG/JPEG/PNG/WebP/HEIC/HEIF, up to 30 MB. Reference videos: MP4/MOV,
  up to 50 MB. Reference audio: WAV/MP3, up to 15 MB. Each clip must be 2–15
  seconds; video and audio references each have a combined 15-second limit.
- Text mode requires a concrete ratio. Frame mode derives the ratio from its
  images. Reference mode supports adaptive ratios except on H3 Lite.
- Audio is generated by default. Max additionally exposes prompt expansion
  settings; there is no separate prompt rewriting/enhancement operation.
- Regeneration uses the original prompt and references plus the generated source
  video, avoiding the separate task-ID whitelist path. The source must meet
  MiniMax's 768P requirements and include audio. Final validation remains with
  MiniMax. Image generation and H3-Context-IR are not included.

### OpenAI Sora

- **Model**: `sora-2`
- **Durations**: 4, 8, 12 seconds
- **Aspect Ratios**: 16:9, 9:16

### Google Veo

- **Models**: `veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview`
- **Durations**: 4, 6, 8 seconds
- **Aspect Ratios**: 16:9, 9:16

## Tech Stack

- **Frontend**: React 19, Vite 7, Tailwind CSS 4, Redux Toolkit, Radix UI
- **Backend**: Fastify 5, Drizzle ORM, TursoDB (local SQLite-compatible database)
- **Language**: TypeScript 5.9
- **Package Manager**: pnpm 12 (workspaces)

## License

MIT
