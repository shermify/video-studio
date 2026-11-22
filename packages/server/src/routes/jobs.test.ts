import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, mock, test, type Mock } from 'node:test';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/tursodatabase/database';
import { migrate } from 'drizzle-orm/tursodatabase/migrator';
import type {
  CanonicalVideoAsset,
  CanonicalVideoJob,
  CreateJobRequest,
  ListJobsResponse,
} from '@video-studio/types';
import type { ProviderJobContext, ProviderRefreshResult } from '../providers/index.js';

const directory = await mkdtemp(join(tmpdir(), 'video-studio-db-'));
const databaseFile = join(directory, 'jobs.db');
const previousDatabaseFile = process.env.DB_FILE_NAME;
const previousUseStubs = process.env.USE_STUB_ADAPTERS;
const previousMediaDir = process.env.MEDIA_DIR;
process.env.DB_FILE_NAME = databaseFile;
process.env.USE_STUB_ADAPTERS = 'true';
process.env.MEDIA_DIR = join(directory, 'media');

// Import after configuring the isolated database and stub-only providers.
const { db } = await import('../db.js');
const { videoJobs } = await import('../schema.js');
const { jobsRoutes } = await import('./jobs.js');
const { getAdapter, SoraAdapterStub, VeoAdapterStub, MiniMaxAdapterStub, ProviderRequestError } = await import('../providers/index.js');
const lifecycle = await import('../services/job-lifecycle.js');
const app = Fastify();
const migrationConfig = {
  migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
};

before(async () => {
  await migrate(db, migrationConfig);
  // A repeated migration must leave an existing database usable.
  await migrate(db, migrationConfig);
  app.register(jobsRoutes, { prefix: '/api' });
  await app.ready();
});

beforeEach(async () => {
  mock.restoreAll();
  await db.delete(videoJobs);
});

after(async () => {
  mock.restoreAll();
  await app.close();
  await db.$client.close();
  await rm(directory, { recursive: true, force: true });
  if (previousDatabaseFile === undefined) delete process.env.DB_FILE_NAME;
  else process.env.DB_FILE_NAME = previousDatabaseFile;
  if (previousUseStubs === undefined) delete process.env.USE_STUB_ADAPTERS;
  else process.env.USE_STUB_ADAPTERS = previousUseStubs;
  if (previousMediaDir === undefined) delete process.env.MEDIA_DIR;
  else process.env.MEDIA_DIR = previousMediaDir;
});

async function createJob(payload: CreateJobRequest): Promise<CanonicalVideoJob> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/jobs',
    payload,
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json<{ data: CanonicalVideoJob }>().data;
}

