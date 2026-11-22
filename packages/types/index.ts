export type ProviderId = 'sora' | 'veo' | 'minimax';

export type MediaKind = 'image' | 'video' | 'audio';
export type MediaRole =
  | 'first_frame'
  | 'last_frame'
  | 'reference_image'
  | 'reference_video'
  | 'reference_audio';

export interface MediaInput {
  kind: MediaKind;
  role: MediaRole;
  /** A public HTTPS URL, or a local asset ID. Exactly one is required. */
  uri?: string;
  assetId?: string;
}

export interface UploadedMedia {
  id: string;
  kind: MediaKind;
  mimeType: string;
  name: string;
  size: number;
  uri: string;
  duration?: number;
  width?: number;
  height?: number;
  createdAt: string;
}

export interface UploadMediaResponse {
  data: UploadedMedia;
}

export type CanonicalJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'unknown';

export interface CanonicalVideoAsset {
  kind: 'video/mp4' | 'video' | 'unknown';
  uri: string; // signed URL, public URL, or internal /api proxy URL
  bytesBase64?: string; // optional if you choose to store base64 temporarily
  /** Relative key in application-owned output storage. */
  storageKey?: string;
}

export interface CanonicalVideoJob {
  id: string; // internal id (DB)
  provider: ProviderId;
  providerJobId: string | null; // Sora video id OR Veo operation name
  status: CanonicalJobStatus;
  progressPct?: number | null; // Sora has integer progress; Veo usually doesn't
  createdAt: string;
  updatedAt: string;

  prompt: string;
  params: Record<string, unknown>; // provider-native params for reproducibility
  inputs?: MediaInput[];
  metadata?: Record<string, unknown>;
  outputs: CanonicalVideoAsset[]; // 0..n
  error?: { message: string; raw?: string | string[] } | null;

  // optional metadata
  actions: {
    canDownload: boolean;
    canDelete: boolean;
    canRemix: boolean; // Sora typically
    canExtend: boolean; // Veo typically
    canCancel?: boolean;
    canRegenerate?: boolean;
  };
}

// ============ API Request/Response Types ============

// POST /api/jobs
export interface CreateJobRequest {
  provider: ProviderId;
  prompt: string;
  mode?: string; // e.g., "generate", "remix", "extend"
  params?: Record<string, unknown>;
  assets?: CanonicalVideoAsset[];
  inputs?: MediaInput[];
  /** Stable across retries of one creation request. A new operation gets a new ID. */
  requestId?: string;
}

export interface CreateJobResponse {
  data: CanonicalVideoJob;
}

// GET /api/jobs
export interface ListJobsQuery {
  provider?: ProviderId;
  status?: CanonicalJobStatus;
  q?: string; // search prompt substring
  limit?: number;
  cursor?: string; // cursor-based pagination (job id)
}

export interface ListJobsResponse {
  data: CanonicalVideoJob[];
  meta: {
    total: number;
    limit: number;
    nextCursor: string | null;
  };
}

// GET /api/jobs/:id
export interface GetJobResponse {
  data: CanonicalVideoJob;
}

// DELETE /api/jobs/:id
export interface DeleteJobResponse {
  data: { id: string; deleted: true };
}

// POST /api/jobs/:id/refresh
export interface RefreshJobResponse {
  data: CanonicalVideoJob;
}

// GET /api/providers
export interface ProviderModeInfo {
  id: string;
  label: string;
  description?: string;
}

export interface ProviderModel {
  id: string;
  label: string;
  resolutions: string[];
  durations: number[];
  aspectRatios: string[];
  supportsAudio?: boolean;
  promptExpansion?: boolean;
}

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  modes: ProviderModeInfo[];
  models?: ProviderModel[];
  isStub?: boolean;
  capabilities: {
    remix: boolean;
    extend: boolean;
    referenceImage: boolean;
    referenceVideo?: boolean;
    referenceAudio?: boolean;
    lastFrame?: boolean;
    cancel?: boolean;
    regenerate?: boolean;
  };
}

export interface ListProvidersResponse {
  data: ProviderInfo[];
}

// POST /api/jobs/:id/remix
export interface RemixJobRequest {
  prompt?: string; // New prompt for the remix (optional, defaults to original)
  requestId?: string;
}

export interface RemixJobResponse {
  data: CanonicalVideoJob; // The newly created remix job
}

// POST /api/jobs/:id/extend
export interface ExtendJobRequest {
  prompt?: string; // New prompt for the extension (optional)
  sourceAssetIndex?: number; // Which output asset to extend (default: 0)
  params?: Record<string, unknown>; // Additional parameters for the extension
  requestId?: string;
}

export interface ExtendJobResponse {
  data: CanonicalVideoJob; // The newly created extend job
}

export interface CancelJobResponse {
  data: CanonicalVideoJob;
}

export interface RegenerateJobRequest {
  requestId?: string;
  sourceAssetIndex?: number;
  generateAudio?: boolean;
}

export interface RegenerateJobResponse {
  data: CanonicalVideoJob;
}
