import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { MediaInput, UploadedMedia } from '@video-studio/types';
import { MiniMaxAdapter, normalizeMiniMaxParams, parseMiniMaxJson } from './minimax.js';
import { MiniMaxAdapterStub } from './minimax-stub.js';
import { providerCatalog } from './catalog.js';
import { ProviderRequestError, type ProviderJobContext } from './types.js';

const job = (patch: Partial<ProviderJobContext> = {}): ProviderJobContext => ({
  id: 'local-job', providerJobId: null, prompt: '  Preserve the exact prompt.  ',
  params: { model: 'MiniMax-H3', resolution: '768P', duration: 5, aspectRatio: '16:9', generateAudio: true },
  status: 'queued', outputs: [], ...patch,
});
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});
const remoteInput = (kind: MediaInput['kind'], role: MediaInput['role']): MediaInput => ({
  kind, role, uri: `https://example.com/reference.${kind === 'image' ? 'png' : kind === 'audio' ? 'mp3' : 'mp4'}`,
});

function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>): typeof fetch {
  return ((url, init) => handler(String(url), init ?? {})) as typeof fetch;
}

test('catalog advertises all H3 variants and model-specific limits', () => {
  const models = providerCatalog.minimax.models!;
  assert.equal(models.length, 4);
  for (const model of models) {
    assert.equal(model.durations.at(-1), 15);
    assert.equal(model.durations[0], model.id === 'MiniMax-H3-Max' ? 5 : 4);
    assert.equal(model.resolutions.includes('2K'), model.id === 'MiniMax-H3');
    assert.ok(model.supportsAudio);
  }
  assert.ok(providerCatalog.minimax.capabilities.referenceAudio);
  assert.ok(new MiniMaxAdapterStub().metadata.isStub);
});

test('builds text, last-frame-only and mixed-reference requests without changing prompts', async () => {
  const requests: Record<string, unknown>[] = [];
  const adapter = new MiniMaxAdapter({ apiKey: 'fake-test-key', fetch: fakeFetch((url, init) => {
    assert.equal(url, 'https://api.minimax.io/v2/video_generation');
    assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer fake-test-key');
    assert.ok(init.signal);
    requests.push(JSON.parse(String(init.body)));
    return response({ task_id: '9223372036854775807' });
  }) });
  for (const inputs of [
    [], [remoteInput('image', 'last_frame')],
    [remoteInput('image', 'reference_image'), remoteInput('video', 'reference_video'), remoteInput('audio', 'reference_audio')],
  ]) {
    const result = await adapter.submit(job({ inputs }));
    assert.equal(result.providerJobId, '9223372036854775807');
    assert.equal(result.status, 'queued');
    assert.equal(result.progressPct, null);
  }
  assert.deepEqual(requests[0], {
    model: 'MiniMax-H3', resolution: '768P', duration: 5, ratio: '16:9', generate_audio: true,
    content: [{ type: 'text', text: job().prompt }],
  });
  assert.equal(requests[1].ratio, 'adaptive');
  assert.deepEqual((requests[1].content as unknown[])[1], {
    type: 'image_url', image_url: { url: 'https://example.com/reference.png' }, role: 'last_frame',
  });
  assert.deepEqual((requests[2].content as { role?: string }[]).slice(1).map((item) => item.role), ['reference_image', 'reference_video', 'reference_audio']);
});