async function refreshJob(id: string): Promise<CanonicalVideoJob> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/jobs/${id}/refresh`,
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json<{ data: CanonicalVideoJob }>().data;
}

test('stores job defaults, JSON and dates in a durable local database', async () => {
  const params = { seed: 42, nested: { enabled: true }, choices: ['a', 'b'] };
  const assets: CanonicalVideoAsset[] = [
    { kind: 'video/mp4', uri: 'https://example.com/input.mp4' },
  ];
  const job = await createJob({
    provider: 'sora',
    prompt: 'A quiet lake',
    mode: 'generate',
    params,
    assets,
  });

  assert.match(job.id, /^[0-9a-f-]{36}$/);
  assert.equal(job.status, 'queued');
  assert.equal(job.providerJobId, null);
  assert.equal(job.progressPct, null);
  assert.deepEqual(job.outputs, []);
  assert.equal(job.error, null);
  assert.equal(new Date(job.createdAt).toISOString(), job.createdAt);
  assert.equal(new Date(job.updatedAt).toISOString(), job.updatedAt);
  assert.deepEqual(job.params, { ...params, mode: 'generate', assets });

  // Read through a separately opened connection to prove file persistence.
  const reopened = drizzle(databaseFile);
  try {
    const stored = await reopened
      .select()
      .from(videoJobs)
      .where(eq(videoJobs.id, job.id))
      .get();
    assert.ok(stored);
    assert.deepEqual(stored.paramsJson, job.params);
    assert.equal(stored.createdAt.toISOString(), job.createdAt);
  } finally {
    await reopened.$client.close();
  }

  const retrieved = await app.inject(`/api/jobs/${job.id}`);
  assert.equal(retrieved.statusCode, 200);
  assert.deepEqual(retrieved.json().data, job);
  const deleted = await app.inject({ method: 'DELETE', url: `/api/jobs/${job.id}` });
  assert.equal(deleted.statusCode, 200);
  assert.deepEqual(deleted.json().data, { id: job.id, deleted: true });
  assert.equal((await app.inject(`/api/jobs/${job.id}`)).statusCode, 404);
});

test('filters and paginates by creation time with stable ID ordering', async () => {
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  await db.insert(videoJobs).values([
    { id: 'a', provider: 'sora', prompt: 'Blue SKY', createdAt },
    { id: 'z', provider: 'sora', prompt: 'Blue sky', createdAt },
    {
      id: 'm',
      provider: 'sora',
      prompt: 'Blue sky',
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    },
    { id: 'other-provider', provider: 'veo', prompt: 'Blue sky', createdAt },
    { id: 'other-status', provider: 'sora', status: 'failed', prompt: 'Blue sky', createdAt },
    { id: 'literal', provider: 'sora', prompt: '100%_\\ completed', createdAt },
    { id: 'wildcard', provider: 'sora', prompt: '100XXX completed', createdAt },
  ]);

  const base = '/api/jobs?provider=sora&status=queued&q=SKY&limit=2';
  const firstResponse = await app.inject(base);
  assert.equal(firstResponse.statusCode, 200, firstResponse.body);
  const first = firstResponse.json<ListJobsResponse>();
  assert.deepEqual(first.data.map((job) => job.id), ['m', 'z']);
  assert.deepEqual(first.meta, { total: 3, limit: 2, nextCursor: 'z' });

  const second = (await app.inject(`${base}&cursor=z`)).json<ListJobsResponse>();
  assert.deepEqual(second.data.map((job) => job.id), ['a']);
  assert.deepEqual(second.meta, { total: 3, limit: 2, nextCursor: null });
  const missingCursor = (await app.inject(`${base}&cursor=missing`)).json<ListJobsResponse>();
  assert.deepEqual(missingCursor.data, []);
  assert.equal(missingCursor.meta.total, 3);

  const literalResponse = await app.inject(`/api/jobs?q=${encodeURIComponent('%_\\')}`);
  assert.equal(literalResponse.statusCode, 200, literalResponse.body);
  const literal = literalResponse.json<ListJobsResponse>();
  assert.deepEqual(literal.data.map((job) => job.id), ['literal']);
});

test('persists provider updates, output and error JSON, and update timestamps', async () => {
  const sora = getAdapter('sora');
  const submitted = mock.method(sora, 'submit', async () => ({
    providerJobId: 'provider-job-1',
    status: 'running' as const,
    progressPct: 5,
  }));
  const outputs: CanonicalVideoAsset[] = [
    { kind: 'video/mp4', uri: 'https://example.com/output.mp4', bytesBase64: 'dmlkZW8=' },
  ];
  const refreshed = mock.method(sora, 'refresh', async () => ({
    status: 'succeeded' as const,
    progressPct: 100,
    outputs,
  }));
  const created = await createJob({ provider: 'sora', prompt: 'Keep these params', params: { seed: 9 } });
  // Use a known old timestamp to avoid timer-dependent assertions.
  await db.update(videoJobs).set({ updatedAt: new Date(0) }).where(eq(videoJobs.id, created.id));
  const running = await refreshJob(created.id);
  assert.equal(submitted.mock.callCount(), 1);
  assert.equal(running.providerJobId, 'provider-job-1');
  assert.equal(running.status, 'running');
  assert.equal(running.progressPct, 5);
  assert.ok(Date.parse(running.updatedAt) > 0);
  assert.equal(running.createdAt, created.createdAt);

  const completed = await refreshJob(created.id);
  assert.equal(refreshed.mock.callCount(), 1);
  assert.equal(completed.status, 'succeeded');
  assert.deepEqual(completed.outputs, outputs);
  assert.deepEqual(completed.params, { seed: 9 });
  await refreshJob(created.id);
  assert.equal(refreshed.mock.callCount(), 1, 'terminal jobs should not call a provider again');

  const failed = await createJob({ provider: 'sora', prompt: 'Failure detail' });
  await refreshJob(failed.id);
  const error = { message: 'Provider rejected request', raw: ['reason', 'detail'] };
  refreshed.mock.mockImplementation(async () => ({ status: 'failed' as const, progressPct: null, error }));
  const failure = await refreshJob(failed.id);
  assert.equal(failure.status, 'failed');
  assert.equal(failure.progressPct, null);
  assert.deepEqual(failure.error, error);
  const stored = await db.select().from(videoJobs).where(eq(videoJobs.id, failed.id)).get();
  assert.deepEqual(stored?.errorJson, error);
});

test('persists remix and extension jobs with their source metadata', async () => {
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const outputs: CanonicalVideoAsset[] = [{ kind: 'video/mp4', uri: 'https://example.com/source.mp4' }];
  await db.insert(videoJobs).values([
    {
      id: 'sora-source', provider: 'sora', providerJobId: 'sora-source-provider',
      prompt: 'Original Sora prompt', status: 'succeeded', paramsJson: { seed: 11, sourceJobSnapshot: { previousAncestor: true } },
      outputsJson: outputs, createdAt,
    },
    {
      id: 'veo-source', provider: 'veo', providerJobId: 'operations/veo-source',
      prompt: 'Original Veo prompt', status: 'succeeded', paramsJson: { duration: 4 },
      outputsJson: outputs, createdAt,
    },
  ]);
  const sora = getAdapter('sora');
  const veo = getAdapter('veo');
  assert.ok(sora instanceof SoraAdapterStub);
  assert.ok(veo instanceof VeoAdapterStub);
  const remix = mock.method(sora, 'remix', async () => ({
    providerJobId: 'sora-remix-provider', status: 'running' as const, progressPct: 0,
  }));
  const extend = mock.method(veo, 'extend', async () => ({
    providerJobId: 'operations/veo-extended', status: 'queued' as const, progressPct: null,
  }));

  const remixResponse = await app.inject({
    method: 'POST', url: '/api/jobs/sora-source/remix', payload: { prompt: 'Changed prompt' },
  });
  assert.equal(remixResponse.statusCode, 201, remixResponse.body);
  const remixJob = remixResponse.json<{ data: CanonicalVideoJob }>().data;
  assert.equal(remixJob.prompt, 'Changed prompt');
  assert.equal(remixJob.providerJobId, null);
  assert.equal(remix.mock.callCount(), 0, 'creation persists the job before upstream submission');
  assert.equal(remixJob.params.mode, 'remix');
  assert.equal(remixJob.params.sourceJobId, 'sora-source');
  assert.equal(remixJob.params.seed, 11);
  const snapshot = remixJob.params.sourceJobSnapshot as ProviderJobContext;
  assert.equal(snapshot.params.sourceJobSnapshot, undefined, 'source snapshots do not recursively copy ancestors');
  assert.equal((await refreshJob(remixJob.id)).providerJobId, 'sora-remix-provider');
  assert.equal(remix.mock.callCount(), 1);

  const extendResponse = await app.inject({
    method: 'POST', url: '/api/jobs/veo-source/extend',
    payload: { sourceAssetIndex: 0, params: { duration: 8, nested: { sound: true } } },
  });
  assert.equal(extendResponse.statusCode, 201, extendResponse.body);
  const extensionJob = extendResponse.json<{ data: CanonicalVideoJob }>().data;
  assert.equal(extensionJob.prompt, 'Original Veo prompt');
  assert.equal(extensionJob.providerJobId, null);
  assert.equal(extend.mock.callCount(), 0);
  assert.equal(extensionJob.params.duration, 8);
  assert.deepEqual(extensionJob.params.nested, { sound: true });
  const submittedExtension = await refreshJob(extensionJob.id);
  assert.equal(submittedExtension.providerJobId, 'operations/veo-extended');
  assert.equal(extend.mock.callCount(), 1);
  const persisted = await app.inject(`/api/jobs/${extensionJob.id}`);
  assert.deepEqual(persisted.json().data, submittedExtension);
});

test('deduplicates concurrent creation retries and concurrent paid submissions', async () => {
  const requestId = randomUUID();
  const payload: CreateJobRequest = { provider: 'sora', prompt: 'One paid task', requestId };
  const creations = await Promise.all(Array.from({ length: 8 }, () => createJob(payload)));
  assert.equal(new Set(creations.map((job) => job.id)).size, 1);
  assert.equal((await db.select().from(videoJobs)).length, 1);
  const conflict = await app.inject({
    method: 'POST', url: '/api/jobs', payload: { ...payload, prompt: 'Different paid task' },
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.json().error.code, 'IDEMPOTENCY_CONFLICT');

  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const submit = mock.method(getAdapter('sora'), 'submit', async () => {
    started.resolve();
    await release.promise;
    return { providerJobId: 'only-upstream-task', status: 'running' as const };
  });
  const first = refreshJob(creations[0].id);
  await started.promise;
  const others = Array.from({ length: 8 }, () => refreshJob(creations[0].id));
  const storedDuringRequest = await lifecycle.getJob(creations[0].id);
  assert.equal(storedDuringRequest.submissionState, 'submitting');
  release.resolve();
  const refreshed = await Promise.all([first, ...others]);
  assert.equal(submit.mock.callCount(), 1);
  assert.ok(refreshed.every((job) => job.providerJobId === 'only-upstream-task'));
  assert.equal((await lifecycle.getJob(creations[0].id)).submissionState, 'submitted');
});

test('never retries timed-out submissions or interrupted submissions after recovery', async () => {
  const submit = mock.method(getAdapter('sora'), 'submit', async () => {
    throw new Error('request timed out after sending');
  });
  const job = await createJob({ provider: 'sora', prompt: 'Ambiguous request' });
  const unknown = await refreshJob(job.id);
  assert.equal(unknown.status, 'unknown');
  assert.equal(unknown.metadata?.submissionState, 'uncertain');
  assert.match(unknown.error?.message ?? '', /will not be retried automatically/);
  assert.equal(unknown.actions.canDelete, false);
  await refreshJob(job.id);
  await lifecycle.runJobWorkerTick();
  await lifecycle.runJobWorkerTick();
  assert.equal(submit.mock.callCount(), 1);

  const interrupted = await createJob({ provider: 'sora', prompt: 'Server stopped during POST' });
  await db.update(videoJobs).set({ submissionState: 'submitting' }).where(eq(videoJobs.id, interrupted.id));
  await lifecycle.recoverInterruptedSubmissions();
  await lifecycle.runJobWorkerTick();
  const recovered = await lifecycle.getJob(interrupted.id);
  assert.equal(recovered.status, 'unknown');
  assert.equal(recovered.submissionState, 'uncertain');
  assert.equal(submit.mock.callCount(), 1);
  const reopened = drizzle(databaseFile);
  try {
    const durable = await reopened.select().from(videoJobs).where(eq(videoJobs.id, interrupted.id)).get();
    assert.equal(durable?.submissionState, 'uncertain');
  } finally {
    await reopened.$client.close();
  }
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/jobs/${job.id}` })).statusCode, 409);
});

