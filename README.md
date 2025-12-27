# Video Generation Studio

A web application for creating and managing AI video generation jobs using OpenAI Sora and Google Veo.

<img width="1206" height="856" alt="Screenshot 2025-12-27 at 12 25 43 PM" src="https://github.com/user-attachments/assets/8d4d3623-33ac-4e70-971c-166c7ad0f50d" />

## Features

- **Multi-Provider Support**: Generate videos using OpenAI Sora or Google Veo
- **Job Queue Management**: Track all generation jobs with status, progress, filtering, and search
- **Video Preview**: Play completed videos directly in the browser with download support
- **Provider-Specific Features**:
  - **Sora**: Remix completed videos with modified prompts
  - **Veo**: Extend videos, use reference images, multiple model options
- **Real-Time Updates**: Automatic polling for running jobs with progress indicators

## Architecture

```
video/
├── packages/
│   ├── client/          # React frontend
│   ├── server/          # Fastify API server
│   └── types/           # Shared TypeScript types
├── package.json         # Root workspace config
└── .env                 # Environment variables
```

### Client (`@video/client`)

- **React 19** with Vite for fast development
- **Tailwind CSS 4** with Radix UI components (shadcn/ui style)
- **Redux Toolkit** with RTK Query for state and API management
- Three-pane studio layout:
  - **DraftBuilder** (left): Create new video generation jobs
  - **Preview** (center): View job details and play completed videos
  - **Queue** (right): Browse and manage all jobs

### Server (`@video/server`)

- **Fastify** with SSE support for real-time updates
- **Prisma ORM** with PostgreSQL
- RESTful API with consistent error handling
- Provider abstraction layer for Sora and Veo

## Prerequisites

- Node.js 20+
- Yarn 4 (via Corepack)
- PostgreSQL database
- API keys for video providers:
  - OpenAI API key (for Sora)
  - Google Cloud project with Vertex AI enabled (for Veo)

## Setup

1. **Enable Corepack** (if not already enabled):
   ```bash
   corepack enable
   ```

2. **Install dependencies**:
   ```bash
   yarn install
   ```

3. **Configure environment variables**:

   Create a `.env` file in the server root directory:
   ```env
   # Database
   DATABASE_URL="postgresql://user:password@localhost:5432/video"

   # OpenAI (Sora)
   OPENAI_API_KEY="sk-..."

   # Google Cloud (Veo)
   GOOGLE_CLOUD_PROJECT="your-project-id"
   GOOGLE_CLOUD_LOCATION="us-central1"
   GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
   ```

4. **Set up the database**:
   ```bash
   cd packages/server
   npx prisma generate
   npx prisma migrate dev
   ```

## Development

Run both client and server in development mode:
```bash
yarn start
```

Or run them separately:
```bash
# Client only (https://localhost:5173)
yarn workspace @video/client start

# Server only (http://localhost:3000)
yarn workspace @video/server start
```

The client dev server proxies `/api/*` requests to the server.

## Available Scripts

| Command | Description |
|---------|-------------|
| `yarn start` | Run client and server in development mode |
| `yarn lint` | Lint and auto-fix all packages |
| `yarn typecheck` | Type-check all packages |
| `yarn workspace @video/client build` | Build client for production |

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
| `GET` | `/api/jobs/:id/content` | Stream video content |
| `POST` | `/api/jobs/:id/remix` | Remix a completed job (Sora) |
| `POST` | `/api/jobs/:id/extend` | Extend a completed video (Veo) |

## Provider Configuration

### OpenAI Sora

- **Model**: `sora-2`
- **Durations**: 4, 8, 12 seconds
- **Aspect Ratios**: 16:9, 9:16, 1:1

### Google Veo

- **Models**: `veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview`
- **Durations**: 4, 6, 8 seconds
- **Aspect Ratios**: 16:9, 9:16

## Tech Stack

- **Frontend**: React 19, Vite 7, Tailwind CSS 4, Redux Toolkit, Radix UI
- **Backend**: Fastify 5, Prisma 7, PostgreSQL
- **Language**: TypeScript 5.9
- **Package Manager**: Yarn 4 (workspaces)

## License

MIT