test('rejects invalid combinations before any network request', async () => {
  let calls = 0;
  const adapter = new MiniMaxAdapter({ apiKey: 'fake-test-key', fetch: fakeFetch(() => { calls++; return response({}); }) });
  const invalidJobs = [
    job({ prompt: '  ' }), job({ prompt: 'x'.repeat(7001) }),
    job({ params: { model: 'not-a-model' } }),
    job({ params: { model: 'MiniMax-H3-Highspeed', resolution: '2K' } }),
    job({ params: { model: 'MiniMax-H3-Max', duration: 4 } }),
    job({ params: { duration: 5.5 } }), job({ params: { generateAudio: 'yes' } }),
    job({ params: { aspectRatio: 'adaptive' } }),
    job({ params: { promptExpansionMode: 'balanced' } }),
    job({ inputs: [remoteInput('image', 'first_frame'), remoteInput('video', 'reference_video')] }),
    job({ inputs: Array.from({ length: 10 }, () => remoteInput('image', 'reference_image')) }),
    job({ inputs: [remoteInput('video', 'first_frame')] }),
    job({ inputs: [{ ...remoteInput('image', 'last_frame'), assetId: 'also-uploaded' }] }),
    job({ inputs: [{ kind: 'audio', role: 'reference_audio', uri: 'file:///private/file.mp3' }] }),
    job({ params: { model: 'MiniMax-H3-Lite', aspectRatio: 'adaptive' }, inputs: [remoteInput('audio', 'reference_audio')] }),
  ];
  for (const candidate of invalidJobs) {
    await assert.rejects(adapter.submit(candidate), (error: unknown) => error instanceof ProviderRequestError && error.definiteRejection && error.statusCode === 400);
  }
  assert.equal(calls, 0);
  assert.equal(normalizeMiniMaxParams(job({ params: { model: 'MiniMax-H3-Max', promptExpansionMode: 'quality' } })).extra?.prompt_expansion_mode, 'quality');
});

test('uploads original local bytes once and retains int64 file identifiers', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'minimax-adapter-'));
  try {
    const path = join(directory, 'original.png');
    const bytes = Buffer.from('original image bytes, without re-encoding');
    await writeFile(path, bytes);
    const asset: UploadedMedia = {
      id: 'local-image', name: 'original.png', kind: 'image', mimeType: 'image/png', size: bytes.length,
      uri: '/api/media/local-image', createdAt: new Date(0).toISOString(), width: 1024, height: 1024,
    };
    const urls: string[] = [];
    const adapter = new MiniMaxAdapter({
      apiKey: 'fake-test-key', resolveInput: async () => ({ asset, path }),
      fetch: fakeFetch(async (url, init) => {
        urls.push(url);
        if (url.endsWith('/files/upload')) {
          assert.ok(init.body instanceof FormData);
          assert.equal(init.body.get('purpose'), 'video_generation_input');
          const file = init.body.get('file') as File;
          assert.equal(file.name, 'original.png');
          assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes);
          return new Response('{"file":{"file_id":9223372036854775807},"base_resp":{"status_code":0}}');
        }
        const body = JSON.parse(String(init.body));
        assert.equal(body.content[1].image_url.url, 'mm_file://9223372036854775807');
        return new Response('{"task_id":9223372036854775806}');
      }),
    });
    const result = await adapter.submit(job({ inputs: [{ kind: 'image', role: 'last_frame', assetId: asset.id }] }));
    assert.equal(result.providerJobId, '9223372036854775806');
    assert.equal(urls.length, 2);
    assert.deepEqual(await readFile(path), bytes);
    assert.equal(parseMiniMaxJson('{"task_id":123}').task_id, '123');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('checks aggregate uploaded clip durations and dimensions before uploads', async () => {
  const adapter = new MiniMaxAdapter({ apiKey: 'fake-test-key', resolveInput: async (id) => ({
    path: '/unused', asset: {
      id, name: 'input.mp4', kind: 'video', mimeType: 'video/mp4', size: 100,
      uri: '/unused', createdAt: new Date(0).toISOString(), duration: 8, width: 1024, height: 768,
    },
  }), fetch: fakeFetch(() => { throw new Error('must not upload invalid inputs'); }) });
  await assert.rejects(adapter.submit(job({ inputs: [
    { kind: 'video', role: 'reference_video', assetId: 'one' },
    { kind: 'video', role: 'reference_video', assetId: 'two' },
  ] })), /total at most 15 seconds/);
});

test('normalizes wrapped and flat queries and renews expired output URLs', async () => {
  const calls: string[] = [];
  const adapter = new MiniMaxAdapter({ apiKey: 'fake-test-key', fetch: fakeFetch((url) => {
    calls.push(url);
    const task = {
      id: 'remote-task', status: 'succeeded', content: { url: `https://example.com/output-${calls.length}.mp4` },
      model: 'MiniMax-H3', resolution: '768P', duration: 5, ratio: '16:9', usage: { total_seconds: 5 },
    };
    return response(calls.length === 1 ? { task } : task);
  }) });
  const context = job({ providerJobId: 'remote/task' });
  const result = await adapter.refresh(context);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.outputs?.[0].uri, 'https://example.com/output-1.mp4');
  assert.deepEqual(result.metadata?.usage, { total_seconds: 5 });
  const content = await adapter.content(context, 0);
  assert.equal(content.url, 'https://example.com/output-2.mp4');
  assert.ok(calls.every((url) => url.endsWith('remote%2Ftask')));
  const canceled = new MiniMaxAdapter({ apiKey: 'fake-test-key', fetch: fakeFetch(() => response({ status: 'cancelled' })) });
  assert.equal((await canceled.refresh(context)).status, 'canceled');
});