test('records definite rejection and only queries legacy jobs with existing task IDs', async () => {
  const submit = mock.method(getAdapter('sora'), 'submit', async () => {
    throw new ProviderRequestError('Account has insufficient credit', {
      definiteRejection: true, statusCode: 402, code: 'INSUFFICIENT_CREDIT', requestId: 'trace-request-id',
    });
  });
  const rejected = await createJob({ provider: 'sora', prompt: 'Rejected before acceptance' });
  const failed = await refreshJob(rejected.id);
  assert.equal(failed.status, 'failed');
  assert.deepEqual(failed.error?.raw, ['code: INSUFFICIENT_CREDIT', 'request_id: trace-request-id']);
  await refreshJob(rejected.id);
  assert.equal(submit.mock.callCount(), 1);
  const refresh = mock.method(getAdapter('sora'), 'refresh', async () => ({ status: 'running' as const }));
  const [legacy] = await db.insert(videoJobs).values({
    provider: 'sora', prompt: 'Old job', providerJobId: 'existing-provider-task', status: 'queued',
  }).returning();
  await lifecycle.runJobWorkerTick();
  assert.equal(submit.mock.callCount(), 1);
  assert.equal(refresh.mock.callCount(), 1);
  assert.equal((await lifecycle.getJob(legacy.id)).submissionState, 'submitted');
});

