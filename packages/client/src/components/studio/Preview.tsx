import { useRef, useState } from 'react';
import {
  Download,
  Loader2,
  RefreshCw,
  Square,
  WandSparkles,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  useCancelJobMutation,
  useGetJobQuery,
  useRefreshJobMutation,
  useRegenerateJobMutation,
} from '@/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { selectJob, selectSelectedJobId } from '@/features/jobs/jobsSlice';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { jobStatus } from './jobStatus';

export function Preview() {
  const selectedJobId = useAppSelector(selectSelectedJobId);
  if (!selectedJobId)
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div>
          <p className="text-lg font-medium">Your next shot starts here</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Create a video or select a job in the queue to preview it.
          </p>
        </div>
      </div>
    );
  return <SelectedJob key={selectedJobId} id={selectedJobId} />;
}

function SelectedJob({ id }: { id: string }) {
  const dispatch = useAppDispatch();
  const {
    currentData: job,
    isLoading,
    error: loadError,
    refetch,
  } = useGetJobQuery(id, {
    pollingInterval: 5000,
    skipPollingIfUnfocused: true,
  });
  const [selectedAssetIndex, setSelectedAssetIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [refreshJob, { isLoading: isRefreshing }] = useRefreshJobMutation();
  const [cancelJob, { isLoading: isCanceling }] = useCancelJobMutation();
  const [regenerateJob, { isLoading: isRegenerating }] =
    useRegenerateJobMutation();
  const regenerateRequest = useRef<string | undefined>(undefined);
  const busy = isRefreshing || isCanceling || isRegenerating;

  async function refresh() {
    setError(null);
    try {
      await refreshJob(id).unwrap();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function cancel() {
    setError(null);
    try {
      await cancelJob(id).unwrap();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function regenerate() {
    setError(null);
    regenerateRequest.current ??= crypto.randomUUID();
    try {
      const created = await regenerateJob({
        id,
        requestId: regenerateRequest.current,
      }).unwrap();
      regenerateRequest.current = undefined;
      dispatch(selectJob(created.id));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  if (isLoading)
    return (
      <div className="flex h-full items-center p-6">
        <Skeleton className="aspect-video w-full rounded-lg" />
      </div>
    );
  if (!job)
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div role="alert" className="space-y-3 text-center">
          <p className="text-destructive">
            {loadError ? errorMessage(loadError) : 'Job not found'}
          </p>
          <Button variant="outline" onClick={() => void refetch()}>
            Reload job
          </Button>
        </div>
      </div>
    );
  const status = jobStatus[job.status];
  const active = ['queued', 'running'].includes(job.status);
  const hasOutputs = job.outputs.length > 0;
  const usage = job.metadata?.usage;
  const usageEntries =
    usage && typeof usage === 'object'
      ? Object.entries(usage).filter(([, value]) => typeof value === 'number')
      : [];
  const archiveState = job.metadata?.archiveState;
  const effectiveModel =
    job.metadata?.model ?? job.params.model ?? job.provider;
  const effectiveResolution = job.metadata?.resolution ?? job.params.resolution;
  const effectiveRatio =
    job.metadata?.ratio ?? job.params.aspectRatio ?? job.params.ratio;
  const effectiveDuration = job.metadata?.duration ?? job.params.duration;
  const generatedAudio = job.params.generateAudio ?? job.params.generate_audio;

  const contentUrl = `/api/jobs/${encodeURIComponent(job.id)}/content?asset=${selectedAssetIndex}`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b px-5 py-4">
        <Badge variant="outline" className="text-xs uppercase tracking-wider">
          {job.provider}
        </Badge>
        <Badge variant={status.variant}>{status.label}</Badge>
        <div className="ml-auto flex flex-wrap gap-2">
          {(active || job.status === 'unknown') && (
            <Button
              variant="outline"
              className="min-h-10"
              onClick={() => void refresh()}
              disabled={busy}
            >
              <RefreshCw
                className={cn('size-4', isRefreshing && 'animate-spin')}
              />
              Refresh
            </Button>
          )}
          {job.actions.canCancel && (
            <Button
              variant="outline"
              className="min-h-10"
              onClick={() => void cancel()}
              disabled={busy}
            >
              {isCanceling ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Square className="size-4" />
              )}
              Cancel
            </Button>
          )}
          {hasOutputs && job.actions.canDownload && (
            <Button asChild variant="outline" className="min-h-10">
              <a href={`${contentUrl}&download=1`} download>
                <Download className="size-4" />
                Download
              </a>
            </Button>
          )}
        </div>
      </div>
      {(error || loadError) && (
        <p
          role="alert"
          className="border-b bg-destructive/5 p-4 text-sm text-destructive"
        >
          {error ?? errorMessage(loadError)}
        </p>
      )}
      <div className="flex min-h-48 flex-1 items-center justify-center p-5">
        {job.status === 'succeeded' && hasOutputs ? (
          <video
            key={contentUrl}
            src={contentUrl}
            controls
            preload="metadata"
            className="max-h-full max-w-full rounded-lg bg-black shadow-lg"
          />
        ) : active ? (
          <div className="space-y-4 text-center">
            <Loader2 className="mx-auto size-12 animate-spin text-primary" />
            <p className="text-lg font-medium">
              {job.status === 'queued'
                ? 'Waiting to start…'
                : 'Generating video…'}
            </p>
            {job.progressPct != null && (
              <p className="text-sm text-muted-foreground">
                {job.progressPct}% complete
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              You can leave this view; generation continues in the background.
            </p>
          </div>
        ) : (
          <div className="space-y-3 text-center">
            <p
              className={cn(
                'text-lg font-medium',
                job.status === 'failed' && 'text-destructive'
              )}
            >
              {job.status === 'failed'
                ? 'Generation failed'
                : job.status === 'canceled'
                  ? 'Generation canceled'
                  : job.status === 'unknown'
                    ? 'This job needs attention'
                    : 'No video available'}
            </p>
            {job.error && (
              <p className="max-w-lg whitespace-pre-wrap text-sm text-muted-foreground">
                {job.error.message}
              </p>
            )}
            {job.status === 'unknown' && (
              <p className="max-w-lg text-sm text-muted-foreground">
                Check the provider task before starting another generation.
              </p>
            )}
          </div>
        )}
      </div>
      {!['failed', 'unknown'].includes(job.status) && job.error && (
        <p role="alert" className="border-t p-4 text-sm text-destructive">
          {job.error.message}
        </p>
      )}
      {hasOutputs && job.outputs.length > 1 && (
        <div className="flex flex-wrap gap-2 border-t p-4">
          {job.outputs.map((_, index) => (
            <Button
              key={index}
              variant={selectedAssetIndex === index ? 'secondary' : 'outline'}
              onClick={() => setSelectedAssetIndex(index)}
            >
              Output {index + 1}
            </Button>
          ))}
        </div>
      )}
      <div className="max-h-[40%] space-y-3 overflow-auto border-t px-5 py-4">
        <p className="whitespace-pre-wrap text-sm">{job.prompt}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <span>{String(effectiveModel)}</span>
          {effectiveResolution != null && (
            <span>{String(effectiveResolution)}</span>
          )}
          <span>{String(effectiveRatio ?? 'adaptive')}</span>
          {effectiveDuration != null && (
            <span>{String(effectiveDuration)} seconds</span>
          )}
          <span>{new Date(job.createdAt).toLocaleString()}</span>
        </div>
        {typeof generatedAudio === 'boolean' && (
          <p className="text-sm text-muted-foreground">
            {generatedAudio ? 'Audio enabled' : 'Silent video'}
          </p>
        )}
        {archiveState === 'ready' && (
          <p className="text-sm text-muted-foreground">
            Local video copy saved.
          </p>
        )}
        {archiveState === 'pending' && (
          <p className="text-sm text-muted-foreground">
            Saving a local video copy…
          </p>
        )}
        {typeof job.metadata?.archiveError === 'string' && (
          <p role="alert" className="text-sm text-destructive">
            {job.metadata.archiveError}
          </p>
        )}

        {job.inputs && job.inputs.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {job.inputs.length} source input{job.inputs.length === 1 ? '' : 's'}{' '}
            ·{' '}
            {job.inputs
              .map((input) => input.role.replaceAll('_', ' '))
              .join(', ')}
          </p>
        )}
        {usageEntries.length > 0 && (
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Generation usage
            </summary>
            <dl className="mt-3 space-y-2 text-sm">
              {usageEntries.map(([key, value]) => (
                <div key={key} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">
                    {usageLabels[key] ?? key.replaceAll('_', ' ')}
                  </dt>
                  <dd>{Number(value).toLocaleString()}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}
        {job.actions.canRegenerate && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <p className="max-w-sm text-sm text-muted-foreground">
              Upgrade this 768P video to 2K using the original prompt and
              references.
            </p>
            <Button
              className="min-h-11"
              onClick={() => void regenerate()}
              disabled={busy}
            >
              {isRegenerating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <WandSparkles className="size-4" />
              )}
              Regenerate at 2K
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

const usageLabels: Record<string, string> = {
  total_seconds: 'Total metered seconds',
  input_seconds: 'Reference video seconds',
  output_seconds: 'Output seconds',
  input_image_count: 'Reference images',
  input_audio_seconds: 'Reference audio seconds',
  total_tokens: 'Total tokens',
  prompt_tokens: 'Input tokens',
  completion_tokens: 'Output tokens',
};
