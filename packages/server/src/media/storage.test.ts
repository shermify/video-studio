import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, mock, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/tursodatabase/migrator';

const directory = await mkdtemp(join(tmpdir(), 'studio-media-'));
process.env.DB_FILE_NAME = join(directory, 'test.db');
process.env.MEDIA_DIR = join(directory, 'media');
process.env.USE_STUB_ADAPTERS = 'true';
process.env.NODE_ENV = 'test';
const { db } = await import('../db.js');
const { buildApp } = await import('../app.js');
const { archiveOutputs, getMediaFile, getOutputFile, sendStoredOutput } = await import('./storage.js');
const app = buildApp();
const jobId = randomUUID();
app.get('/test-output', (request, reply) => sendStoredOutput(request, reply, `${jobId}/0.mp4`));

before(async () => {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)) });
  await app.ready();
});

after(async () => {
  mock.restoreAll();
  await app.close();
  await db.$client.close();
  await rm(directory, { recursive: true, force: true });
});

function upload(filename: string, bytes: Buffer) {
  const boundary = 'studio-test-boundary';
  return app.inject({
    method: 'POST', url: '/api/media',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      bytes, Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  });
}

test('uploads original files, validates actual media and serves previews', async () => {
  const bytes = await readFile(new URL('./fixtures/reference.png', import.meta.url));
  const response = await upload('Reference.PNG', bytes);
  assert.equal(response.statusCode, 201, response.body);
  const { data } = response.json();
  assert.equal(data.kind, 'image');
  assert.equal(data.width, 256);
  assert.equal(data.height, 256);
  assert.equal(data.mimeType, 'image/png');
  assert.equal(data.size, bytes.length);
  const local = await getMediaFile(data.id);
  assert.deepEqual(await readFile(local.path), bytes);
  const preview = await app.inject(data.uri);
  assert.equal(preview.statusCode, 200);
  assert.deepEqual(preview.rawPayload, bytes);
  assert.equal(preview.headers['x-content-type-options'], 'nosniff');

  const before = await readdir(join(directory, 'media', 'inputs'));
  const invalid = await upload('fake.png', Buffer.from('not an image'));
  assert.equal(invalid.statusCode, 400, invalid.body);
  assert.deepEqual(await readdir(join(directory, 'media', 'inputs')), before);
  const missing = await app.inject(`/api/media/${randomUUID()}`);
  assert.equal(missing.statusCode, 404);
  const traversal = await app.inject('/api/media/not-a-valid-asset-id');
  assert.equal(traversal.statusCode, 404);
});

test('accepts real video/audio clips and rejects clips outside provider duration limits', async () => {
  const videoBytes = await readFile(new URL('./fixtures/reference.mp4', import.meta.url));
  const video = await upload('reference.mp4', videoBytes);
  assert.equal(video.statusCode, 201, video.body);
  assert.equal(video.json().data.kind, 'video');
  assert.equal(video.json().data.duration, 2);
  assert.equal(video.json().data.width, 256);

  function wave(seconds: number) {
    const sampleRate = 16_000;
    const dataLength = sampleRate * 2 * seconds;
    const bytes = Buffer.alloc(44 + dataLength);
    bytes.write('RIFF', 0);
    bytes.writeUInt32LE(36 + dataLength, 4);
    bytes.write('WAVEfmt ', 8);
    bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20);
    bytes.writeUInt16LE(1, 22);
    bytes.writeUInt32LE(sampleRate, 24);
    bytes.writeUInt32LE(sampleRate * 2, 28);
    bytes.writeUInt16LE(2, 32);
    bytes.writeUInt16LE(16, 34);
    bytes.write('data', 36);
    bytes.writeUInt32LE(dataLength, 40);
    return bytes;
  }
  const audio = await upload('reference.wav', wave(2));
  assert.equal(audio.statusCode, 201, audio.body);
  assert.equal(audio.json().data.kind, 'audio');
  assert.equal(audio.json().data.duration, 2);
  const short = await upload('too-short.wav', wave(1));
  assert.equal(short.statusCode, 400, short.body);
  assert.match(short.json().error.message, /2 and 15 seconds/);
});

test('archives once, survives expiring URLs and supports seek/download requests', async () => {
  const bytes = Buffer.from('0123456789-video-content');
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(bytes));
  const outputs = [{ kind: 'video/mp4' as const, uri: 'https://cdn.example.com/temporary.mp4' }];
  const [first, second] = await Promise.all([
    archiveOutputs(jobId, outputs), archiveOutputs(jobId, outputs),
  ]);
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.deepEqual(first, second);
  assert.equal(first[0].storageKey, `${jobId}/0.mp4`);
  assert.equal(first[0].uri, `/api/jobs/${jobId}/content?asset=0`);
  fetchMock.mock.mockImplementation(async () => { throw new Error('URL expired'); });
  await archiveOutputs(jobId, outputs);
  assert.equal(fetchMock.mock.callCount(), 1, 'existing local files need no provider access');

  const partial = await app.inject({ url: '/test-output', headers: { range: 'bytes=2-6' } });
  assert.equal(partial.statusCode, 206);
  assert.equal(partial.body, '23456');
  assert.equal(partial.headers['content-range'], `bytes 2-6/${bytes.length}`);
  const suffix = await app.inject({ url: '/test-output', headers: { range: 'bytes=-7' } });
  assert.equal(suffix.body, 'content');
  const invalid = await app.inject({ url: '/test-output', headers: { range: 'bytes=9999-' } });
  assert.equal(invalid.statusCode, 416);
  const download = await app.inject('/test-output?download=1');
  assert.equal(download.statusCode, 200);
  assert.match(String(download.headers['content-disposition']), /^attachment;/);
  assert.deepEqual(download.rawPayload, bytes);
  fetchMock.mock.restore();
});

test('failed downloads never leave completed or partial output files', async () => {
  const id = randomUUID();
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.error(new Error('download interrupted'));
    },
  })));
  const outputs = [{ kind: 'video/mp4' as const, uri: 'https://cdn.example.com/failed.mp4' }];
  await assert.rejects(archiveOutputs(id, outputs), /download interrupted/);
  assert.deepEqual(await readdir(join(directory, 'media', 'outputs', id)), []);
  fetchMock.mock.mockImplementation(async () => new Response('complete video'));
  await archiveOutputs(id, outputs);
  assert.equal(await readFile(await getOutputFile(`${id}/0.mp4`), 'utf8'), 'complete video');
  await assert.rejects(getOutputFile('../../outside.mp4'));
  fetchMock.mock.restore();
});
