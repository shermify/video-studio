import { readFile, stat } from 'node:fs/promises';
import type { MediaInput, UploadedMedia } from '@video-studio/types';
import { providerCatalog } from './catalog.js';
import {
  ProviderRequestError,
  type ProviderAdapter,
  type ProviderContentResult,
  type ProviderJobContext,
  type ProviderRefreshResult,
  type ProviderSubmitResult,
  type RegenerateParams,
} from './types.js';

const API_BASE = 'https://api.minimax.io';
const UPLOAD_PATH = '/v1/files/upload';
const modelCatalog = providerCatalog.minimax.models!;
const maxBytes = { image: 30_000_000, video: 50_000_000, audio: 15_000_000 };
const extensions = {
  image: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'],
  video: ['mp4', 'mov'],
  audio: ['wav', 'mp3'],
};

type JsonObject = Record<string, unknown>;
type ResolveInput = (id: string) => Promise<{ asset: UploadedMedia; path: string }>;
type ResolveOutput = (storageKey: string) => Promise<string>;
type ContentItem = { type: string; text?: string; role?: string } & Record<string, unknown>;

export interface MiniMaxAdapterOptions {
  apiKey?: string;
  fetch?: typeof fetch;
  resolveInput?: ResolveInput;
  resolveOutput?: ResolveOutput;
}

function invalid(message: string): never {
  throw new ProviderRequestError(message, {
    statusCode: 400, code: 'VALIDATION_ERROR', definiteRejection: true,
  });
}

function object(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject : {};
}

/** Preserve int64 provider identifiers before JavaScript can round them. */
export function parseMiniMaxJson(text: string): JsonObject {
  return object(JSON.parse(text, (key: string, value: unknown, context?: { source?: string }) => {
    if (['id', 'file_id', 'task_id'].includes(key) && typeof value === 'number') {
      if (context?.source && /^\d+$/.test(context.source)) return context.source;
      if (!Number.isSafeInteger(value)) throw new Error('Provider returned an imprecise identifier');
      return String(value);
    }
    return value;
  }));
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`MiniMax response is missing ${label}`);
  return value;
}

function checkedUri(input: MediaInput): string | undefined {
  if (Boolean(input.uri) === Boolean(input.assetId)) invalid('Each input needs exactly one URL or uploaded asset');
  if (!input.uri) return undefined;
  const uri = input.uri;
  if (/^https?:\/\//i.test(uri)) {
    try { new URL(uri); return uri; } catch { invalid('Invalid input URL'); }
  }
  if (/^mm_file:\/\/\d+$/.test(uri)) return uri;
  const formats = {
    image: '(?:jpeg|jpg|png|webp|heic|heif)', video: 'mp4', audio: '(?:wav|mp3|mpeg)',
  };
  if (new RegExp(`^data:${input.kind}/${formats[input.kind]};base64,[A-Za-z0-9+/=\\r\\n]+$`, 'i').test(uri)) {
    const bytes = Math.floor(uri.slice(uri.indexOf(',') + 1).replace(/\s/g, '').length * 3 / 4);
    if (bytes > maxBytes[input.kind]) invalid(`${input.kind} input exceeds its file size limit`);
    return uri;
  }
  return invalid('Input must use a public HTTP URL, mm_file reference, or supported Base64 data URI');
}

