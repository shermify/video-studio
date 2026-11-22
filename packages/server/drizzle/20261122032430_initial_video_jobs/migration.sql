CREATE TABLE `video_jobs` (
	`id` text PRIMARY KEY,
	`provider` text NOT NULL,
	`provider_job_id` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`progress_pct` integer,
	`prompt` text NOT NULL,
	`params_json` text,
	`outputs_json` text,
	`error_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