test('the worker submits and polls without browser refreshes, with bounded concurrency', async () => {
  let active = 0;
  let maximum = 0;
  const submit = mock.method(getAdapter('sora'), 'submit', async (job: ProviderJobContext) => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 15));
    active--;
    return { providerJobId: `provider-${job.id}`, status: 'queued' as const };
  });
  const refresh = mock.method(getAdapter('sora'), 'refresh', async () => ({
    status: 'succeeded' as const,
    outputs: [{ kind: 'video/mp4' as const, uri: 'https://example.com/completed.mp4' }],
    metadata: { resolution: '768P', usage: { output_seconds: 5 } },
  }));
  const jobs = await Promise.all(Array.from({ length: 5 }, (_, index) => createJob({
    provider: 'sora', prompt: `Background ${index}`,
  })));
  const stop = await lifecycle.startJobWorker({ intervalMs: 10, concurrency: 2 });
  try {
    const deadline = Date.now() + 2000;
    while ((await lifecycle.getJob(jobs[4].id)).status !== 'succeeded' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.ok((await db.select().from(videoJobs)).every((job) => job.status === 'succeeded'));
    assert.equal(submit.mock.callCount(), 5);
    assert.equal(refresh.mock.callCount(), 5);
    assert.equal(maximum, 2);
    assert.deepEqual((await lifecycle.getJob(jobs[0].id)).metadataJson?.usage, { output_seconds: 5 });
  } finally {
    await stop();
  }
});