export function normalizeMiniMaxParams(job: ProviderJobContext) {
  if (!job.prompt.trim() || [...job.prompt].length > 7000) invalid('MiniMax prompts must contain 1–7000 characters');
  const params = job.params;
  const model = modelCatalog.find((entry) => entry.id === (params.model ?? 'MiniMax-H3'));
  if (!model) invalid('Unsupported MiniMax model');
  const inputs = job.inputs ?? [];
  const counts = new Map<string, number>();
  let frames = false;
  let references = false;
  let bodyBytes = Buffer.byteLength(job.prompt);
  for (const input of inputs) {
    if (!['image', 'video', 'audio'].includes(input.kind)) invalid('Unsupported input media type');
    const roles = input.kind === 'image'
      ? ['first_frame', 'last_frame', 'reference_image']
      : input.kind === 'video' ? ['reference_video'] : ['reference_audio'];
    if (!roles.includes(input.role)) invalid(`Invalid role for ${input.kind} input`);
    const count = (counts.get(input.role) ?? 0) + 1;
    counts.set(input.role, count);
    const limit = input.role === 'reference_image' ? 9 : input.role.startsWith('reference_') ? 3 : 1;
    if (count > limit) invalid(`Too many ${input.role} inputs (maximum ${limit})`);
    frames ||= ['first_frame', 'last_frame'].includes(input.role);
    references ||= input.role.startsWith('reference_');
    const uri = checkedUri(input);
    if (uri) bodyBytes += Buffer.byteLength(uri);
  }
  if (frames && references) invalid('First/last frames cannot be combined with reference inputs');
  if (bodyBytes > 63_000_000) invalid('Input request is too large; upload media instead of embedding Base64');

  const resolution = params.resolution ?? '768P';
  if (typeof resolution !== 'string' || !model.resolutions.includes(resolution)) invalid('Unsupported resolution for this MiniMax model');
  const duration = params.duration ?? 5;
  if (typeof duration !== 'number' || !model.durations.includes(duration)) invalid('Unsupported duration for this MiniMax model');
  const requestedRatio = params.aspectRatio ?? params.ratio;
  if (requestedRatio !== undefined && (typeof requestedRatio !== 'string' || !model.aspectRatios.includes(requestedRatio))) invalid('Unsupported MiniMax aspect ratio');
  const ratio = frames ? 'adaptive' : requestedRatio ?? (references && model.id !== 'MiniMax-H3-Lite' ? 'adaptive' : '16:9');
  if (!frames && !references && ratio === 'adaptive') invalid('Text-to-video needs a concrete aspect ratio');
  if (references && model.id === 'MiniMax-H3-Lite' && ratio === 'adaptive') invalid('H3 Lite reference generation needs a concrete aspect ratio');
  const generateAudio = params.generateAudio ?? params.generate_audio ?? true;
  if (typeof generateAudio !== 'boolean') invalid('generateAudio must be a boolean');
  const expansion = params.promptExpansionMode ?? object(params.extra).prompt_expansion_mode;
  if (expansion !== undefined && (model.id !== 'MiniMax-H3-Max' || !['disabled', 'balanced', 'quality'].includes(String(expansion)))) invalid('Prompt expansion options apply only to H3 Max');
  return {
    model: model.id, resolution, duration, ratio, generate_audio: generateAudio,
    ...(model.id === 'MiniMax-H3-Max' ? { extra: { prompt_expansion_mode: expansion ?? 'balanced' } } : {}),
  };
}

export class MiniMaxAdapter implements ProviderAdapter {
  readonly providerId = 'minimax';
  readonly metadata = providerCatalog.minimax;
  readonly archiveOutputs = true;
  private readonly fetchImpl: typeof fetch;
  private readonly resolveInput: ResolveInput;
  private readonly resolveOutput: ResolveOutput;

  constructor(private readonly options: MiniMaxAdapterOptions = {}) {
    this.fetchImpl = options.fetch ?? ((...args) => globalThis.fetch(...args));
    this.resolveInput = options.resolveInput ?? (async (id) => (await import('../media/storage.js')).getMediaFile(id));
    this.resolveOutput = options.resolveOutput ?? (async (key) => (await import('../media/storage.js')).getOutputFile(key));
  }

  async validateInput(job: ProviderJobContext): Promise<void> {
    normalizeMiniMaxParams(job);
    const durations = { video: 0, audio: 0 };
    for (const input of job.inputs ?? []) {
      if (!input.assetId) continue;
      const { asset } = await this.resolveInput(input.assetId);
      if (asset.kind !== input.kind) invalid('Uploaded media type does not match its input role');
      if (asset.size > maxBytes[input.kind]) invalid(`${input.kind} input exceeds its file size limit`);
      const extension = asset.name.split('.').pop()?.toLowerCase() ?? '';
      if (!extensions[input.kind].includes(extension)) invalid(`Unsupported ${input.kind} input file format`);
      if (input.kind !== 'image' && asset.duration !== undefined) {
        if (asset.duration < 2 || asset.duration > 15) invalid('Reference clips must be between 2 and 15 seconds');
        durations[input.kind] += asset.duration;
      }
      if (asset.width !== undefined && asset.height !== undefined && input.kind !== 'audio') {
        if ([asset.width, asset.height].some((dimension) => dimension < 256 || dimension > 5760) || asset.width / asset.height < 0.4 || asset.width / asset.height > 2.5) invalid('Input dimensions or aspect ratio are outside MiniMax limits');
      }
    }
    if (durations.video > 15 || durations.audio > 15) invalid('Reference video and audio must each total at most 15 seconds');
  }

