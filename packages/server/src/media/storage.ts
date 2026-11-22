import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import type { MultipartFile } from '@fastify/multipart';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { CanonicalVideoAsset, MediaKind, UploadedMedia } from '@video-studio/types';
import { db } from '../db.js';
import { mediaFiles } from '../schema.js';

const execFileAsync = promisify(execFile);
const root = resolve(process.env.MEDIA_DIR || './data/media');
const megabyte = 1_000_000;
const formats: Record<string, { kind: MediaKind; mimeType: string; maxSize: number }> = {
  '.jpg': { kind: 'image', mimeType: 'image/jpeg', maxSize: 30 * megabyte },
  '.jpeg': { kind: 'image', mimeType: 'image/jpeg', maxSize: 30 * megabyte },
  '.png': { kind: 'image', mimeType: 'image/png', maxSize: 30 * megabyte },
  '.webp': { kind: 'image', mimeType: 'image/webp', maxSize: 30 * megabyte },
  '.heic': { kind: 'image', mimeType: 'image/heic', maxSize: 30 * megabyte },
  '.heif': { kind: 'image', mimeType: 'image/heif', maxSize: 30 * megabyte },
  '.mp4': { kind: 'video', mimeType: 'video/mp4', maxSize: 50 * megabyte },
  '.mov': { kind: 'video', mimeType: 'video/quicktime', maxSize: 50 * megabyte },
  '.wav': { kind: 'audio', mimeType: 'audio/wav', maxSize: 15 * megabyte },
  '.mp3': { kind: 'audio', mimeType: 'audio/mpeg', maxSize: 15 * megabyte },
};

export class MediaError extends Error {
  constructor(message: string, public statusCode = 400, public code = 'INVALID_MEDIA') {
    super(message);
  }
}

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
}

interface ProbeResult {
  streams?: ProbeStream[];
  format?: { duration?: string; format_name?: string };
}

async function inspectMedia(
  path: string, kind: MediaKind, extension: string,
): Promise<{ duration?: number; width?: number; height?: number }> {
  let probe: ProbeResult;
  try {
    const { stdout } = await execFileAsync(process.env.FFPROBE_PATH || 'ffprobe', [
      '-v', 'error', '-protocol_whitelist', 'file,pipe',
      '-show_streams', '-show_format', '-of', 'json', path,
    ], { timeout: 15_000, maxBuffer: 1_048_576 });
    probe = JSON.parse(stdout) as ProbeResult;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new MediaError('Media uploads require ffprobe on the server.', 503, 'FFPROBE_UNAVAILABLE');
    }
    throw new MediaError('The file could not be read as a supported image, video, or audio file.');
  }

  const streams = probe.streams ?? [];
  const visual = streams.find((stream) => stream.codec_type === 'video');
  const audio = streams.find((stream) => stream.codec_type === 'audio');
  const width = visual?.width;
  const height = visual?.height;
  const format = probe.format?.format_name ?? '';
  if (kind !== 'audio') {
    if (!width || !height || width < 256 || height < 256 || width > 5760 || height > 5760) {
      throw new MediaError('Images and videos must be between 256 and 5760 pixels on each side.');
    }
    if (width / height < 0.4 || width / height > 2.5) {
      throw new MediaError('The media aspect ratio must be between 0.4 and 2.5.');
    }
  }
  if (kind === 'image') {
    const expected: Record<string, string[]> = {
      '.jpg': ['mjpeg'], '.jpeg': ['mjpeg'], '.png': ['png'], '.webp': ['webp'],
      '.heic': ['hevc'], '.heif': ['hevc'],
    };
    if (!expected[extension]?.includes(visual?.codec_name ?? '')) {
      throw new MediaError('The image contents do not match its file format.');
    }
    return { width, height };
  }
  const duration = Number(probe.format?.duration);
  if (!Number.isFinite(duration) || duration < 2 || duration > 15) {
    throw new MediaError('Reference video and audio clips must be between 2 and 15 seconds long.');
  }
  if (kind === 'video') {
    if (!format.split(',').includes('mov') || !['h264', 'hevc'].includes(visual?.codec_name ?? '')) {
      throw new MediaError('Reference videos must be MP4/MOV with H.264 or H.265 video.');
    }
    if (audio && !['aac', 'mp3'].includes(audio.codec_name ?? '')) {
      throw new MediaError('Video audio tracks must use AAC or MP3.');
    }
    const [numerator, denominator] = (visual?.avg_frame_rate ?? '').split('/').map(Number);
    const fps = numerator / denominator;
    if (!Number.isFinite(fps) || fps < 23.976 - 0.001 || fps > 60) {
      throw new MediaError('Reference video frame rate must be between 23.976 and 60 fps.');
    }
  } else if (!audio || !['mp3', 'wav'].includes(format)) {
    throw new MediaError('Reference audio must be a WAV or MP3 file.');
  }
  return { duration, ...(kind === 'video' ? { width, height } : {}) };
}

function toUploadedMedia(row: typeof mediaFiles.$inferSelect): UploadedMedia {
  return {
    id: row.id, kind: row.kind, mimeType: row.mimeType, name: row.name, size: row.size,
    uri: `/api/media/${row.id}`, createdAt: row.createdAt.toISOString(),
    ...(row.duration === null ? {} : { duration: row.duration / 1000 }),
    ...(row.width === null ? {} : { width: row.width }),
    ...(row.height === null ? {} : { height: row.height }),
  };
}

