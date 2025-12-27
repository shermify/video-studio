-- CreateTable
CREATE TABLE "video_jobs" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_job_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress_pct" INTEGER,
    "prompt" TEXT NOT NULL,
    "params_json" JSONB,
    "outputs_json" JSONB,
    "error_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_jobs_pkey" PRIMARY KEY ("id")
);