  private async request(path: string, init: RequestInit = {}): Promise<JsonObject> {
    const key = this.options.apiKey ?? process.env.MINIMAX_API_KEY;
    if (!key) throw new ProviderRequestError('MINIMAX_API_KEY is not configured', { definiteRejection: true, code: 'PROVIDER_NOT_CONFIGURED', statusCode: 503 });
    const upload = path === UPLOAD_PATH;
    let response: Response | undefined;
    let responseText = '';
    let payload: JsonObject;
    try {
      response = await this.fetchImpl(`${API_BASE}${path}`, {
        ...init,
        signal: AbortSignal.timeout(init.method === 'POST' ? 120_000 : 30_000),
        headers: { Authorization: `Bearer ${key}`, ...init.headers },
      });
      responseText = await response.text();
      payload = parseMiniMaxJson(responseText);
    } catch (error) {
      if (response && !response.ok) {
        throw new ProviderRequestError(`MiniMax HTTP ${response.status}: ${responseText.slice(0, 500) || 'Invalid provider response'}`, {
          statusCode: response.status,
          definiteRejection: upload || (response.status >= 400 && response.status < 500),
        });
      }
      throw new ProviderRequestError(`MiniMax request could not be confirmed: ${error instanceof Error ? error.message : 'network failure'}`, {
        definiteRejection: upload, code: 'PROVIDER_REQUEST_UNCONFIRMED',
      });
    }
    const error = object(payload.error);
    const base = object(payload.base_resp);
    if (!response.ok || payload.type === 'error' || Object.keys(error).length || (base.status_code !== undefined && base.status_code !== 0)) {
      throw new ProviderRequestError(String(error.message ?? base.status_msg ?? `MiniMax HTTP ${response.status}`), {
        definiteRejection: upload || (response.status >= 400 && response.status < 500) || (response.ok && (payload.type === 'error' || Object.keys(error).length > 0 || (base.status_code !== undefined && base.status_code !== 0))),
        statusCode: response.status >= 400 ? response.status : 502,
        code: String(error.code ?? error.type ?? base.status_code ?? 'PROVIDER_ERROR'),
        requestId: typeof payload.request_id === 'string' ? payload.request_id : undefined,
      });
    }
    return payload;
  }

  private async uploadFile(path: string, name: string, mimeType: string): Promise<string> {
    const bytes = await readFile(path);
    const form = new FormData();
    form.set('purpose', 'video_generation_input');
    form.set('file', new Blob([bytes], { type: mimeType }), name);
    const response = await this.request(UPLOAD_PATH, { method: 'POST', body: form });
    try { return `mm_file://${identifier(object(response.file).file_id, 'file_id')}`; }
    catch (error) { throw new ProviderRequestError((error as Error).message, { definiteRejection: true }); }
  }

  private async contentItems(job: ProviderJobContext): Promise<ContentItem[]> {
    const content: ContentItem[] = [{ type: 'text', text: job.prompt }];
    for (const input of job.inputs ?? []) {
      let url = checkedUri(input);
      if (input.assetId) {
        const { asset, path } = await this.resolveInput(input.assetId);
        url = await this.uploadFile(path, asset.name, asset.mimeType);
      }
      const type = `${input.kind}_url`;
      content.push({ type, [type]: { url }, role: input.role });
    }
    return content;
  }

