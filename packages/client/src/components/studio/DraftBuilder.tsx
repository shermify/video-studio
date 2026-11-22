import { useRef, useState } from 'react';
import type { CreateJobRequest, ProviderId } from '@video-studio/types';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAppDispatch } from '@/store';
import { selectJob } from '@/features/jobs/jobsSlice';
import {
  createDraft,
  emptyImages,
  type DraftImages,
  type DraftImage,
  type DraftState,
} from '@/features/jobs/draft';
import { useListProvidersQuery, useCreateJobMutation } from '@/api';
import { errorMessage } from '@/lib/errors';
import { ImageDropZone } from './ImageDropZone';
import { MediaInputsEditor } from './MediaInputsEditor';

const promptHelpers = [
  { label: 'Cinematic', text: ', cinematic lighting and composition' },
  { label: 'Slow motion', text: ', slow motion' },
  { label: 'Aerial', text: ', aerial drone shot' },
  { label: 'Macro', text: ', extreme macro close-up' },
  { label: 'Handheld', text: ', handheld camera movement' },
  { label: 'Timelapse', text: ', timelapse' },
];

function Choice({
  id,
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value}
        onValueChange={onChange}
        disabled={disabled || options.length === 0}
      >
        <SelectTrigger id={id} className="h-11 w-full">
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function DraftBuilder() {
  const dispatch = useAppDispatch();
  const [draft, setDraft] = useState<DraftState>(() => createDraft());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploads, setUploads] = useState(0);
  const requestRef = useRef<{ fingerprint: string; id: string } | undefined>(
    undefined
  );
  const {
    data: providers,
    isLoading: providersLoading,
    error: providersError,
    refetch: reloadProviders,
  } = useListProvidersQuery();
  const [createJob, { isLoading: isCreating }] = useCreateJobMutation();
  const selectedProvider = providers?.find(
    (provider) => provider.id === draft.provider
  );
  const modes = (selectedProvider?.modes ?? []).filter(
    (mode) => mode.id !== 'remix' && mode.id !== 'extend'
  );
  const currentMode = modes.some((mode) => mode.id === draft.mode)
    ? draft.mode
    : (modes[0]?.id ?? 'generate');
  const models = selectedProvider?.models ?? [];
  const model =
    models.find((entry) => entry.id === draft.params.model) ?? models[0];
  const minimax = draft.provider === 'minimax';
  const frameMode = minimax && currentMode === 'image-to-video';
  const ratios = frameMode
    ? ['adaptive']
    : (model?.aspectRatios ?? []).filter(
        (ratio) =>
          ratio !== 'adaptive' ||
          (minimax &&
            currentMode === 'reference-to-video' &&
            model?.id !== 'MiniMax-H3-Lite')
      );
  const ratio = ratios.includes(String(draft.params.aspectRatio))
    ? String(draft.params.aspectRatio)
    : ratios.includes('16:9')
      ? '16:9'
      : (ratios[0] ?? '16:9');
  const duration = model?.durations.includes(Number(draft.params.duration))
    ? Number(draft.params.duration)
    : model?.durations.includes(8)
      ? 8
      : model?.durations[0];
  const resolutions = (model?.resolutions ?? []).filter((size) => {
    if (draft.provider !== 'sora') return true;
    const [width, height] = size.split('x').map(Number);
    return ratio === '9:16' ? height > width : width >= height;
  });
  const resolution = resolutions.includes(String(draft.params.resolution))
    ? String(draft.params.resolution)
    : resolutions.includes('768P')
      ? '768P'
      : resolutions[0];
  const busy = isCreating || uploads > 0;
  const needsMedia = minimax && currentMode !== 'generate';
  const validPrompt =
    draft.prompt.trim().length > 0 && (!minimax || draft.prompt.length <= 7000);

  function updateDraft(patch: Partial<DraftState>) {
    const changed = Object.entries(patch).some(
      ([key, value]) =>
        JSON.stringify(draft[key as keyof DraftState]) !== JSON.stringify(value)
    );
    if (changed) requestRef.current = undefined;
    setError(null);
    setNotice(null);
    setDraft((current) => ({ ...current, ...patch }));
  }

  function updateParam(key: string, value: unknown) {
    updateDraft({ params: { ...draft.params, [key]: value } });
  }

  function updateImage(slot: keyof DraftImages, image: DraftImage | null) {
    updateDraft({ images: { ...draft.images, [slot]: image } });
  }

  async function handleGenerate() {
    if (
      !validPrompt ||
      !model ||
      !duration ||
      busy ||
      (needsMedia && draft.media.length === 0)
    )
      return;
    setError(null);
    setNotice(null);
    const imageParams: Record<string, unknown> = {};
    if (draft.provider === 'veo') {
      if (draft.images.firstFrame)
        imageParams.image = {
          bytesBase64Encoded: draft.images.firstFrame.bytesBase64Encoded,
          mimeType: draft.images.firstFrame.mimeType,
        };
      if (draft.images.lastFrame)
        imageParams.lastFrame = {
          bytesBase64Encoded: draft.images.lastFrame.bytesBase64Encoded,
          mimeType: draft.images.lastFrame.mimeType,
        };
      if (draft.images.reference)
        imageParams.referenceImages = [
          {
            image: {
              bytesBase64Encoded: draft.images.reference.bytesBase64Encoded,
              mimeType: draft.images.reference.mimeType,
            },
            referenceType: 'asset',
          },
        ];
    } else if (draft.provider === 'sora' && draft.images.firstFrame) {
      imageParams.inputReference = {
        bytesBase64Encoded: draft.images.firstFrame.bytesBase64Encoded,
        mimeType: draft.images.firstFrame.mimeType,
      };
    }
    if (draft.provider === 'veo') imageParams.durationSeconds = duration;
    if (draft.provider === 'sora') {
      imageParams.seconds = duration;
      imageParams.size = resolution;
    }
    const body: CreateJobRequest = {
      provider: draft.provider,
      prompt: draft.prompt,
      mode: currentMode,
      params: minimax
        ? {
            model: model.id,
            resolution,
            duration,
            aspectRatio: ratio,
            generateAudio: draft.params.generateAudio ?? true,
            ...(model.promptExpansion
              ? {
                  promptExpansionMode:
                    draft.params.promptExpansionMode ?? 'balanced',
                }
              : {}),
          }
        : {
            ...draft.params,
            ...imageParams,
            model: model.id,
            aspectRatio: ratio,
            duration,
            ...(resolution ? { resolution } : {}),
          },
      ...(minimax ? { inputs: draft.media.map((item) => item.input) } : {}),
      ...(draft.assets.length ? { assets: draft.assets } : {}),
    };
    const fingerprint = JSON.stringify(body);
    if (requestRef.current?.fingerprint !== fingerprint)
      requestRef.current = { fingerprint, id: crypto.randomUUID() };
    try {
      const created = await createJob({
        ...body,
        requestId: requestRef.current.id,
      }).unwrap();
      requestRef.current = undefined;
      dispatch(selectJob(created.id));
      setNotice('Job added to the queue.');
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-5 py-4">
        <h2 className="text-lg font-semibold">Create a video</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a model and shape your next shot.
        </p>
      </div>
      <div className="flex-1 overflow-auto p-5 space-y-5">
        {providersError && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 p-3 text-sm"
          >
            <p className="text-destructive">{errorMessage(providersError)}</p>
            <Button
              type="button"
              variant="outline"
              className="mt-2"
              onClick={() => void reloadProviders()}
            >
              Reload providers
            </Button>
          </div>
        )}
        <fieldset
          disabled={busy}
          className="min-w-0 space-y-5 disabled:opacity-70"
        >
          <Choice
            id="provider"
            label="Provider"
            value={draft.provider}
            options={(providers ?? []).map((provider) => ({
              value: provider.id,
              label: provider.name,
            }))}
            onChange={(value) =>
              updateDraft({
                ...createDraft(value as ProviderId),
                prompt: draft.prompt,
              })
            }
            disabled={providersLoading}
          />
          {selectedProvider?.isStub && (
            <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
              Demo provider: jobs use simulated generation.
            </p>
          )}
          <Choice
            id="model"
            label="Model"
            value={model?.id ?? ''}
            options={models.map((entry) => ({
              value: entry.id,
              label: entry.label,
            }))}
            onChange={(value) =>
              updateDraft({ params: { ...draft.params, model: value } })
            }
          />
          {modes.length > 1 && (
            <Choice
              id="mode"
              label="Generation mode"
              value={currentMode}
              options={modes.map((mode) => ({
                value: mode.id,
                label: mode.label,
              }))}
              onChange={(value) =>
                updateDraft({ mode: value, media: [], images: emptyImages() })
              }
            />
          )}
          {modes.find((mode) => mode.id === currentMode)?.description && (
            <p className="text-sm text-muted-foreground">
              {modes.find((mode) => mode.id === currentMode)?.description}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="prompt">Prompt</Label>
            <Textarea
              id="prompt"
              value={draft.prompt}
              placeholder="Describe the scene, movement, sound, and dialogue…"
              className="min-h-40 resize-y"
              onChange={(event) => updateDraft({ prompt: event.target.value })}
              maxLength={minimax ? 7000 : undefined}
            />
            {minimax && (
              <p className="text-sm text-muted-foreground text-right">
                {draft.prompt.length.toLocaleString()} / 7,000
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {promptHelpers.map((helper) => (
                <Button
                  key={helper.label}
                  type="button"
                  variant="outline"
                  className="h-9 rounded-full px-3"
                  onClick={() =>
                    updateDraft({ prompt: draft.prompt + helper.text })
                  }
                >
                  {helper.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Choice
              id="aspect-ratio"
              label="Aspect ratio"
              value={ratio}
              options={ratios.map((value) => ({
                value,
                label: value === 'adaptive' ? 'Match input' : value,
              }))}
              onChange={(value) => updateParam('aspectRatio', value)}
              disabled={frameMode}
            />
            <Choice
              id="duration"
              label="Duration"
              value={String(duration ?? '')}
              options={(model?.durations ?? []).map((value) => ({
                value: String(value),
                label: `${value} seconds`,
              }))}
              onChange={(value) => updateParam('duration', Number(value))}
            />
          </div>
          {resolutions.length > 0 && (
            <Choice
              id="resolution"
              label="Resolution"
              value={resolution ?? ''}
              options={resolutions.map((value) => ({
                value,
                label: value,
              }))}
              onChange={(value) => updateParam('resolution', value)}
            />
          )}
          {model?.supportsAudio && (
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm">
              <input
                type="checkbox"
                checked={draft.params.generateAudio !== false}
                onChange={(event) =>
                  updateParam('generateAudio', event.target.checked)
                }
                className="size-5 accent-primary"
              />
              <span>Generate audio with the video</span>
            </label>
          )}
          {minimax && model?.promptExpansion && (
            <Choice
              id="prompt-expansion"
              label="Prompt expansion"
              value={String(draft.params.promptExpansionMode ?? 'balanced')}
              options={[
                { value: 'disabled', label: 'Disabled — use my prompt' },
                { value: 'balanced', label: 'Balanced' },
                { value: 'quality', label: 'Quality' },
              ]}
              onChange={(value) => updateParam('promptExpansionMode', value)}
            />
          )}
          {minimax ? (
            <MediaInputsEditor
              mode={currentMode}
              value={draft.media}
              onChange={(media) => updateDraft({ media })}
              disabled={busy}
              onUploadStateChange={(uploading) =>
                setUploads((count) => Math.max(0, count + (uploading ? 1 : -1)))
              }
            />
          ) : (
            <div className="space-y-3">
              <Label>Reference images</Label>
              <div className="flex gap-3">
                <ImageDropZone
                  label={
                    draft.provider === 'sora' ? 'Reference' : 'First frame'
                  }
                  image={draft.images.firstFrame}
                  onImageSet={(image) => updateImage('firstFrame', image)}
                  onImageClear={() => updateImage('firstFrame', null)}
                  disabled={busy}
                />
                {draft.provider === 'veo' && (
                  <>
                    <ImageDropZone
                      label="Last frame"
                      image={draft.images.lastFrame}
                      onImageSet={(image) => updateImage('lastFrame', image)}
                      onImageClear={() => updateImage('lastFrame', null)}
                      disabled={busy}
                    />
                    <ImageDropZone
                      label="Character"
                      image={draft.images.reference}
                      onImageSet={(image) => updateImage('reference', image)}
                      onImageClear={() => updateImage('reference', null)}
                      disabled={busy}
                    />
                  </>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {draft.provider === 'sora'
                  ? 'Add a reference image for the video.'
                  : 'Frames guide the shot; a character reference helps maintain consistency.'}
              </p>
            </div>
          )}
          {!minimax && draft.provider === 'veo' && (
            <div className="space-y-2">
              <Label htmlFor="seed">Seed (optional)</Label>
              <Input
                id="seed"
                type="number"
                value={String(draft.params.seed ?? '')}
                placeholder="Random"
                className="h-11"
                onChange={(event) =>
                  updateParam(
                    'seed',
                    event.target.value ? Number(event.target.value) : undefined
                  )
                }
              />
            </div>
          )}
        </fieldset>
      </div>
      <div className="border-t p-5 space-y-3">
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
          >
            <p>{error}</p>
            <p className="mt-1">
              Retrying this unchanged draft checks the same creation request.
            </p>
          </div>
        )}
        {notice && (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        )}
        {needsMedia && draft.media.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Add {frameMode ? 'a first or last frame' : 'at least one reference'}{' '}
            to continue.
          </p>
        )}
        <Button
          type="button"
          size="lg"
          className="h-12 w-full"
          onClick={() => void handleGenerate()}
          disabled={
            !validPrompt ||
            !model ||
            busy ||
            (needsMedia && draft.media.length === 0)
          }
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {isCreating
            ? 'Adding to queue…'
            : uploads > 0
              ? 'Uploading media…'
              : 'Generate video'}
        </Button>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {resolution ? `${resolution} · ` : ''}
            {ratio} · {duration ?? '—'}s
          </span>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => updateDraft(createDraft(draft.provider))}
          >
            Reset draft
          </Button>
        </div>
      </div>
    </div>
  );
}