test('cancellation and deletion cannot race a submission into an untracked task', async () => {
  const minimax = getAdapter('minimax');
  assert.ok(minimax instanceof MiniMaxAdapterStub);
  const local = await createJob({ provider: 'minimax', prompt: 'Cancel before submission' });
  const submit = mock.method(minimax, 'submit', async () => ({ providerJobId: 'queued-upstream', status: 'queued' as const, progressPct: null }));
  const localCanceled = await app.inject({ method: 'POST', url: `/api/jobs/${local.id}/cancel` });
  assert.equal(localCanceled.statusCode, 200);
  assert.equal(localCanceled.json().data.status, 'canceled');
  await lifecycle.runJobWorkerTick();
  assert.equal(submit.mock.callCount(), 0);

  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  submit.mock.mockImplementation(async () => {
    started.resolve();
    await release.promise;
    return { providerJobId: 'queued-upstream', status: 'queued' as const, progressPct: null };
  });
  const remote = await createJob({ provider: 'minimax', prompt: 'Track the submitted task' });
  const submitting = refreshJob(remote.id);
  await started.promise;
  const deleting = app.inject({ method: 'DELETE', url: `/api/jobs/${remote.id}` });
  const canceling = app.inject({ method: 'POST', url: `/api/jobs/${remote.id}/cancel` });
  release.resolve();
  await submitting;
  const [deleted, canceled] = await Promise.all([deleting, canceling]);
  assert.equal(deleted.statusCode, 409);
  assert.equal(canceled.statusCode, 200, canceled.body);
  assert.equal(canceled.json().data.status, 'canceled');
  assert.equal((await lifecycle.getJob(remote.id)).providerJobId, 'queued-upstream');
  assert.equal(submit.mock.callCount(), 1);

  const running = await createJob({ provider: 'minimax', prompt: 'Already running' });
  await db.update(videoJobs).set({
    status: 'running', providerJobId: 'running-upstream', submissionState: 'submitted',
  }).where(eq(videoJobs.id, running.id));
  assert.equal((await app.inject({ method: 'POST', url: `/api/jobs/${running.id}/cancel` })).statusCode, 409);
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/jobs/${running.id}` })).statusCode, 409);
});

test('regeneration queues once, preserves the source snapshot, and protects active sources', async () => {
  const minimax = getAdapter('minimax');
  assert.ok(minimax instanceof MiniMaxAdapterStub);
  const source = await createJob({
    provider: 'minimax', prompt: 'Keep this exact prompt',
    params: { model: 'MiniMax-H3-Highspeed', resolution: '768P', duration: 6, generateAudio: true },
    inputs: [{ kind: 'image', role: 'reference_image', uri: 'https://example.com/reference.png' }],
  });
  await db.update(videoJobs).set({
    status: 'succeeded', submissionState: 'submitted', providerJobId: 'original-task',
    outputsJson: [{ kind: 'video/mp4', uri: 'https://example.com/original.mp4' }],
    metadataJson: { resolution: '768P' },
  }).where(eq(videoJobs.id, source.id));
  const regenerate = mock.method(minimax, 'regenerate', async (context: ProviderJobContext) => {
    assert.equal(context.prompt, 'Keep this exact prompt');
    assert.deepEqual(context.inputs, source.inputs);
    return { providerJobId: 'regenerated-task', status: 'queued' as const, progressPct: null };
  });
  const requestId = randomUUID();
  const responses = await Promise.all(Array.from({ length: 4 }, () => app.inject({
    method: 'POST', url: `/api/jobs/${source.id}/regenerate`, payload: { requestId, generateAudio: false },
  })));
  assert.ok(responses.every((response) => response.statusCode === 201), responses.map((response) => response.body).join('\n'));
  const children = responses.map((response) => response.json<{ data: CanonicalVideoJob }>().data);
  assert.equal(new Set(children.map((job) => job.id)).size, 1);
  assert.equal(regenerate.mock.callCount(), 0);
  const child = children[0];
  assert.equal(child.params.resolution, '2K');
  assert.equal(child.params.model, 'MiniMax-H3');
  assert.equal(child.params.generateAudio, false);
  const blockedDelete = await app.inject({ method: 'DELETE', url: `/api/jobs/${source.id}` });
  assert.equal(blockedDelete.statusCode, 409);
  assert.equal(blockedDelete.json().error.code, 'SOURCE_IN_USE');
  await refreshJob(child.id);
  assert.equal(regenerate.mock.callCount(), 1);
  assert.equal((await lifecycle.getJob(child.id)).providerJobId, 'regenerated-task');
});

test('archive retries renew expiring URLs and serve local output with Range support', async () => {
  const minimax = getAdapter('minimax');
  assert.ok(minimax instanceof MiniMaxAdapterStub);
  const archiveDescriptor = Object.getOwnPropertyDescriptor(minimax, 'archiveOutputs')!;
  Object.defineProperty(minimax, 'archiveOutputs', { ...archiveDescriptor, value: true });
  try {
    const job = await createJob({ provider: 'minimax', prompt: 'Archive this result' });
    await db.update(videoJobs).set({
      providerJobId: 'archived-upstream', submissionState: 'submitted', status: 'succeeded', archiveState: 'pending',
      outputsJson: [{ kind: 'video/mp4', uri: 'https://example.com/expired.mp4' }],
    }).where(eq(videoJobs.id, job.id));
    const query = mock.method(minimax, 'refresh', async () => ({
      status: 'succeeded' as const,
      outputs: [{ kind: 'video/mp4' as const, uri: 'https://example.com/renewed.mp4' }],
    }));
    const bytes = Buffer.from('0123456789-fake-mp4-bytes');
    const fetchMock = mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0]) => {
      if (String(input).includes('expired')) return new Response(null, { status: 403 });
      return new Response(bytes, { status: 200, headers: { 'content-type': 'video/mp4' } });
    });
    await lifecycle.runJobWorkerTick();
    const pending = await lifecycle.getJob(job.id);
    assert.equal(pending.status, 'succeeded');
    assert.equal(pending.archiveState, 'pending');
    assert.match(String(pending.metadataJson?.archiveError), /download/);
    assert.equal(pending.outputsJson?.[0].uri, 'https://example.com/renewed.mp4');
    assert.equal(query.mock.callCount(), 1);
    await lifecycle.runJobWorkerTick();
    const archived = await lifecycle.getJob(job.id);
    assert.equal(archived.archiveState, 'ready');
    assert.ok(archived.outputsJson?.[0].storageKey);
    assert.equal(archived.errorJson, null);
    const range = await app.inject({
      url: `/api/jobs/${job.id}/content`, headers: { range: 'bytes=2-5' },
    });
    assert.equal(range.statusCode, 206);
    assert.equal(range.body, '2345');
    assert.equal(range.headers['content-range'], `bytes 2-5/${bytes.length}`);
    const download = await app.inject(`/api/jobs/${job.id}/content?download=1`);
    assert.equal(download.statusCode, 200);
    assert.deepEqual(download.rawPayload, bytes);
    assert.match(String(download.headers['content-disposition']), /attachment/);
    assert.equal(fetchMock.mock.callCount(), 2, 'local reads do not request the provider again');
  } finally {
    Object.defineProperty(minimax, 'archiveOutputs', archiveDescriptor);
  }
});

test('source deletion waits for an operation being queued and retains its upstream source', async () => {
  const minimax = getAdapter('minimax');
  assert.ok(minimax instanceof MiniMaxAdapterStub);
  const source = await createJob({
    provider: 'minimax', prompt: 'Source remains available', params: { resolution: '768P' },
  });
  await db.update(videoJobs).set({
    status: 'succeeded', submissionState: 'submitted', providerJobId: 'retained-provider-source',
    outputsJson: [{ kind: 'video/mp4', uri: 'https://example.com/source.mp4' }],
  }).where(eq(videoJobs.id, source.id));
  const validating = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  mock.method(minimax, 'validateRegeneration', async () => {
    validating.resolve();
    await release.promise;
  });
  const upstreamDelete = mock.method(minimax, 'delete');
  const queuing = app.inject({ method: 'POST', url: `/api/jobs/${source.id}/regenerate`, payload: {} });
  await validating.promise;
  const deleting = app.inject({ method: 'DELETE', url: `/api/jobs/${source.id}` });
  release.resolve();
  assert.equal((await queuing).statusCode, 201);
  assert.equal((await deleting).statusCode, 409);
  assert.equal(upstreamDelete.mock.callCount(), 0);
  assert.equal((await lifecycle.getJob(source.id)).providerJobId, 'retained-provider-source');
});

test('the worker completes regeneration from H3 Max without inheriting Max-only output settings', async () => {
  const source = await createJob({
    provider: 'minimax', prompt: 'Original H3 Max scene',
    params: { model: 'MiniMax-H3-Max', resolution: '768P', duration: 8, aspectRatio: '16:9', promptExpansionMode: 'quality' },
  });
  await db.update(videoJobs).set({
    status: 'succeeded', submissionState: 'submitted', providerJobId: 'h3-max-source',
    outputsJson: [{ kind: 'video/mp4', uri: 'https://example.com/h3-max.mp4' }],
  }).where(eq(videoJobs.id, source.id));
  const response = await app.inject({ method: 'POST', url: `/api/jobs/${source.id}/regenerate`, payload: {} });
  assert.equal(response.statusCode, 201, response.body);
  const child = response.json<{ data: CanonicalVideoJob }>().data;
  assert.equal(child.params.promptExpansionMode, undefined);
  assert.equal(child.params.extra, undefined);
  const snapshot = child.params.sourceJobSnapshot as ProviderJobContext;
  assert.equal(snapshot.params.promptExpansionMode, 'quality');
  for (let index = 0; index < 4; index++) await lifecycle.runJobWorkerTick();
  const completed = await lifecycle.getJob(child.id);
  assert.equal(completed.status, 'succeeded', JSON.stringify(completed.errorJson));
  assert.equal(completed.paramsJson?.model, 'MiniMax-H3');
  assert.equal(completed.paramsJson?.resolution, '2K');
});

test('cancellation persists and archives a task that completed before cancellation', async () => {
  const minimax = getAdapter('minimax');
  assert.ok(minimax instanceof MiniMaxAdapterStub);
  const descriptor = Object.getOwnPropertyDescriptor(minimax, 'archiveOutputs')!;
  Object.defineProperty(minimax, 'archiveOutputs', { ...descriptor, value: true });
  try {
    const job = await createJob({ provider: 'minimax', prompt: 'Completed while canceling' });
    await db.update(videoJobs).set({
      status: 'queued', submissionState: 'submitted', providerJobId: 'already-complete-task',
    }).where(eq(videoJobs.id, job.id));
    const cancel = mock.method(minimax, 'cancel', async () => ({
      status: 'succeeded' as const, progressPct: 100,
      outputs: [{ kind: 'video/mp4' as const, uri: 'https://example.com/cancel-completed.mp4' }],
      metadata: { resolution: '768P', usage: { output_seconds: 5 } },
    }));
    const submit = mock.method(minimax, 'submit');
    const bytes = Buffer.from('completed-video-during-cancellation');
    mock.method(globalThis, 'fetch', async () => new Response(bytes));
    const response = await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/cancel` });
    assert.equal(response.statusCode, 200, response.body);
    const completed = response.json<{ data: CanonicalVideoJob }>().data;
    assert.equal(completed.status, 'succeeded');
    assert.equal(completed.progressPct, 100);
    assert.equal(completed.providerJobId, 'already-complete-task');
    assert.equal(completed.metadata?.resolution, '768P');
    assert.deepEqual(completed.metadata?.usage, { output_seconds: 5 });
    assert.equal(completed.metadata?.archiveState, 'ready');
    assert.ok(completed.outputs[0].storageKey);
    assert.equal(cancel.mock.callCount(), 1);
    assert.equal(submit.mock.callCount(), 0);
    const output = await app.inject(`/api/jobs/${job.id}/content`);
    assert.deepEqual(output.rawPayload, bytes);
  } finally {
    Object.defineProperty(minimax, 'archiveOutputs', descriptor);
  }
});

