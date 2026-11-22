import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CanonicalJobStatus, ProviderId } from '@video-studio/types';

export interface JobFilters {
  provider?: ProviderId;
  status?: CanonicalJobStatus;
  q?: string;
}

interface JobsState {
  selectedJobId: string | null;
  filters: JobFilters;
  favorites: string[];
}

const initialState: JobsState = {
  selectedJobId: null,
  filters: {},
  favorites: [],
};

export const jobsSlice = createSlice({
  name: 'jobs',
  initialState,
  reducers: {
    selectJob(state, action: PayloadAction<string | null>) {
      state.selectedJobId = action.payload;
    },
    setFilters(state, action: PayloadAction<Partial<JobFilters>>) {
      if ('provider' in action.payload)
        state.filters.provider = action.payload.provider;
      if ('status' in action.payload)
        state.filters.status = action.payload.status;
      if ('q' in action.payload) state.filters.q = action.payload.q;
    },
    clearFilters(state) {
      state.filters = {};
    },
    toggleFavorite(state, action: PayloadAction<string>) {
      const index = state.favorites.indexOf(action.payload);
      if (index === -1) state.favorites.push(action.payload);
      else state.favorites.splice(index, 1);
    },
  },
  selectors: {
    selectSelectedJobId: (state) => state.selectedJobId,
    selectJobFilters: (state) => state.filters,
    selectFavorites: (state) => state.favorites,
  },
});

export const { selectJob, setFilters, clearFilters, toggleFavorite } =
  jobsSlice.actions;
export const { selectSelectedJobId, selectJobFilters, selectFavorites } =
  jobsSlice.selectors;
export default jobsSlice.reducer;
