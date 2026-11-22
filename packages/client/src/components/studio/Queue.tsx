import { useState } from 'react';
import { Search } from 'lucide-react';
import type { CanonicalJobStatus, ProviderId } from '@video-studio/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useListJobsQuery, useListProvidersQuery } from '@/api';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  selectJobFilters,
  setFilters,
  type JobFilters,
} from '@/features/jobs/jobsSlice';
import { errorMessage } from '@/lib/errors';
import { JobCard } from './JobCard';
import { jobStatus } from './jobStatus';

export function Queue() {
  const filters = useAppSelector(selectJobFilters);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-4 py-4">
        <h2 className="text-lg font-semibold">Queue</h2>
      </div>
      <QueueFilters filters={filters} />
      <QueuePage key={JSON.stringify(filters)} filters={filters} />
    </div>
  );
}

function QueueFilters({ filters }: { filters: JobFilters }) {
  const dispatch = useAppDispatch();
  const { data: providers } = useListProvidersQuery();
  return (
    <div className="space-y-3 border-b p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="queue-provider">Provider</Label>
          <Select
            value={filters.provider ?? 'all'}
            onValueChange={(value) =>
              dispatch(
                setFilters({
                  provider: value === 'all' ? undefined : (value as ProviderId),
                })
              )
            }
          >
            <SelectTrigger id="queue-provider" className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All providers</SelectItem>
              {providers?.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {provider.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="queue-status">Status</Label>
          <Select
            value={filters.status ?? 'all'}
            onValueChange={(value) =>
              dispatch(
                setFilters({
                  status:
                    value === 'all' ? undefined : (value as CanonicalJobStatus),
                })
              )
            }
          >
            <SelectTrigger id="queue-status" className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(jobStatus).map(([value, status]) => (
                <SelectItem key={value} value={value}>
                  {status.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search prompts"
          placeholder="Search prompts…"
          value={filters.q ?? ''}
          onChange={(event) =>
            dispatch(setFilters({ q: event.target.value || undefined }))
          }
          className="h-11 pl-10"
        />
      </div>
    </div>
  );
}

function QueuePage({ filters }: { filters: JobFilters }) {
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const { data, isLoading, isFetching, error, refetch } = useListJobsQuery(
    { ...filters, limit: 20, cursor: cursors.at(-1) },
    { pollingInterval: 5000, skipPollingIfUnfocused: true }
  );
  const jobs = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  return (
    <>
      <p className="px-4 pt-3 text-sm text-muted-foreground">
        {total} job{total === 1 ? '' : 's'}
      </p>
      <div className="min-h-0 flex-1 overflow-auto p-4 space-y-3">
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 p-3 text-sm"
          >
            <p className="text-destructive">{errorMessage(error)}</p>
            <Button
              variant="outline"
              className="mt-2"
              onClick={() => {
                if (cursors.length > 1) setCursors([undefined]);
                else void refetch();
              }}
            >
              Reload queue
            </Button>
          </div>
        )}
        {isLoading ? (
          Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-32 w-full rounded-lg" />
          ))
        ) : jobs.length === 0 && !error ? (
          <div className="py-12 text-center text-muted-foreground">
            <p>No jobs found</p>
            <p className="mt-1 text-sm">
              {filters.q || filters.status || filters.provider
                ? 'Try changing the filters.'
                : 'Create a video to get started.'}
            </p>
          </div>
        ) : (
          jobs.map((job) => <JobCard key={job.id} job={job} />)
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t p-4">
        <Button
          variant="outline"
          disabled={cursors.length === 1 || isFetching}
          onClick={() => setCursors((current) => current.slice(0, -1))}
        >
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {cursors.length}
        </span>
        <Button
          variant="outline"
          disabled={!data?.meta.nextCursor || isFetching}
          onClick={() => {
            const next = data?.meta.nextCursor;
            if (next) setCursors((current) => [...current, next]);
          }}
        >
          Next
        </Button>
      </div>
    </>
  );
}
