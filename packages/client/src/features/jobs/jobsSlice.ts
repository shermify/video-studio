import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type {
  ProviderId,
  CanonicalJobStatus,
  CanonicalVideoAsset,
} from '@video/types';

// Image data structure for drop zones
export interface DraftImage {
  dataUrl: string; // For preview display
  bytesBase64Encoded: string; // For API submission
  mimeType: string;
}

// Image slots for the draft builder
export interface DraftImages {
  // First frame (Veo) or reference image (Sora)
  firstFrame: DraftImage | null;
  // Last frame (Veo only)
  lastFrame: DraftImage | null;
  // Reference image for character/style (Veo only)
  reference: DraftImage | null;
}

// Draft state for the job builder form
export interface DraftState {
  provider: ProviderId;
  prompt: string;
  mode: string;
  params: Record<string, unknown>;
  assets: CanonicalVideoAsset[];
  images: DraftImages;
}

// Filter state for the job queue
export interface JobFilters {
  provider?: ProviderId;
  status?: CanonicalJobStatus;
  q?: string;
}

interface JobsState {
  // Currently selected job ID (for preview)
  selectedJobId: string | null;

  // Job filters for the queue panel
  filters: JobFilters;

  // Draft builder state
  draft: DraftState;

  // Comparison mode: pin a job for A/B comparison
  compareJobId: string | null;

  // Favorited job IDs (stored locally)
  favorites: string[];
}

const defaultImages: DraftImages = {
  firstFrame: null,
  lastFrame: null,
  reference: null,
};

const defaultDraft: DraftState = {
  provider: 'veo',
  prompt: '',
  mode: 'generate',
  params: {},
  assets: [],
  images: defaultImages,
};

const initialState: JobsState = {
  selectedJobId: null,
  filters: {},
  draft: defaultDraft,
  compareJobId: null,
  favorites: [],
};

export const jobsSlice = createSlice({
  name: 'jobs',
  initialState,
  reducers: {
    // Selection
    selectJob: (state, action: PayloadAction<string | null>) => {
      state.selectedJobId = action.payload;
    },

    // Filters
    setFilters: (state, action: PayloadAction<Partial<JobFilters>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    clearFilters: (state) => {
      state.filters = {};
    },

    // Draft builder
    setDraft: (state, action: PayloadAction<Partial<DraftState>>) => {
      state.draft = { ...state.draft, ...action.payload };
    },
    setDraftProvider: (state, action: PayloadAction<ProviderId>) => {
      state.draft.provider = action.payload;
      // Reset mode when provider changes (modes differ between providers)
      state.draft.mode = 'generate';
      state.draft.params = {};
      // Clear images since slots differ between providers
      state.draft.images = defaultImages;
    },
    setDraftPrompt: (state, action: PayloadAction<string>) => {
      state.draft.prompt = action.payload;
    },
    setDraftMode: (state, action: PayloadAction<string>) => {
      state.draft.mode = action.payload;
    },
    setDraftParams: (state, action: PayloadAction<Record<string, unknown>>) => {
      state.draft.params = { ...state.draft.params, ...action.payload };
    },
    addDraftAsset: (state, action: PayloadAction<CanonicalVideoAsset>) => {
      state.draft.assets.push(action.payload);
    },
    removeDraftAsset: (state, action: PayloadAction<number>) => {
      state.draft.assets.splice(action.payload, 1);
    },
    clearDraftAssets: (state) => {
      state.draft.assets = [];
    },
    setDraftImage: (
      state,
      action: PayloadAction<{
        slot: keyof DraftImages;
        image: DraftImage | null;
      }>
    ) => {
      state.draft.images[action.payload.slot] = action.payload.image;
    },
    clearDraftImage: (state, action: PayloadAction<keyof DraftImages>) => {
      state.draft.images[action.payload] = null;
    },
    clearAllDraftImages: (state) => {
      state.draft.images = defaultImages;
    },
    resetDraft: (state) => {
      state.draft = defaultDraft;
    },

    // Fork actions: prefill draft from an existing job
    prefillDraftFromJob: (
      state,
      action: PayloadAction<{
        provider: ProviderId;
        prompt: string;
        mode?: string;
        params?: Record<string, unknown>;
      }>
    ) => {
      state.draft = {
        provider: action.payload.provider,
        prompt: action.payload.prompt,
        mode: action.payload.mode ?? 'generate',
        params: action.payload.params ?? {},
        assets: [],
        images: defaultImages,
      };
    },

    // Comparison
    setCompareJob: (state, action: PayloadAction<string | null>) => {
      state.compareJobId = action.payload;
    },

    // Favorites
    toggleFavorite: (state, action: PayloadAction<string>) => {
      const idx = state.favorites.indexOf(action.payload);
      if (idx === -1) {
        state.favorites.push(action.payload);
      } else {
        state.favorites.splice(idx, 1);
      }
    },
  },
});

export const {
  selectJob,
  setFilters,
  clearFilters,
  setDraft,
  setDraftProvider,
  setDraftPrompt,
  setDraftMode,
  setDraftParams,
  addDraftAsset,
  removeDraftAsset,
  clearDraftAssets,
  setDraftImage,
  clearDraftImage,
  clearAllDraftImages,
  resetDraft,
  prefillDraftFromJob,
  setCompareJob,
  toggleFavorite,
} = jobsSlice.actions;

export default jobsSlice.reducer;
