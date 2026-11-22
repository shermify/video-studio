import type { ProviderId, ProviderInfo, ProviderModel } from '@video-studio/types';

const videoRatios = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'];
const h3Model = (
  id: string,
  label: string,
  resolutions: string[],
  minimumDuration = 4,
  promptExpansion = false
): ProviderModel => ({
  id,
  label,
  resolutions,
  durations: Array.from({ length: 16 - minimumDuration }, (_, index) => minimumDuration + index),
  aspectRatios: ['adaptive', ...videoRatios],
  supportsAudio: true,
  promptExpansion,
});

export const providerCatalog: Record<ProviderId, ProviderInfo> = {
  sora: {
    id: 'sora',
    name: 'Sora',
    modes: [
      { id: 'generate', label: 'Generate' },
      { id: 'remix', label: 'Remix' },
      { id: 'image-to-video', label: 'Image to Video' },
    ],
    models: [{
      id: 'sora-2', label: 'Sora 2', resolutions: ['1280x720', '720x1280'],
      durations: [4, 8, 12], aspectRatios: ['16:9', '9:16'],
    }],
    capabilities: { remix: true, extend: false, referenceImage: true },
  },
  veo: {
    id: 'veo',
    name: 'Veo',
    modes: [
      { id: 'generate', label: 'Generate' },
      { id: 'extend', label: 'Extend' },
      { id: 'image-to-video', label: 'Image to Video' },
    ],
    models: ['veo-3.1-generate-preview', 'veo-3.1-fast-generate-preview'].map((id) => ({
      id, label: id.includes('fast') ? 'Veo 3.1 Fast' : 'Veo 3.1',
      resolutions: ['720p', '1080p'], durations: [4, 6, 8],
      aspectRatios: ['16:9', '9:16'], supportsAudio: true,
    })),
    capabilities: { remix: false, extend: true, referenceImage: true, lastFrame: true },
  },
  minimax: {
    id: 'minimax',
    name: 'MiniMax H3',
    modes: [
      { id: 'generate', label: 'Text to Video' },
      { id: 'image-to-video', label: 'First / Last Frame' },
      { id: 'reference-to-video', label: 'Reference to Video' },
    ],
    models: [
      h3Model('MiniMax-H3', 'H3', ['768P', '2K']),
      h3Model('MiniMax-H3-Highspeed', 'H3 Highspeed', ['480P', '768P']),
      h3Model('MiniMax-H3-Lite', 'H3 Lite', ['480P', '768P']),
      h3Model('MiniMax-H3-Max', 'H3 Max', ['480P', '768P'], 5, true),
    ],
    capabilities: {
      remix: false, extend: false, referenceImage: true, referenceVideo: true,
      referenceAudio: true, lastFrame: true, cancel: true, regenerate: true,
    },
  },
};