test('confirmed cancel-delete races retain the provider ID and explanatory outcome', async () => {
  const minimax = getAdapter('minimax');
  assert.ok(minimax instanceof MiniMaxAdapterStub);
  const job = await createJob({ provider: 'minimax', prompt: 'Keep a raced deletion record' });
  await db.update(videoJobs).set({
    status: 'queued', submissionState: 'submitted', providerJobId: 'deleted-upstream-task',
  }).where(eq(videoJobs.id, job.id));
  const message = 'The task completed before cancellation and its provider record was deleted.';
  mock.method(minimax, 'cancel', async () => ({
    status: 'canceled' as const,
    metadata: { providerCancelAction: 'deleted' },
    error: { message },
  }));
  const response = await app.inject({ method: 'POST', url: `/api/jobs/${job.id}/cancel` });
  assert.equal(response.statusCode, 200, response.body);
  const canceled = response.json<{ data: CanonicalVideoJob }>().data;
  assert.equal(canceled.status, 'canceled');
  assert.equal(canceled.providerJobId, 'deleted-upstream-task');
  assert.equal(canceled.metadata?.providerCancelAction, 'deleted');
  assert.equal(canceled.error?.message, message);
  await lifecycle.runJobWorkerTick();
  assert.equal((await lifecycle.getJob(job.id)).providerJobId, 'deleted-upstream-task');
});

