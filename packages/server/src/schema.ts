import { randomUUID } from 'node:crypto';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type {
  CanonicalJobStatus,
  CanonicalVideoAsset,
  CanonicalVideoJob,
  ProviderId,
  MediaInput,
  MediaKind,
} from '@video-studio/types';

export const videoJobs = sqliteTable('video_jobs', {
  id: text().primaryKey().notNull().$defaultFn(randomUUID),
  provider: text().$type<ProviderId>().notNull(),
  providerJobId: text('provider_job_id'),
  status: text().$type<CanonicalJobStatus>().notNull().default('queued'),
  progressPct: integer('progress_pct'),
  prompt: text().notNull(),
  paramsJson: text('params_json', { mode: 'json' }).$type<Record<string, unknown>>(),
  outputsJson: text('outputs_json', { mode: 'json' }).$type<CanonicalVideoAsset[]>(),
  errorJson: text('error_json', { mode: 'json' })
    .$type<NonNullable<CanonicalVideoJob['error']>>(),
  inputsJson: text('inputs_json', { mode: 'json' }).$type<MediaInput[]>(),
  metadataJson: text('metadata_json', { mode: 'json' }).$type<Record<string, unknown>>(),
  submissionState: text('submission_state')
    .$type<'pending' | 'submitting' | 'submitted' | 'uncertain'>()
    .notNull()
    .default('pending'),
  requestId: text('request_id').unique(),
  requestHash: text('request_hash'),
  archiveState: text('archive_state')
    .$type<'none' | 'pending' | 'ready'>()
    .notNull()
    .default('none'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});

export type VideoJob = typeof videoJobs.$inferSelect;
export type NewVideoJob = typeof videoJobs.$inferInsert;

export const mediaFiles = sqliteTable('media_files', {
  id: text().primaryKey().notNull(),
  kind: text().$type<MediaKind>().notNull(),
  mimeType: text('mime_type').notNull(),
  name: text().notNull(),
  size: integer().notNull(),
  extension: text().notNull(),
  duration: integer('duration_ms'),
  width: integer(),
  height: integer(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});