export async function saveUpload(file: MultipartFile): Promise<UploadedMedia> {
  const extension = extname(file.filename).toLowerCase();
  const format = formats[extension];
  if (!format) {
    file.file.resume();
    throw new MediaError('Use JPG, PNG, WebP, HEIC/HEIF, MP4/MOV, WAV, or MP3 files.');
  }
  const id = randomUUID();
  const directory = resolve(root, 'inputs');
  await mkdir(directory, { recursive: true });
  const destination = resolve(directory, `${id}${extension}`);
  const temporary = `${destination}.uploading`;
  let size = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      callback(size > format.maxSize
        ? new MediaError(`This ${format.kind} exceeds the ${format.maxSize / megabyte} MB limit.`, 413)
        : null, chunk);
    },
  });
  try {
    await pipeline(file.file, limit, createWriteStream(temporary, { flags: 'wx' }));
    if (file.file.truncated) throw new MediaError('The file is too large.', 413);
    if (size === 0) throw new MediaError('The file is empty.');
    const metadata = await inspectMedia(temporary, format.kind, extension);
    await rename(temporary, destination);
    const [row] = await db.insert(mediaFiles).values({
      id, kind: format.kind, mimeType: format.mimeType, name: file.filename.slice(0, 255),
      size, extension,
      duration: metadata.duration === undefined ? null : Math.round(metadata.duration * 1000),
      width: metadata.width, height: metadata.height,
    }).returning();
    return toUploadedMedia(row);
  } catch (error) {
    await Promise.all([rm(temporary, { force: true }), rm(destination, { force: true })]);
    throw error;
  }
}

export async function getMediaFile(id: string): Promise<{ asset: UploadedMedia; path: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new MediaError('Media file not found.', 404, 'MEDIA_NOT_FOUND');
  const row = await db.select().from(mediaFiles).where(eq(mediaFiles.id, id)).get();
  if (!row) throw new MediaError('Media file not found.', 404, 'MEDIA_NOT_FOUND');
  const path = resolve(root, 'inputs', `${row.id}${row.extension}`);
  try {
    await stat(path);
  } catch {
    throw new MediaError('The original media file is missing from local storage.', 404, 'MEDIA_NOT_FOUND');
  }
  return { asset: toUploadedMedia(row), path };
}

export function getOutputFile(storageKey: string): Promise<string> {
  if (!/^[0-9a-f-]{36}\/\d+\.mp4$/i.test(storageKey)) {
    return Promise.reject(new MediaError('Output file not found.', 404, 'OUTPUT_NOT_FOUND'));
  }
  return Promise.resolve(resolve(root, 'outputs', storageKey));
}

const archiving = new Map<string, Promise<CanonicalVideoAsset[]>>();

export function archiveOutputs(jobId: string, outputs: CanonicalVideoAsset[]): Promise<CanonicalVideoAsset[]> {
  const existing = archiving.get(jobId);
  if (existing) return existing;
  const task = archive(jobId, outputs).finally(() => archiving.delete(jobId));
  archiving.set(jobId, task);
  return task;
}

async function archive(jobId: string, outputs: CanonicalVideoAsset[]): Promise<CanonicalVideoAsset[]> {
  const stored: CanonicalVideoAsset[] = [];
  for (const [index, output] of outputs.entries()) {
    const storageKey = `${jobId}/${index}.mp4`;
    const destination = await getOutputFile(storageKey);
    try {
      const info = await stat(destination);
      if (info.size > 0) {
        stored.push({ ...output, uri: `/api/jobs/${jobId}/content?asset=${index}`, storageKey });
        continue;
      }
    } catch { /* Missing output: download it below. */ }
    const url = new URL(output.uri);
    if (url.protocol !== 'https:') throw new MediaError('The provider returned an invalid output URL.', 502);
    const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok || !response.body) throw new MediaError('Could not download the completed video.', 502, 'OUTPUT_DOWNLOAD_FAILED');
    await mkdir(resolve(root, 'outputs', jobId), { recursive: true });
    const temporary = `${destination}.${randomUUID()}.part`;
    try {
      await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { flags: 'wx' }));
      if ((await stat(temporary)).size === 0) throw new MediaError('The provider returned an empty video.', 502);
      await rename(temporary, destination);
      stored.push({ ...output, uri: `/api/jobs/${jobId}/content?asset=${index}`, storageKey });
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }
  return stored;
}

export async function sendMediaFile(
  request: FastifyRequest, reply: FastifyReply, path: string, mimeType: string, filename: string,
): Promise<FastifyReply> {
  let size: number;
  try { size = (await stat(path)).size; }
  catch { throw new MediaError('The media file is missing from local storage.', 404, 'MEDIA_NOT_FOUND'); }
  reply.header('Content-Type', mimeType);
  reply.header('Accept-Ranges', 'bytes');
  reply.header('X-Content-Type-Options', 'nosniff');
  const { download } = request.query as { download?: string };
  if (download === '1') {
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    reply.header('Content-Disposition', `attachment; filename="${safeName}"`);
  }
  const range = request.headers.range;
  if (!range) return reply.header('Content-Length', size).send(createReadStream(path));
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  const start = match?.[1] ? Number(match[1]) : Math.max(0, size - Number(match?.[2]));
  const end = match?.[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start)
    || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) {
    return reply.code(416).header('Content-Range', `bytes */${size}`).send();
  }
  return reply.code(206).header('Content-Range', `bytes ${start}-${end}/${size}`)
    .header('Content-Length', end - start + 1).send(createReadStream(path, { start, end }));
}

export async function sendStoredOutput(request: FastifyRequest, reply: FastifyReply, storageKey: string) {
  return sendMediaFile(request, reply, await getOutputFile(storageKey), 'video/mp4', storageKey.replace('/', '_'));
}
