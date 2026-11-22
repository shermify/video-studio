import { createHash } from 'node:crypto';
import { and, asc, eq, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { videoJobs, type NewVideoJob, type VideoJob } from '../schema.js';
import { getAdapter, type ProviderJobContext, type ProviderRefreshResult } from '../providers/index.js';
import { archiveOutputs } from '../media/storage.js';

export class JobError extends Error {
  constructor(public statusCode: number, public code: string, message: string) {
    super(message);
  }
}

const locks = new Map<string, Promise<unknown>>();
const refreshes = new Map<string, Promise<VideoJob>>();

// Serialize cancellation/deletion with submission and share concurrent refreshes.
export function withJobLock<T>(id: string, action: () => Promise<T>): Promise<T> {
  const previous = locks.get(id) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(action);
  locks.set(id, current);
  void current.finally(() => {
    if (locks.get(id) === current) locks.delete(id);
  }).catch(() => {});
  return current;
}

export async function getJob(id: string): Promise<VideoJob> {
  const job = await db.select().from(videoJobs).where(eq(videoJobs.id, id)).get();
  if (!job) throw new JobError(404, 'NOT_FOUND', 'Job not found');
  return job;
}

export function jobContext(job: VideoJob): ProviderJobContext {
  return {
    id: job.id,
    providerJobId: job.providerJobId,
    prompt: job.prompt,
    params: job.paramsJson ?? {},
    inputs: job.inputsJson ?? [],
    metadata: job.metadataJson ?? {},
    outputs: job.outputsJson ?? [],
    status: job.status,
  };
}

export function snapshotJobContext(job: VideoJob): ProviderJobContext {
  const context = jobContext(job);
  // Keep the current source's effective settings without recursively copying
  // every ancestor into later remix/extension rows.
  const { sourceJobSnapshot: _ancestor, ...params } = context.params;
  return { ...context, params };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Insert before any provider mutation. Unique request IDs handle concurrent HTTP retries. */
export async function queueJob(
  values: NewVideoJob,
  request: { requestId?: string; payload: unknown },
  validate = true
): Promise<VideoJob> {
  const requestHash = hashRequest(request.payload);
  const previous = await findRequestedJob(request);
  if (previous) return previous;
  if (validate) {
    const adapter = getAdapter(values.provider);
    await adapter.validateInput?.({
      id: values.id ?? '', providerJobId: null,
      prompt: values.prompt, params: values.paramsJson ?? {},
      inputs: values.inputsJson ?? [], outputs: [], status: 'queued',
    });
  }
  const [created] = await db.insert(videoJobs).values({
    ...values, status: 'queued', submissionState: 'pending',
    requestId: request.requestId, requestHash,
  }).onConflictDoNothing({ target: videoJobs.requestId }).returning();
  if (created) return created;
  const existing = await db.select().from(videoJobs)
    .where(eq(videoJobs.requestId, request.requestId!)).get();
  if (!existing) throw new JobError(409, 'REQUEST_CONFLICT', 'Unable to create this job; check the queue before trying again.');
  return verifyIdempotent(existing, requestHash);
}

function hashRequest(payload: unknown): string {
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

export async function findRequestedJob(request: { requestId?: string; payload: unknown }): Promise<VideoJob | undefined> {
  if (!request.requestId) return undefined;
  const existing = await db.select().from(videoJobs).where(eq(videoJobs.requestId, request.requestId)).get();
  return existing ? verifyIdempotent(existing, hashRequest(request.payload)) : undefined;
}

function verifyIdempotent(job: VideoJob, hash: string): VideoJob {
  if (job.requestHash !== hash) {
    throw new JobError(409, 'IDEMPOTENCY_CONFLICT', 'This request ID was already used with different job settings.');
  }
  return job;
}

async function updateJob(id: string, values: Partial<NewVideoJob>): Promise<VideoJob> {
  const [job] = await db.update(videoJobs).set(values).where(eq(videoJobs.id, id)).returning();
  if (!job) throw new JobError(404, 'NOT_FOUND', 'Job not found');
  return job;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The provider request failed.';
}

function providerError(error: unknown): { message: string; raw?: string[] } {
  const raw: string[] = [];
  if (error !== null && typeof error === 'object') {
    if ('code' in error && typeof error.code === 'string') raw.push(`code: ${error.code}`);
    if ('requestId' in error && typeof error.requestId === 'string') raw.push(`request_id: ${error.requestId}`);
  }
  return { message: errorMessage(error), ...(raw.length ? { raw } : {}) };
}

function isLookupUnavailable(error: unknown): boolean {
  if (error === null || typeof error !== 'object' || !('statusCode' in error)) return false;
  if (error.statusCode === 404) return true;
  const code = 'code' in error ? String(error.code) : '';
  return error.statusCode === 400 && /invalid[\s_-]*task[\s_-]*id/i.test(`${errorMessage(error)} ${code}`);
}

function markLookupUnavailable(job: VideoJob, error: unknown): Promise<VideoJob> {
  return updateJob(job.id, {
    status: 'unknown',
    metadataJson: { ...job.metadataJson, providerLookupUnavailable: true },
    errorJson: {
      ...providerError(error),
      message: `The provider task is unavailable or outside its query window: ${errorMessage(error)} Automatic polling has stopped. The local job and any saved video files are preserved. Use Refresh to check again.`,
    },
  });
}

async function persistProviderResult(job: VideoJob, result: ProviderRefreshResult): Promise<VideoJob> {
  const outputs = result.outputs ?? job.outputsJson ?? [];
  const archiveState = result.status === 'succeeded' && getAdapter(job.provider).archiveOutputs && outputs.length
    ? (outputs.every((output) => output.storageKey) ? 'ready' : 'pending')
    : job.archiveState;
  const updated = await updateJob(job.id, {
    status: result.status, progressPct: result.progressPct,
    outputsJson: outputs, errorJson: result.error ?? null,
    submissionState: 'submitted', archiveState,
    metadataJson: { ...job.metadataJson, ...result.metadata, providerLookupUnavailable: false },
  });
  return saveOutputs(updated);
}

async function saveOutputs(job: VideoJob): Promise<VideoJob> {
  if (job.archiveState !== 'pending') return job;
  try {
    const outputs = await archiveOutputs(job.id, job.outputsJson ?? []);
    return await updateJob(job.id, {
      outputsJson: outputs, archiveState: 'ready', errorJson: null,
      metadataJson: { ...job.metadataJson, archiveError: null },
    });
  } catch (error) {
    // Signed URLs may expire between generation and the archival retry. Renew
    // them through the safe task-query endpoint without submitting anything.
    let outputs = job.outputsJson;
    let metadata = job.metadataJson;
    if (job.providerJobId) {
      try {
        const renewed = await getAdapter(job.provider).refresh(jobContext(job));
        if (renewed.status === 'succeeded' && renewed.outputs?.length) outputs = renewed.outputs;
        metadata = { ...metadata, ...renewed.metadata };
      } catch (lookupError) {
        if (isLookupUnavailable(lookupError)) {
          return markLookupUnavailable({ ...job, metadataJson: {
            ...job.metadataJson, archiveError: errorMessage(error),
          } }, lookupError);
        }
        // Keep the durable task ID and the original archive error for a later retry.
      }
    }
    return updateJob(job.id, {
      outputsJson: outputs,
      metadataJson: { ...metadata, archiveError: errorMessage(error) },
      errorJson: { message: 'Video generated, but saving a local copy failed. The server will retry saving it.' },
    });
  }
}

async function submitJob(job: VideoJob): Promise<VideoJob> {
  // The persisted claim, rather than a browser request or a process-local flag,
  // decides whether a paid request may be sent.
  const [claimed] = await db.update(videoJobs).set({ submissionState: 'submitting' })
    .where(and(
      eq(videoJobs.id, job.id), eq(videoJobs.submissionState, 'pending'),
      isNull(videoJobs.providerJobId), eq(videoJobs.status, 'queued')
    )).returning();
  if (!claimed) return getJob(job.id);

  const adapter = getAdapter(claimed.provider);
  let paidRequestStarted = false;
  try {
    const params = claimed.paramsJson ?? {};
    const operation = params.mode;
    let source: ProviderJobContext | undefined;
    if (operation === 'remix' || operation === 'extend' || operation === 'regenerate') {
      source = params.sourceJobSnapshot as ProviderJobContext | undefined;
      if (!source) source = jobContext(await getJob(String(params.sourceJobId)));
      if (source.status !== 'succeeded' || !source.providerJobId) {
        throw new JobError(400, 'INVALID_SOURCE', 'The source video is no longer available.');
      }
      if ((operation === 'remix' && !adapter.remix) || (operation === 'extend' && !adapter.extend) ||
        (operation === 'regenerate' && !adapter.regenerate)) {
        throw new JobError(400, 'UNSUPPORTED_OPERATION', 'This source operation is no longer supported by the provider.');
      }
    } else {
      await adapter.validateInput?.(jobContext(claimed));
    }
    paidRequestStarted = true;
    const result = operation === 'remix' && source && adapter.remix
      ? await adapter.remix(source, { prompt: claimed.prompt })
      : operation === 'extend' && source && adapter.extend
        ? await adapter.extend(source, {
          prompt: claimed.prompt,
          sourceAssetIndex: Number(params.sourceAssetIndex ?? 0),
          params,
        })
        : operation === 'regenerate' && source && adapter.regenerate
          ? await adapter.regenerate(source, {
            sourceAssetIndex: Number(params.sourceAssetIndex ?? 0),
            generateAudio: typeof params.generateAudio === 'boolean' ? params.generateAudio : undefined,
          })
          : await adapter.submit(jobContext(claimed));
    if (!result.providerJobId) throw new Error('The provider returned no task ID.');
    return await updateJob(job.id, {
      providerJobId: result.providerJobId, status: result.status,
      progressPct: result.progressPct, submissionState: 'submitted', errorJson: null,
    });
  } catch (error) {
    const definiteRejection = !paidRequestStarted ||
      (error !== null && typeof error === 'object' && 'definiteRejection' in error && error.definiteRejection === true);
    const details = providerError(error);
    return updateJob(job.id, definiteRejection ? {
      status: 'failed', submissionState: 'submitted', errorJson: details,
    } : {
      status: 'unknown', submissionState: 'uncertain',
      errorJson: { ...details, message: `Submission outcome is uncertain: ${details.message} Check the provider task list before creating another job. This request will not be retried automatically.` },
    });
  }
}

export function refreshJob(id: string): Promise<VideoJob> {
  const existing = refreshes.get(id);
  if (existing) return existing;
  const promise = withJobLock(id, async () => {
    const job = await getJob(id);
    if (job.status === 'succeeded') return saveOutputs(job);
    if (['failed', 'canceled'].includes(job.status)) return job;
    // Existing IDs, including rows migrated from the previous version, are
    // always queried. They must never enter the submission path again.
    if (job.providerJobId) {
      try {
        const adapter = getAdapter(job.provider);
        const result = await adapter.refresh(jobContext(job));
        return persistProviderResult(job, result);
      } catch (error) {
        if (isLookupUnavailable(error)) return markLookupUnavailable(job, error);
        // Querying is safe to retry: retain the known task ID and status.
        return updateJob(id, { errorJson: providerError(error) });
      }
    }
    if (job.submissionState === 'pending' && job.status === 'queued') return submitJob(job);
    return job;
  });
  refreshes.set(id, promise);
  void promise.finally(() => {
    if (refreshes.get(id) === promise) refreshes.delete(id);
  }).catch(() => {});
  return promise;
}

export function cancelJob(id: string): Promise<VideoJob> {
  return withJobLock(id, async () => {
    const job = await getJob(id);
    if (job.status === 'canceled') return job;
    if (job.submissionState === 'pending' && !job.providerJobId && job.status === 'queued') {
      const [canceled] = await db.update(videoJobs).set({ status: 'canceled' })
        .where(and(eq(videoJobs.id, id), eq(videoJobs.submissionState, 'pending'), isNull(videoJobs.providerJobId)))
        .returning();
      if (canceled) return canceled;
      throw new JobError(409, 'JOB_ACTIVE', 'Submission has started. Refresh the job before attempting cancellation.');
    }
    if (job.status !== 'queued' || !job.providerJobId) {
      throw new JobError(409, 'CANNOT_CANCEL', 'Only queued tasks can be canceled. Keep this job to track its provider outcome.');
    }
    const adapter = getAdapter(job.provider);
    if (!adapter.cancel) throw new JobError(400, 'UNSUPPORTED_OPERATION', 'This provider does not support canceling tasks.');
    try {
      const result = await adapter.cancel(jobContext(job));
      return persistProviderResult(job, result);
    } catch (error) {
      // Do not remove tracking information when cancellation is ambiguous.
      if (isLookupUnavailable(error)) await markLookupUnavailable(job, error);
      else await updateJob(id, { errorJson: { ...providerError(error), message: `Cancellation was not confirmed: ${errorMessage(error)} Refresh to check the task status.` } });
      throw new JobError(502, 'CANCEL_FAILED', 'Cancellation was not confirmed. The job remains tracked; refresh its status before trying again.');
    }
  });
}

export function deleteJob(id: string): Promise<void> {
  return withJobLock(id, async () => {
    const job = await getJob(id);
    const pending = job.status === 'queued' && job.submissionState === 'pending' && !job.providerJobId;
    if (!pending && (!['succeeded', 'failed', 'canceled'].includes(job.status) ||
      ['submitting', 'uncertain'].includes(job.submissionState))) {
      throw new JobError(409, 'JOB_ACTIVE', 'Active or uncertain jobs cannot be deleted. Cancel queued jobs first, or wait for their provider outcome.');
    }
    const dependent = await db.select({ id: videoJobs.id }).from(videoJobs).where(and(
      inArray(videoJobs.status, ['queued', 'running', 'unknown']),
      sql`json_extract(${videoJobs.paramsJson}, '$.sourceJobId') = ${id}`
    )).get();
    if (dependent) throw new JobError(409, 'SOURCE_IN_USE', 'This source video has an active derived job. Wait for it to complete before deleting the source.');
    if (job.providerJobId && ['succeeded', 'failed'].includes(job.status)) {
      try {
        await getAdapter(job.provider).delete(jobContext(job));
      } catch (error) {
        throw new JobError(502, 'DELETE_FAILED', errorMessage(error));
      }
    }
    const deleted = await db.delete(videoJobs).where(and(
      eq(videoJobs.id, id), eq(videoJobs.status, job.status),
      eq(videoJobs.submissionState, job.submissionState),
      ne(videoJobs.submissionState, 'submitting')
    )).returning({ id: videoJobs.id });
    if (!deleted.length) throw new JobError(409, 'JOB_ACTIVE', 'The job changed while deleting it. Refresh its status.');
  });
}

export async function recoverInterruptedSubmissions(): Promise<void> {
  await db.update(videoJobs).set({
    submissionState: 'uncertain', status: 'unknown',
    errorJson: { message: 'The server stopped during submission. Check the provider task list before creating another job. This request will not be retried automatically.' },
  }).where(and(eq(videoJobs.submissionState, 'submitting'), isNull(videoJobs.providerJobId)));
}

let workerTick: Promise<void> | undefined;

export function runJobWorkerTick(options: { concurrency?: number; onError?: (error: unknown) => void } = {}): Promise<void> {
  if (workerTick) return workerTick;
  workerTick = (async () => {
    const jobs = await db.select({ id: videoJobs.id }).from(videoJobs).where(and(
      sql`coalesce(json_extract(${videoJobs.metadataJson}, '$.providerLookupUnavailable'), 0) != 1`,
      or(
      and(inArray(videoJobs.status, ['queued', 'running']), ne(videoJobs.submissionState, 'uncertain')),
      and(eq(videoJobs.status, 'unknown'), isNotNull(videoJobs.providerJobId)),
      and(eq(videoJobs.status, 'succeeded'), eq(videoJobs.archiveState, 'pending'))
      )
    )).orderBy(asc(videoJobs.updatedAt)).limit(100);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(Math.max(options.concurrency ?? 4, 1), jobs.length) }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        try { await refreshJob(job.id); }
        catch (error) { options.onError?.(error); }
      }
    }));
  })().finally(() => { workerTick = undefined; });
  return workerTick;
}

export async function startJobWorker(options: {
  intervalMs?: number;
  concurrency?: number;
  onError?: (error: unknown) => void;
} = {}): Promise<() => Promise<void>> {
  await recoverInterruptedSubmissions();
  const tick = () => runJobWorkerTick(options).catch((error) => options.onError?.(error));
  void tick();
  const timer = setInterval(() => { void tick(); }, options.intervalMs ?? 5000);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await workerTick;
    await Promise.allSettled(locks.values());
  };
}