test('maps explicit provider errors and leaves ambiguous submissions unconfirmed without retries', async () => {
  for (const status of [400, 429, 500]) {
    let calls = 0;
    const adapter = new MiniMaxAdapter({ apiKey: 'fake-test-key', fetch: fakeFetch(() => {
      calls++; return response({ type: 'error', error: { type: 'bad_request_error', message: 'Specific provider detail' }, request_id: 'request-123' }, status);
    }) });
    await assert.rejects(adapter.submit(job()), (error: unknown) => error instanceof ProviderRequestError
      && error.definiteRejection === (status < 500) && error.requestId === 'request-123' && error.message === 'Specific provider detail');
    assert.equal(calls, 1);
  }
  let calls = 0;
  const adapter = new MiniMaxAdapter({ apiKey: 'fake-test-key', fetch: fakeFetch(() => { calls++; throw new TypeError('connection lost'); }) });
  await assert.rejects(adapter.submit(job()), (error: unknown) => error instanceof ProviderRequestError && !error.definiteRejection);
  assert.equal(calls, 1);
  const malformed = new MiniMaxAdapter({ apiKey: 'fake-test-key', fetch: fakeFetch(() => response({})) });
  await assert.rejects(malformed.submit(job()), (error: unknown) => error instanceof ProviderRequestError && !error.definiteRejection);
});

test('cancels queued tasks after checking their latest provider status', async () => {
  let gets = 0;
  let deletes = 0;
  const adapter = new MiniMaxAdapter({ apiKey: 'fake-test-key', fetch: fakeFetch((url, init) => {
    assert.ok(url.endsWith('/remote'));
    if (init.method !== 'DELETE') { gets++; return response({ status: 'queued' }); }
    deletes++; return response({ action: 'cancelled', status: 'cancelled' });
  }) });
  assert.deepEqual(await adapter.cancel(job({ providerJobId: 'remote' })), {
    status: 'canceled', metadata: { providerCancelAction: 'cancelled' },
  });
  await assert.rejects(adapter.cancel(job({ providerJobId: 'remote', status: 'running' })), /Only queued/);
  assert.equal(gets, 1);
  assert.equal(deletes, 1);
});

test('cancellation preserves a fresh running or terminal task and handles a deletion race', async () => {
  for (const status of ['running', 'succeeded', 'failed', 'cancelled']) {
    let calls = 0;
    const adapter = new MiniMaxAdapter({ apiKey: 'fake-test-key', fetch: fakeFetch((_url, init) => {
      calls++; assert.notEqual(init.method, 'DELETE');
      return response({ status, content: { url: 'https://example.com/completed.mp4' }, resolution: '768P' });
    }) });
    const result = await adapter.cancel(job({ providerJobId: 'remote' }));
    assert.equal(result.status, status === 'cancelled' ? 'canceled' : status);
    if (status === 'succeeded') assert.equal(result.outputs?.[0].uri, 'https://example.com/completed.mp4');
    if (status === 'running') assert.match(result.error?.message ?? '', /already started/);
    assert.equal(calls, 1);
  }
  const raced = new MiniMaxAdapter({ apiKey: 'fake-test-key', fetch: fakeFetch((_url, init) =>
    response(init.method === 'DELETE' ? { action: 'deleted', status: 'deleted' } : { status: 'queued' })) });
  const result = await raced.cancel(job({ providerJobId: 'remote' }));
  assert.equal(result.status, 'canceled');
  assert.equal(result.metadata?.providerCancelAction, 'deleted');
  assert.match(result.error?.message ?? '', /finished this task before cancellation/);
});