test('unavailable provider lookups stop automatic polling but manual refresh can recover', async () => {
  const minimax = getAdapter('minimax');
  assert.ok(minimax instanceof MiniMaxAdapterStub);
  for (const [statusCode, message] of [[400, 'invalid task_id: outside the last 7 days'], [404, 'Task not found']] as const) {
    const job = await createJob({ provider: 'minimax', prompt: `Expired lookup ${statusCode}` });
    await db.update(videoJobs).set({
      status: 'running', providerJobId: `expired-${statusCode}`, submissionState: 'submitted',
    }).where(eq(videoJobs.id, job.id));
    const refresh: Mock<(job: ProviderJobContext) => Promise<ProviderRefreshResult>> = mock.method(minimax, 'refresh', async (): Promise<ProviderRefreshResult> => {
      throw new ProviderRequestError(message, { statusCode, definiteRejection: true });
    });
    await lifecycle.runJobWorkerTick();
    const unavailable = await lifecycle.getJob(job.id);
    assert.equal(unavailable.status, 'unknown');
    assert.equal(unavailable.metadataJson?.providerLookupUnavailable, true);
    assert.equal(unavailable.providerJobId, `expired-${statusCode}`);
    assert.match(unavailable.errorJson?.message ?? '', /Automatic polling has stopped/);
    await lifecycle.runJobWorkerTick();
    await lifecycle.runJobWorkerTick();
    assert.equal(refresh.mock.callCount(), 1);
    refresh.mock.mockImplementation(async () => ({ status: 'running' as const, progressPct: null }));
    const recovered = await refreshJob(job.id);
    assert.equal(recovered.status, 'running');
    assert.equal(recovered.metadata?.providerLookupUnavailable, false);
    await lifecycle.runJobWorkerTick();
    assert.equal(refresh.mock.callCount(), 3);
    refresh.mock.restore();
    await db.delete(videoJobs).where(eq(videoJobs.id, job.id));
  }
});

