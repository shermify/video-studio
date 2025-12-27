import { useAppSelector } from '@/store';
import { useGetJobQuery } from '@/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, Play, Pause, RefreshCw, Loader2 } from 'lucide-react';
import { useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useRefreshJobMutation } from '@/api';

const statusConfig: Record<
  string,
  {
    label: string;
    variant:
      | 'default'
      | 'secondary'
      | 'destructive'
      | 'success'
      | 'warning'
      | 'outline';
  }
> = {
  queued: { label: 'Queued', variant: 'secondary' },
  running: { label: 'Running', variant: 'warning' },
  succeeded: { label: 'Complete', variant: 'success' },
  failed: { label: 'Failed', variant: 'destructive' },
  canceled: { label: 'Canceled', variant: 'outline' },
  unknown: { label: 'Unknown', variant: 'outline' },
};

export function Preview() {
  const selectedJobId = useAppSelector((state) => state.jobs.selectedJobId);

  const { data: job, isLoading } = useGetJobQuery(selectedJobId!, {
    skip: !selectedJobId,
    pollingInterval: 0, // We handle polling in the component based on status
  });

  const [refreshJob, { isLoading: isRefreshing }] = useRefreshJobMutation();

  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedAssetIndex, setSelectedAssetIndex] = useState(0);
  const [prevJobId, setPrevJobId] = useState(selectedJobId);

  // Reset selected asset when job changes (during render, not in effect)
  if (selectedJobId !== prevJobId) {
    setPrevJobId(selectedJobId);
    setSelectedAssetIndex(0);
    setIsPlaying(false);
  }

  // Auto-play when job completes
  useEffect(() => {
    if (
      job?.status === 'succeeded' &&
      job.outputs.length > 0 &&
      videoRef.current
    ) {
      videoRef.current.play().catch(() => {
        // Autoplay blocked, user will need to click play
      });
    }
  }, [job?.status, job?.outputs.length]);

  // Poll running jobs
  useEffect(() => {
    if (!job || !['queued', 'running'].includes(job.status)) return;

    const interval = setInterval(() => {
      refreshJob(job.id);
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [job, refreshJob]);

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  };

  const handleDownload = async () => {
    if (!job) return;
    const url = `/api/jobs/${job.id}/content?asset=${selectedAssetIndex}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${job.prompt.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_')}_${job.id.slice(0, 8)}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleRefresh = () => {
    if (job) {
      refreshJob(job.id);
    }
  };

  // Empty state
  if (!selectedJobId) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
          <div className="text-6xl opacity-50">🎬</div>
          <div className="text-lg">Select a job to preview</div>
          <div className="text-sm">
            Click on a job in the queue to view it here
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b px-4 py-3">
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Skeleton className="aspect-video w-full max-w-2xl" />
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Job not found
        </div>
      </div>
    );
  }

  const status = statusConfig[job.status] || statusConfig.unknown;
  const isRunning = job.status === 'queued' || job.status === 'running';
  const hasOutputs = job.outputs.length > 0;
  const videoUrl = hasOutputs
    ? `/api/jobs/${job.id}/content?asset=${selectedAssetIndex}`
    : null;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center gap-3">
        <Badge
          variant="outline"
          className="text-[10px] uppercase tracking-wider"
        >
          {job.provider}
        </Badge>
        <Badge variant={status.variant}>{status.label}</Badge>
        {isRunning && (
          <>
            {job.progressPct != null && (
              <span className="text-sm text-muted-foreground">
                {job.progressPct}%
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              <span className="ml-1">Refresh</span>
            </Button>
          </>
        )}
        {hasOutputs && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="ml-auto"
          >
            <Download className="size-4" />
            <span className="ml-1">Download</span>
          </Button>
        )}
      </div>

      {/* Video player or status */}
      <div className="flex-1 flex items-center justify-center p-4 min-h-0">
        {job.status === 'succeeded' && hasOutputs ? (
          <div className="relative h-full w-full flex items-center justify-center">
            <video
              ref={videoRef}
              src={videoUrl!}
              className="max-w-full max-h-full rounded-lg shadow-lg bg-black"
              controls
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
            />
            {/* Play/Pause overlay button */}
            <button
              onClick={handlePlayPause}
              className={cn(
                'absolute inset-0 flex items-center justify-center pointer-events-none'
              )}
            >
              <div
                className={cn(
                  'bg-white/90 rounded-full p-4 pointer-events-auto',
                  'opacity-0 hover:opacity-100 transition-opacity'
                )}
              >
                {isPlaying ? (
                  <Pause className="size-8 text-black" />
                ) : (
                  <Play className="size-8 text-black ml-1" />
                )}
              </div>
            </button>
          </div>
        ) : isRunning ? (
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <Loader2 className="size-16 animate-spin text-primary" />
            </div>
            <div className="text-center">
              <p className="text-lg font-medium">
                {job.status === 'queued'
                  ? 'Waiting to start...'
                  : 'Generating video...'}
              </p>
              {job.progressPct != null && (
                <p className="text-muted-foreground">
                  {job.progressPct}% complete
                </p>
              )}
            </div>
            {/* Progress bar */}
            {job.progressPct != null && (
              <div className="w-64 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${job.progressPct}%` }}
                />
              </div>
            )}
          </div>
        ) : job.status === 'failed' ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="text-6xl">❌</div>
            <div>
              <p className="text-lg font-medium text-destructive">
                Generation failed
              </p>
              {job.error && (
                <p className="text-sm text-muted-foreground mt-1">
                  {job.error.message}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center text-muted-foreground">
            <div className="text-6xl">🎥</div>
            <p>No video available</p>
          </div>
        )}
      </div>

      {/* Output strip for multiple outputs */}
      {hasOutputs && job.outputs.length > 1 && (
        <div className="border-t px-4 py-3">
          <p className="text-xs text-muted-foreground mb-2">
            {job.outputs.length} outputs
          </p>
          <div className="flex gap-2 overflow-x-auto">
            {job.outputs.map((_, index) => (
              <button
                key={index}
                onClick={() => setSelectedAssetIndex(index)}
                className={cn(
                  'shrink-0 w-20 h-12 rounded border-2 transition-colors',
                  'flex items-center justify-center text-xs font-medium',
                  selectedAssetIndex === index
                    ? 'border-primary bg-primary/10'
                    : 'border-muted hover:border-muted-foreground'
                )}
              >
                #{index + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Job details */}
      <div className="border-t px-4 py-3">
        <p className="text-sm line-clamp-3">{job.prompt}</p>
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          <span>{String(job.params.aspectRatio ?? '16:9')}</span>
          {'duration' in job.params && (
            <span>{String(job.params.duration)}s</span>
          )}
          {'model' in job.params && (
            <span className="truncate">{String(job.params.model)}</span>
          )}
          <span className="ml-auto">
            {new Date(job.createdAt).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
