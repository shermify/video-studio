CREATE TABLE `media_files` (
	`id` text PRIMARY KEY,
	`kind` text NOT NULL,
	`mime_type` text NOT NULL,
	`name` text NOT NULL,
	`size` integer NOT NULL,
	`extension` text NOT NULL,
	`duration_ms` integer,
	`width` integer,
	`height` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_video_jobs` (
	`id` text PRIMARY KEY,
	`provider` text NOT NULL,
	`provider_job_id` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`progress_pct` integer,
	`prompt` text NOT NULL,
	`params_json` text,
	`outputs_json` text,
	`error_json` text,
	`inputs_json` text,
	`metadata_json` text,
	`submission_state` text DEFAULT 'pending' NOT NULL,
	`request_id` text UNIQUE,
	`request_hash` text,
	`archive_state` text DEFAULT 'none' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_video_jobs`(`id`, `provider`, `provider_job_id`, `status`, `progress_pct`, `prompt`, `params_json`, `outputs_json`, `error_json`, `created_at`, `updated_at`) SELECT `id`, `provider`, `provider_job_id`, `status`, `progress_pct`, `prompt`, `params_json`, `outputs_json`, `error_json`, `created_at`, `updated_at` FROM `video_jobs`;--> statement-breakpoint
DROP TABLE `video_jobs`;--> statement-breakpoint
ALTER TABLE `__new_video_jobs` RENAME TO `video_jobs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;