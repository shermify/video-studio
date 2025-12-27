import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  setDraftProvider,
  setDraftPrompt,
  setDraftMode,
  setDraftParams,
  setDraftImage,
  clearDraftImage,
  resetDraft,
  type DraftImage,
  type DraftImages,
} from '@/features/jobs/jobsSlice';
import { ImageDropZone } from './ImageDropZone';
import { useListProvidersQuery, useCreateJobMutation } from '@/api';
import { Loader2, ChevronDown, Sparkles } from 'lucide-react';
import type { ProviderId } from '@video/types';
import { cn } from '@/lib/utils';

// Prompt helper chips for quick prompt additions
const promptHelpers = [
  { label: 'Cinematic', text: ', cinematic lighting and composition' },
  { label: 'Slow-mo', text: ', slow motion' },
  { label: 'Aerial', text: ', aerial drone shot' },
  { label: 'Macro', text: ', extreme macro close-up' },
  { label: 'Handheld', text: ', handheld camera movement' },
  { label: 'Timelapse', text: ', timelapse' },
];

// Common aspect ratio options
const aspectRatios = [
  { value: '16:9', label: '16:9 (Landscape)' },
  { value: '9:16', label: '9:16 (Portrait)' },
  { value: '1:1', label: '1:1 (Square)' },
];

// Provider-specific duration options
const durationsByProvider: Record<string, { value: string; label: string }[]> =
  {
    veo: [
      { value: '4', label: '4 seconds' },
      { value: '6', label: '6 seconds' },
      { value: '8', label: '8 seconds' },
    ],
    sora: [
      { value: '4', label: '4 seconds' },
      { value: '8', label: '8 seconds' },
      { value: '12', label: '12 seconds' },
    ],
  };

// Provider-specific model options
const modelsByProvider: Record<string, { value: string; label: string }[]> = {
  veo: [
    { value: 'veo-3.1-generate-preview', label: 'Veo 3.1' },
    { value: 'veo-3.1-fast-generate-preview', label: 'Veo 3.1 Fast' },
  ],
  sora: [{ value: 'sora-2', label: 'Sora 2' }],
};

// Default models per provider
const defaultModels: Record<string, string> = {
  veo: 'veo-3.1-generate-preview',
  sora: 'sora-2',
};

// Default durations per provider
const defaultDurations: Record<string, string> = {
  veo: '8',
  sora: '8',
};

