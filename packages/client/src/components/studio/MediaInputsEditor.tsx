import { useState } from 'react';
import type { MediaInput } from '@video-studio/types';
import { ImageIcon, Loader2, Music2, Upload, Video, X } from 'lucide-react';
import { useUploadMediaMutation } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DraftMedia } from '@/features/jobs/draft';
import { errorMessage } from '@/lib/errors';

type Kind = MediaInput['kind'];
type Role = MediaInput['role'];
const limits = { image: 30, video: 50, audio: 15 };
const accepts = {
  image: '.jpg,.jpeg,.png,.webp,.heic,.heif',
  video: '.mp4,.mov',
  audio: '.wav,.mp3',
};

function MediaPreview({
  item,
  onRemove,
}: {
  item: DraftMedia;
  onRemove: () => void;
}) {
  return (
    <div className="relative rounded-lg border p-3 space-y-2">
      <div className="flex items-center gap-2 pr-9">
        {item.input.kind === 'image' ? (
          <ImageIcon className="size-4 shrink-0" />
        ) : item.input.kind === 'video' ? (
          <Video className="size-4 shrink-0" />
        ) : (
          <Music2 className="size-4 shrink-0" />
        )}
        <p className="truncate text-sm" title={item.name}>
          {item.name}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1"
        aria-label={`Remove ${item.name}`}
        onClick={onRemove}
      >
        <X className="size-4" />
      </Button>
      {item.input.kind === 'image' && (
        <img
          src={item.previewUri}
          alt={item.name}
          className="max-h-40 w-full rounded object-contain"
        />
      )}
      {item.input.kind === 'video' && (
        <video
          src={item.previewUri}
          controls
          preload="metadata"
          className="max-h-40 w-full rounded"
        />
      )}
      {item.input.kind === 'audio' && (
        <audio
          src={item.previewUri}
          controls
          preload="metadata"
          className="w-full"
        />
      )}
      {item.uploaded && (
        <p className="text-sm text-muted-foreground">
          {(item.uploaded.size / 1_000_000).toFixed(1)} MB
          {item.uploaded.duration != null
            ? ` · ${item.uploaded.duration.toFixed(1)} seconds`
            : ''}
        </p>
      )}
    </div>
  );
}

function MediaPicker({
  kind,
  role,
  label,
  onAdd,
  disabled,
  onUploadStateChange,
}: {
  kind: Kind;
  role: Role;
  label: string;
  onAdd: (item: DraftMedia) => void;
  disabled?: boolean;
  onUploadStateChange: (uploading: boolean) => void;
}) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [upload, { isLoading }] = useUploadMediaMutation();
  const id = `${role}-file`;

  async function handleUpload(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > limits[kind] * 1_000_000) {
      setError(`${label} must be ${limits[kind]} MB or smaller.`);
      return;
    }
    onUploadStateChange(true);
    try {
      const uploaded = await upload(file).unwrap();
      if (uploaded.kind !== kind) {
        setError(
          `Choose an ${kind === 'image' ? 'image' : kind === 'audio' ? 'audio file' : 'video'}.`
        );
        return;
      }
      onAdd({
        id: crypto.randomUUID(),
        input: { kind, role, assetId: uploaded.id },
        name: uploaded.name,
        previewUri: uploaded.uri,
        uploaded,
      });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      onUploadStateChange(false);
    }
  }

  function handleUrl() {
    setError(null);
    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol !== 'https:')
        throw new Error('Use a public HTTPS URL.');
      onAdd({
        id: crypto.randomUUID(),
        input: { kind, role, uri: parsed.href },
        name: decodeURIComponent(parsed.pathname.split('/').pop() || label),
        previewUri: parsed.href,
      });
      setUrl('');
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message === 'Use a public HTTPS URL.'
          ? cause.message
          : 'Enter a valid public HTTPS URL.'
      );
    }
  }

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-sm text-muted-foreground">
          Up to {limits[kind]} MB
        </span>
      </div>
      <Input
        id={id}
        type="file"
        accept={accepts[kind]}
        disabled={disabled || isLoading}
        className="h-auto min-h-11 py-2"
        onChange={(event) => {
          void handleUpload(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <div className="flex gap-2">
        <Input
          aria-label={`${label} URL`}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          disabled={disabled || isLoading}
          placeholder="Or paste a public HTTPS URL"
          className="h-11 min-w-0"
        />
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={handleUrl}
          disabled={disabled || isLoading || !url.trim()}
        >
          Add URL
        </Button>
      </div>
      {isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Uploading media…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function MediaInputsEditor({
  mode,
  value,
  onChange,
  disabled,
  onUploadStateChange,
}: {
  mode: string;
  value: DraftMedia[];
  onChange: (items: DraftMedia[]) => void;
  disabled?: boolean;
  onUploadStateChange: (uploading: boolean) => void;
}) {
  const remove = (id: string) =>
    onChange(value.filter((item) => item.id !== id));
  const add = (item: DraftMedia) => onChange([...value, item]);

  if (mode === 'generate') return null;
  if (mode === 'image-to-video') {
    return (
      <div className="space-y-4">
        <div>
          <Label>Frame guidance</Label>
          <p className="text-sm text-muted-foreground mt-1">
            Use a first frame, a last frame, or both. The image determines the
            output aspect ratio.
          </p>
        </div>
        {(['first_frame', 'last_frame'] as const).map((role) => {
          const item = value.find((entry) => entry.input.role === role);
          return (
            <div key={role} className="space-y-2">
              <p className="text-sm font-medium">
                {role === 'first_frame' ? 'First frame' : 'Last frame'}
              </p>
              {item ? (
                <MediaPreview item={item} onRemove={() => remove(item.id)} />
              ) : (
                <MediaPicker
                  kind="image"
                  role={role}
                  label={role === 'first_frame' ? 'First frame' : 'Last frame'}
                  onAdd={add}
                  disabled={disabled}
                  onUploadStateChange={onUploadStateChange}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div>
        <Label>Reference media</Label>
        <p className="mt-1 text-sm text-muted-foreground">
          Up to 9 images, 3 videos, and 3 audio clips. Video and audio clips
          must each be 2–15 seconds, totaling no more than 15 seconds per media
          type.
        </p>
      </div>
      {(['image', 'video', 'audio'] as const).map((kind) => {
        const items = value.filter((entry) => entry.input.kind === kind);
        const max = kind === 'image' ? 9 : 3;
        return (
          <div key={kind} className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Upload className="size-4" />
              {kind === 'image'
                ? 'Images'
                : kind === 'video'
                  ? 'Videos'
                  : 'Audio'}{' '}
              ({items.length}/{max})
            </p>
            {items.map((item) => (
              <MediaPreview
                key={item.id}
                item={item}
                onRemove={() => remove(item.id)}
              />
            ))}
            {items.length < max && (
              <MediaPicker
                kind={kind}
                role={`reference_${kind}`}
                label={`Reference ${kind}`}
                onAdd={add}
                disabled={disabled}
                onUploadStateChange={onUploadStateChange}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