test('terminal deletion is idempotent only for explicit missing provider tasks', async () => {
  for (const [status, message] of [[404, 'not found'], [400, 'invalid task_id'], [400, 'invalid task id']]) {
    const adapter = new MiniMaxAdapter({ apiKey: 'fake-test-key', fetch: fakeFetch(() => response({ error: { message } }, Number(status))) });
    await adapter.delete(job({ providerJobId: 'remote', status: 'succeeded' }));
  }
  const adapter = new MiniMaxAdapter({ apiKey: 'fake-test-key', fetch: fakeFetch(() => response({ error: { message: 'invalid authentication' } }, 400)) });
  await assert.rejects(adapter.delete(job({ providerJobId: 'remote', status: 'failed' })), /invalid authentication/);
});

test('regenerates archived 768P sources via base_video with the original prompt and references', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'minimax-regen-'));
  try {
    const path = join(directory, 'output.mp4');
    await writeFile(path, 'archived video bytes');
    let calls = 0;
    const adapter = new MiniMaxAdapter({ apiKey: 'fake-test-key', resolveOutput: async () => path, fetch: fakeFetch((url, init) => {
      calls++;
      if (url.endsWith('/files/upload')) return response({ file: { file_id: 'source-file-id' }, base_resp: { status_code: 0 } });
      assert.ok(url.endsWith('/v2/video_regeneration'));
      const body = JSON.parse(String(init.body));
      assert.equal(body.source_task_id, undefined);
      assert.equal(body.model, 'MiniMax-H3');
      assert.equal(body.resolution, '2K');
      assert.equal(body.generate_audio, false);
      assert.deepEqual(body.content, [
        { type: 'text', text: job().prompt },
        { type: 'image_url', image_url: { url: 'https://example.com/reference.png' }, role: 'first_frame' },
        { type: 'video_url', video_url: { url: 'mm_file://source-file-id' }, role: 'base_video' },
      ]);
      return response({ task_id: 'regenerated-task' });
    }) });
    const source = job({ status: 'succeeded', providerJobId: 'original-task',
      inputs: [remoteInput('image', 'first_frame')],
      outputs: [{ kind: 'video/mp4', uri: '/api/jobs/local/content', storageKey: 'stored/0.mp4' }],
    });
    assert.equal((await adapter.regenerate(source, { generateAudio: false })).providerJobId, 'regenerated-task');
    assert.equal(calls, 2);
    await assert.rejects(adapter.regenerate({ ...source, params: { ...source.params, generateAudio: false } }, {}), /audio track/);
    await assert.rejects(adapter.regenerate({ ...source, params: { ...source.params, resolution: '2K' } }, {}), /768P/);
    assert.equal(calls, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('upload application errors stop generation, and explicit non-JSON rejections stay definite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'minimax-upload-error-'));
  try {
    const path = join(directory, 'input.png');
    await writeFile(path, 'image');
    let calls = 0;
    const adapter = new MiniMaxAdapter({ apiKey: 'fake-test-key',
      resolveInput: async () => ({ path, asset: {
        id: 'input', name: 'input.png', kind: 'image', mimeType: 'image/png', size: 5,
        uri: '/unused', createdAt: new Date(0).toISOString(),
      } }), fetch: fakeFetch((url) => {
        calls++; assert.ok(url.endsWith('/files/upload'));
        return response({ base_resp: { status_code: 2013, status_msg: 'Invalid input media' }, request_id: 'upload-trace' });
      }),
    });
    await assert.rejects(adapter.submit(job({ inputs: [{ kind: 'image', role: 'last_frame', assetId: 'input' }] })),
      (error: unknown) => error instanceof ProviderRequestError && error.definiteRejection && error.code === '2013' && error.requestId === 'upload-trace');
    assert.equal(calls, 1);
    const rejected = new MiniMaxAdapter({ apiKey: 'fake-test-key', fetch: fakeFetch(() => new Response('Rate limit exceeded', { status: 429 })) });
    await assert.rejects(rejected.submit(job()), (error: unknown) => error instanceof ProviderRequestError && error.definiteRejection && error.statusCode === 429);
    const missingOutput = new MiniMaxAdapter({ apiKey: 'fake-test-key', fetch: fakeFetch(() => response({ task: { status: 'succeeded' } })) });
    await assert.rejects(missingOutput.refresh(job({ providerJobId: 'task' })), /without a valid video output URL/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
