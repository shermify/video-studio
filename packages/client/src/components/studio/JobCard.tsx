import { useState } from 'react';
import type { CanonicalVideoJob } from '@video-studio/types';
import { Star, Trash2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  selectFavorites,
  selectJob,
  selectSelectedJobId,
  toggleFavorite,
} from '@/features/jobs/jobsSlice';
import { useDeleteJobMutation, useRefreshJobMutation } from '@/api';
import { errorMessage } from '@/lib/errors';
import { jobStatus } from './jobStatus';

export function JobCard({ job }: { job: CanonicalVideoJob }) {
  const dispatch = useAppDispatch();
  const selectedJobId = useAppSelector(selectSelectedJobId);
  const favorites = useAppSelector(selectFavorites);
  const isSelected = selectedJobId === job.id;
  const isFavorite = favorites.includes(job.id);
  const [error, setError] = useState<string | null>(null);
  const [deleteJob, { isLoading: isDeleting }] = useDeleteJobMutation();
  const [refreshJob, { isLoading: isRefreshing }] = useRefreshJobMutation();
  const status = jobStatus[job.status];
  const active = ['queued', 'running', 'unknown'].includes(job.status);

  async function handleRefresh() {
    setError(null);
    try {
      await refreshJob(job.id).unwrap();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function handleDelete() {
    setError(null);
    try {
      await deleteJob(job.id).unwrap();
      if (isSelected) dispatch(selectJob(null));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <article
      className={cn(
        'rounded-lg border p-3 transition-colors hover:bg-accent/40',
        isSelected && 'border-primary bg-accent'
      )}
    >
      <button
        type="button"
        onClick={() => dispatch(selectJob(isSelected ? null : job.id))}
        aria-pressed={isSelected}
        className="w-full cursor-pointer space-y-2 text-left focus-visible:outline-ring"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-xs uppercase tracking-wider">
            {job.provider}
          </Badge>
          <Badge variant={status.variant}>{status.label}</Badge>
          {active && job.progressPct != null && (
            <span className="text-sm text-muted-foreground">
              {job.progressPct}%
            </span>
          )}
        </div>
        <p className="line-clamp-2 text-sm">{job.prompt}</p>
        <p className="text-sm text-muted-foreground">
          {new Date(job.createdAt).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </p>
      </button>
      <div className="mt-2 flex items-center gap-1">
        {job.outputs.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {job.outputs.length} output{job.outputs.length !== 1 ? 's' : ''}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={isFavorite ? 'Remove favorite' : 'Favorite job'}
            onClick={() => dispatch(toggleFavorite(job.id))}
            className={cn(isFavorite && 'text-yellow-500')}
          >
            <Star className={cn('size-4', isFavorite && 'fill-current')} />
          </Button>
          {active && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Refresh job"
              onClick={() => void handleRefresh()}
              disabled={isRefreshing}
            >
              <RefreshCw
                className={cn('size-4', isRefreshing && 'animate-spin')}
              />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Delete job"
            onClick={() => void handleDelete()}
            disabled={isDeleting || !job.actions.canDelete}
            title={
              job.actions.canDelete
                ? 'Delete job'
                : 'Resolve or cancel this job before deleting it.'
            }
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </article>
  );
}