test('archival does not endlessly retry a provider record outside its query window', async () => {
  const minimax = getAdapter('minimax');
  assert.ok(minimax instanceof MiniMaxAdapterStub);
  const descriptor = Object.getOwnPropertyDescriptor(minimax, 'archiveOutputs')!;
  Object.defineProperty(minimax, 'archiveOutputs', { ...descriptor, value: true });
  try {
    const job = await createJob({ provider: 'minimax', prompt: 'Expired archival source' });
    await db.update(videoJobs).set({
      status: 'succeeded', submissionState: 'submitted', providerJobId: 'expired-archive-task',
      archiveState: 'pending', outputsJson: [{ kind: 'video/mp4', uri: 'https://example.com/no-longer-available.mp4' }],
    }).where(eq(videoJobs.id, job.id));
    const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(null, { status: 403 }));
    const refresh = mock.method(minimax, 'refresh', async () => {
      throw new ProviderRequestError('invalid task id', { statusCode: 400, definiteRejection: true });
    });
    await lifecycle.runJobWorkerTick();
    const unavailable = await lifecycle.getJob(job.id);
    assert.equal(unavailable.status, 'unknown');
    assert.equal(unavailable.metadataJson?.providerLookupUnavailable, true);
    assert.equal(unavailable.archiveState, 'pending');
    assert.equal(unavailable.outputsJson?.length, 1);
    await lifecycle.runJobWorkerTick();
    assert.equal(fetchMock.mock.callCount(), 1);
    assert.equal(refresh.mock.callCount(), 1);
  } finally {
    Object.defineProperty(minimax, 'archiveOutputs', descriptor);
  }
});
