export type ProviderId = 'sora' | 'veo';

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
  outputs: CanonicalVideoAsset[]; // 0..n
  error?: { message: string; raw?: string | string[] } | null;

  // optional metadata
  actions: {
    canDownload: boolean;
    canDelete: boolean;
    canRemix: boolean; // Sora typically
    canExtend: boolean; // Veo typically
  };
}

// ============ API Request/Response Types ============

// POST /api/v1/jobs
export interface CreateJobRequest {
  provider: ProviderId;
  prompt: string;
  mode?: string; // e.g., "generate", "remix", "extend"
  params?: Record<string, unknown>;
  assets?: CanonicalVideoAsset[];
}

export interface CreateJobResponse {
  data: CanonicalVideoJob;
}

// GET /api/v1/jobs
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

// GET /api/v1/jobs/:id
export interface GetJobResponse {
  data: CanonicalVideoJob;
}

// DELETE /api/v1/jobs/:id
export interface DeleteJobResponse {
  data: { id: string; deleted: true };
}

// POST /api/v1/jobs/:id/refresh
export interface RefreshJobResponse {
  data: CanonicalVideoJob;
}

// GET /api/v1/providers
export interface ProviderModeInfo {
  id: string;
  label: string;
  description?: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  modes: ProviderModeInfo[];
  capabilities: {
    remix: boolean;
    extend: boolean;
    referenceImage: boolean;
  };
}

export interface ListProvidersResponse {
  data: ProviderInfo[];
}

// POST /api/v1/jobs/:id/remix
export interface RemixJobRequest {
  prompt?: string; // New prompt for the remix (optional, defaults to original)
}

export interface RemixJobResponse {
  data: CanonicalVideoJob; // The newly created remix job
}

// POST /api/v1/jobs/:id/extend
export interface ExtendJobRequest {
  prompt?: string; // New prompt for the extension (optional)
  sourceAssetIndex?: number; // Which output asset to extend (default: 0)
  params?: Record<string, unknown>; // Additional parameters for the extension
}

export interface ExtendJobResponse {
  data: CanonicalVideoJob; // The newly created extend job
}
