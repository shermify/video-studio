import { useEffect } from 'react';
import type { CanonicalVideoJob } from '@video/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Star, Trash2, RefreshCw } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { selectJob, toggleFavorite } from '@/features/jobs/jobsSlice';
import { useDeleteJobMutation, useRefreshJobMutation } from '@/api';

interface JobCardProps {
  job: CanonicalVideoJob;
}

const statusConfig: Record<
  CanonicalVideoJob['status'],
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

export function JobCard({ job }: JobCardProps) {
  const dispatch = useAppDispatch();
  const selectedJobId = useAppSelector((state) => state.jobs.selectedJobId);
  const favorites = useAppSelector((state) => state.jobs.favorites);
  const isSelected = selectedJobId === job.id;
  const isFavorite = favorites.includes(job.id);

  const [deleteJob, { isLoading: isDeleting }] = useDeleteJobMutation();
  const [refreshJob, { isLoading: isRefreshing }] = useRefreshJobMutation();

  const status = statusConfig[job.status];
  const isRunning = job.status === 'queued' || job.status === 'running';

  // Auto-poll running jobs every 5 seconds
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      refreshJob(job.id);
    }, 5000);

    return () => clearInterval(interval);
  }, [job.id, isRunning, refreshJob]);

  const handleSelect = () => {
    dispatch(selectJob(isSelected ? null : job.id));
  };

  const handleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch(toggleFavorite(job.id));
  };

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await refreshJob(job.id);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteJob(job.id);
  };

  const createdAt = new Date(job.createdAt);
  const timeAgo = getTimeAgo(createdAt);

  return (
    <div
      onClick={handleSelect}
      className={cn(
        'group relative rounded-lg border p-3 cursor-pointer transition-colors',
        'hover:bg-accent/50',
        isSelected && 'border-primary bg-accent'
      )}
    >
      {/* Header: Provider badge + status + time */}
      <div className="flex items-center gap-2 mb-2">
        <Badge
          variant="outline"
          className="text-[10px] uppercase tracking-wider"
        >
          {job.provider}
        </Badge>
        <Badge variant={status.variant}>{status.label}</Badge>
        {isRunning && job.progressPct != null && (
          <span className="text-xs text-muted-foreground">
            {job.progressPct}%
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{timeAgo}</span>
      </div>

      {/* Prompt snippet */}
      <p className="text-sm line-clamp-2 mb-2">{job.prompt}</p>

      {/* Footer: outputs count + actions */}
      <div className="flex items-center gap-1">
        {job.outputs.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {job.outputs.length} output{job.outputs.length !== 1 ? 's' : ''}
          </span>
        )}

        {/* Actions - show on hover */}
        <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleFavorite}
            className={cn(isFavorite && 'text-yellow-500')}
          >
            <Star className={cn('size-3.5', isFavorite && 'fill-current')} />
          </Button>
          {isRunning && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw
                className={cn('size-3.5', isRefreshing && 'animate-spin')}
              />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Progress bar for running jobs */}
      {isRunning && job.progressPct != null && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-muted rounded-b-lg overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${job.progressPct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