export function DraftBuilder() {
  const dispatch = useAppDispatch();
  const draft = useAppSelector((state) => state.jobs.draft);

  const { data: providers, isLoading: providersLoading } =
    useListProvidersQuery();
  const [createJob, { isLoading: isCreating }] = useCreateJobMutation();

  // Get the currently selected provider's metadata
  const selectedProvider = providers?.find((p) => p.id === draft.provider);
  const availableModes = selectedProvider?.modes ?? [];

  // Ensure current mode is valid for selected provider
  const currentMode = availableModes.find((m) => m.id === draft.mode)
    ? draft.mode
    : (availableModes[0]?.id ?? 'generate');

  // Get provider-specific options
  const availableModels = modelsByProvider[draft.provider] ?? [];
  const availableDurations = durationsByProvider[draft.provider] ?? [];
  const currentModel =
    (draft.params.model as string) ?? defaultModels[draft.provider];
  const currentDuration =
    (draft.params.duration as string) ?? defaultDurations[draft.provider];

  const handleProviderChange = (value: string) => {
    dispatch(setDraftProvider(value as ProviderId));
  };

  const handleModeChange = (value: string) => {
    if (value) {
      dispatch(setDraftMode(value));
    }
  };

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    dispatch(setDraftPrompt(e.target.value));
  };

  const handleAddPromptHelper = (text: string) => {
    dispatch(setDraftPrompt(draft.prompt + text));
  };

  const handleParamChange = (key: string, value: unknown) => {
    dispatch(setDraftParams({ [key]: value }));
  };

  const handleReset = () => {
    dispatch(resetDraft());
  };

  const handleImageSet = (slot: keyof DraftImages, image: DraftImage) => {
    dispatch(setDraftImage({ slot, image }));
  };

  const handleImageClear = (slot: keyof DraftImages) => {
    dispatch(clearDraftImage(slot));
  };

  const handleGenerate = async () => {
    if (!draft.prompt.trim()) return;

    // Build image params based on provider
    const imageParams: Record<string, unknown> = {};

    if (draft.provider === 'veo') {
      // Veo: first frame, last frame, and reference images
      if (draft.images.firstFrame) {
        imageParams.image = {
          bytesBase64Encoded: draft.images.firstFrame.bytesBase64Encoded,
          mimeType: draft.images.firstFrame.mimeType,
        };
      }
      if (draft.images.lastFrame) {
        imageParams.lastFrame = {
          bytesBase64Encoded: draft.images.lastFrame.bytesBase64Encoded,
          mimeType: draft.images.lastFrame.mimeType,
        };
      }
      if (draft.images.reference) {
        imageParams.referenceImages = [
          {
            image: {
              bytesBase64Encoded: draft.images.reference.bytesBase64Encoded,
              mimeType: draft.images.reference.mimeType,
            },
            referenceType: 'asset',
          },
        ];
      }
    } else if (draft.provider === 'sora') {
      // Sora: input reference image
      if (draft.images.firstFrame) {
        imageParams.inputReference = {
          bytesBase64Encoded: draft.images.firstFrame.bytesBase64Encoded,
          mimeType: draft.images.firstFrame.mimeType,
        };
      }
    }

    await createJob({
      provider: draft.provider,
      prompt: draft.prompt.trim(),
      mode: currentMode,
      params: {
        ...draft.params,
        ...imageParams,
        model: currentModel,
        aspectRatio: draft.params.aspectRatio ?? '16:9',
        duration: Number(currentDuration),
      },
      assets: draft.assets.length > 0 ? draft.assets : undefined,
    });

    // Optionally reset after creation
    // dispatch(resetDraft());
  };

  const isGenerateDisabled = !draft.prompt.trim() || isCreating;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <h2 className="text-lg font-semibold">Create</h2>
      </div>

      {/* Form content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Provider & Model */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="provider">Provider</Label>
            <Select
              value={draft.provider}
              onValueChange={handleProviderChange}
              disabled={providersLoading}
            >
              <SelectTrigger id="provider">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {providers?.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <Select
              value={currentModel}
              onValueChange={(value) => handleParamChange('model', value)}
            >
              <SelectTrigger id="model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map((model) => (
                  <SelectItem key={model.value} value={model.value}>
                    {model.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Mode Switch */}
        {availableModes.length > 0 && (
          <div className="space-y-2">
            <Label>Mode</Label>
            <ToggleGroup
              type="single"
              value={currentMode}
              onValueChange={handleModeChange}
              className="w-full justify-start"
            >
              {availableModes.map((mode) => (
                <ToggleGroupItem
                  key={mode.id}
                  value={mode.id}
                  className="flex-1"
                >
                  {mode.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        )}

        {/* Prompt */}
        <div className="space-y-2">
          <Label htmlFor="prompt">Prompt</Label>
          <Textarea
            id="prompt"
            placeholder="Describe the video you want to generate..."
            value={draft.prompt}
            onChange={handlePromptChange}
            className="min-h-[120px] resize-none"
          />
          {/* Prompt helpers */}
          <div className="flex flex-wrap gap-1.5">
            {promptHelpers.map((helper) => (
              <button
                key={helper.label}
                type="button"
                onClick={() => handleAddPromptHelper(helper.text)}
                className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors hover:bg-accent"
              >
                {helper.label}
              </button>
            ))}
          </div>
        </div>

        {/* Output Settings */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="aspectRatio">Aspect Ratio</Label>
            <Select
              value={(draft.params.aspectRatio as string) ?? '16:9'}
              onValueChange={(value) => handleParamChange('aspectRatio', value)}
            >
              <SelectTrigger id="aspectRatio">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {aspectRatios.map((ratio) => (
                  <SelectItem key={ratio.value} value={ratio.value}>
                    {ratio.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration">Duration</Label>
            <Select
              value={currentDuration}
              onValueChange={(value) => handleParamChange('duration', value)}
            >
              <SelectTrigger id="duration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableDurations.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Advanced Settings (Collapsible) */}
        <Collapsible>
          <CollapsibleTrigger className="flex w-full items-center justify-between py-2 text-sm font-medium hover:text-foreground text-muted-foreground">
            Advanced options
            <ChevronDown className="size-4 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-2">
            <div className="space-y-2">
              <Label htmlFor="seed">Seed (optional)</Label>
              <input
                id="seed"
                type="number"
                placeholder="Random"
                value={(draft.params.seed as string) ?? ''}
                onChange={(e) =>
                  handleParamChange(
                    'seed',
                    e.target.value ? Number(e.target.value) : undefined
                  )
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            {/* Provider-specific options could go here */}
            <p className="text-xs text-muted-foreground">
              Provider-specific options for{' '}
              {selectedProvider?.name ?? draft.provider} will appear here.
            </p>
          </CollapsibleContent>
        </Collapsible>

        {/* Image Drop Zones */}
        <div className="space-y-2">
          <Label>Reference Images</Label>
          <div className="flex gap-2">
            <ImageDropZone
              label={draft.provider === 'sora' ? 'Reference' : 'First Frame'}
              image={draft.images.firstFrame}
              onImageSet={(img) => handleImageSet('firstFrame', img)}
              onImageClear={() => handleImageClear('firstFrame')}
            />
            {draft.provider === 'veo' && (
              <>
                <ImageDropZone
                  label="Last Frame"
                  image={draft.images.lastFrame}
                  onImageSet={(img) => handleImageSet('lastFrame', img)}
                  onImageClear={() => handleImageClear('lastFrame')}
                />
                <ImageDropZone
                  label="Character"
                  image={draft.images.reference}
                  onImageSet={(img) => handleImageSet('reference', img)}
                  onImageClear={() => handleImageClear('reference')}
                />
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {draft.provider === 'sora'
              ? 'Drop an image to use as a reference for video generation'
              : 'First/last frame guide the video, character ref maintains consistency'}
          </p>
        </div>
      </div>

      {/* Footer with Generate button */}
      <div className="border-t p-4 space-y-3">
        <Button
          onClick={handleGenerate}
          disabled={isGenerateDisabled}
          className="w-full"
          size="lg"
        >
          {isCreating ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              Generate
            </>
          )}
        </Button>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {String(draft.params.aspectRatio ?? '16:9')} • {currentDuration}s
          </span>
          <button
            type="button"
            onClick={handleReset}
            className={cn(
              'hover:text-foreground transition-colors',
              !draft.prompt && 'opacity-50 pointer-events-none'
            )}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