  private async createTask(path: string, body: JsonObject): Promise<ProviderSubmitResult> {
    const response = await this.request(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    try { return { providerJobId: identifier(response.task_id, 'task_id'), status: 'queued', progressPct: null }; }
    catch (error) { throw new ProviderRequestError((error as Error).message, { definiteRejection: false }); }
  }

  async submit(job: ProviderJobContext): Promise<ProviderSubmitResult> {
    let content: ContentItem[];
    try {
      await this.validateInput(job);
      content = await this.contentItems(job);
    } catch (error) {
      if (error instanceof ProviderRequestError) throw error;
      throw new ProviderRequestError(error instanceof Error ? error.message : 'Cannot prepare MiniMax inputs', { definiteRejection: true });
    }
    return this.createTask('/v2/video_generation', { ...normalizeMiniMaxParams(job), content });
  }

  async refresh(job: ProviderJobContext): Promise<ProviderRefreshResult> {
    if (!job.providerJobId) invalid('Cannot query a job without a MiniMax task ID');
    const payload = await this.request(`/v2/query/video_generation/${encodeURIComponent(job.providerJobId)}`);
    const task = payload.task ? object(payload.task) : payload;
    const statuses = ['queued', 'running', 'succeeded', 'failed', 'cancelled'];
    const status = statuses.includes(String(task.status)) ? task.status === 'cancelled' ? 'canceled' : task.status as 'queued' | 'running' | 'succeeded' | 'failed' : 'unknown';
    const content = object(task.content);
    const error = object(task.error);
    if (status === 'succeeded' && (typeof content.url !== 'string' || !content.url.startsWith('https://'))) {
      throw new ProviderRequestError('MiniMax reported success without a valid video output URL', {
        definiteRejection: true, code: 'INVALID_PROVIDER_RESPONSE',
      });
    }
    return {
      status, progressPct: null,
      ...(status === 'succeeded' && typeof content.url === 'string' ? { outputs: [{ kind: 'video/mp4', uri: content.url }] } : {}),
      error: Object.keys(error).length ? { message: String(error.message ?? 'MiniMax task failed'), raw: String(error.code ?? '') } : null,
      metadata: {
        model: task.model, resolution: task.resolution, duration: task.duration, ratio: task.ratio,
        usage: task.usage, taskType: task.task_type, providerCreatedAt: task.created_at,
        providerUpdatedAt: task.updated_at, requestId: payload.request_id,
      },
    };
  }

  async content(job: ProviderJobContext, assetIndex: number): Promise<ProviderContentResult> {
    if (assetIndex !== 0) invalid('MiniMax video tasks contain one output');
    // Query again to renew a time-limited CDN URL. Archived outputs are served by the lifecycle.
    const result = await this.refresh(job);
    const output = result.outputs?.[0];
    if (!output) throw new ProviderRequestError('MiniMax output is not available', { definiteRejection: true, code: 'OUTPUT_UNAVAILABLE' });
    return { type: 'redirect', url: output.uri };
  }

  async cancel(job: ProviderJobContext): Promise<ProviderRefreshResult> {
    if (!job.providerJobId || job.status !== 'queued') invalid('Only queued MiniMax tasks can be canceled');
    const current = await this.refresh(job);
    if (current.status !== 'queued') {
      return current.status === 'running' ? {
        ...current, error: { message: 'MiniMax has already started this task; running tasks cannot be canceled.' },
      } : current;
    }
    const result = await this.request(`/v2/video_generation/${encodeURIComponent(job.providerJobId)}`, { method: 'DELETE' });
    if (result.action === 'cancelled' && result.status === 'cancelled') {
      return { status: 'canceled', metadata: { providerCancelAction: 'cancelled' } };
    }
    if (result.action === 'deleted' && result.status === 'deleted') {
      return {
        status: 'canceled', metadata: { providerCancelAction: 'deleted' },
        error: { message: 'MiniMax finished this task before cancellation and deleted its record. Cancellation before processing was not confirmed.' },
      };
    }
    throw new ProviderRequestError('MiniMax did not confirm cancellation', { definiteRejection: false });
  }

  async delete(job: ProviderJobContext): Promise<void> {
    if (!job.providerJobId) return;
    try {
      await this.request(`/v2/video_generation/${encodeURIComponent(job.providerJobId)}`, { method: 'DELETE' });
    } catch (error) {
      if (error instanceof ProviderRequestError && (error.statusCode === 404 ||
        (error.statusCode === 400 && /invalid task[_ ]?id/i.test(error.message)))) return;
      throw error;
    }
  }

  async validateRegeneration(source: ProviderJobContext, params: RegenerateParams): Promise<void> {
    const resolution = source.metadata?.resolution ?? source.params.resolution;
    if (source.status !== 'succeeded' || resolution !== '768P') invalid('Regeneration requires a completed MiniMax 768P source');
    if (source.params.generateAudio === false || source.params.generate_audio === false) invalid('Regeneration by source video requires an audio track');
    if (params.generateAudio !== undefined && typeof params.generateAudio !== 'boolean') invalid('generateAudio must be a boolean');
    const index = params.sourceAssetIndex ?? 0;
    const output = source.outputs[index];
    if (!output || index !== 0) invalid('Source video output not found');
    await this.validateInput(source);
    if (output.storageKey) {
      const path = await this.resolveOutput(output.storageKey);
      try {
        const info = await stat(path);
        if (!info.size) invalid('The source video file is empty');
      } catch (error) {
        if (error instanceof ProviderRequestError) throw error;
        invalid('The archived source video file is missing');
      }
    } else if (!source.providerJobId) invalid('Source video is not available');
  }

  async regenerate(source: ProviderJobContext, params: RegenerateParams): Promise<ProviderSubmitResult> {
    let content: ContentItem[];
    try {
      await this.validateRegeneration(source, params);
      const index = params.sourceAssetIndex ?? 0;
      const output = source.outputs[index];
      let baseUrl: string;
      if (output.storageKey) {
        const path = await this.resolveOutput(output.storageKey);
        baseUrl = await this.uploadFile(path, 'base-video.mp4', 'video/mp4');
      } else {
        const refreshed = await this.content(source, index);
        baseUrl = identifier(refreshed.url, 'source video URL');
      }
      content = await this.contentItems(source);
      content.push({ type: 'video_url', video_url: { url: baseUrl }, role: 'base_video' });
    } catch (error) {
      throw new ProviderRequestError(error instanceof Error ? error.message : 'Cannot prepare regeneration inputs', {
        definiteRejection: true,
        ...(error instanceof ProviderRequestError ? {
          statusCode: error.statusCode, code: error.code, requestId: error.requestId,
        } : {}),
      });
    }
    return this.createTask('/v2/video_regeneration', {
      model: 'MiniMax-H3', resolution: '2K', content,
      generate_audio: params.generateAudio ?? source.params.generateAudio ?? source.params.generate_audio ?? true,
    });
  }
}
