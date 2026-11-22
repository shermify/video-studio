import { randomUUID } from 'node:crypto';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type {
  CanonicalJobStatus,
  CanonicalVideoAsset,
  CanonicalVideoJob,
  ProviderId,
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
