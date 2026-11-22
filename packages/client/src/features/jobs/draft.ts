import type {
  CanonicalVideoAsset,
  MediaInput,
  ProviderId,
  UploadedMedia,
} from '@video-studio/types';

// Legacy Sora/Veo image payloads remain local to the editable form.
export interface DraftImage {
  dataUrl: string;
  bytesBase64Encoded: string;
  mimeType: string;
}

export interface DraftImages {
  firstFrame: DraftImage | null;
  lastFrame: DraftImage | null;
  reference: DraftImage | null;
}

export interface DraftMedia {
  id: string;
  input: MediaInput;
  name: string;
  previewUri: string;
  uploaded?: UploadedMedia;
}

export interface DraftState {
  provider: ProviderId;
  prompt: string;
  mode: string;
  params: Record<string, unknown>;
  assets: CanonicalVideoAsset[];
  images: DraftImages;
  media: DraftMedia[];
}

export function emptyImages(): DraftImages {
  return { firstFrame: null, lastFrame: null, reference: null };
}

export function createDraft(provider: ProviderId = 'veo'): DraftState {
  return {
    provider,
    prompt: '',
    mode: 'generate',
    params: {},
    assets: [],
    images: emptyImages(),
    media: [],
  };
}
