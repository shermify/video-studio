import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useListJobsQuery } from '@/api';
import { useAppDispatch, useAppSelector } from '@/store';
import { setFilters } from '@/features/jobs/jobsSlice';
import { JobCard } from './JobCard';
import { Search } from 'lucide-react';
import type { CanonicalJobStatus } from '@video/types';

type FilterTab = 'all' | CanonicalJobStatus;

export function Queue() {
  const dispatch = useAppDispatch();
  const filters = useAppSelector((state) => state.jobs.filters);

  // Map tab to status filter
  const currentTab: FilterTab = filters.status ?? 'all';

  const { data, isLoading, isFetching } = useListJobsQuery({
    status: filters.status,
    q: filters.q,
    limit: 50,
  });

  const handleTabChange = (value: string) => {
    const tab = value as FilterTab;
    dispatch(setFilters({ status: tab === 'all' ? undefined : tab }));
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setFilters({ q: e.target.value || undefined }));
  };

  const jobs = data?.data ?? [];
  const total = data?.meta.total ?? 0;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <h2 className="text-lg font-semibold">Queue</h2>
        <p className="text-sm text-muted-foreground">
          {total} job{total !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Tabs */}
      <Tabs
        value={currentTab}
        onValueChange={handleTabChange}
        className="flex-1 flex flex-col"
      >
        <div className="border-b px-4 py-2">
          <TabsList className="w-full">
            <TabsTrigger value="all" className="flex-1">
              All
            </TabsTrigger>
            <TabsTrigger value="running" className="flex-1">
              Running
            </TabsTrigger>
            <TabsTrigger value="succeeded" className="flex-1">
              Done
            </TabsTrigger>
            <TabsTrigger value="failed" className="flex-1">
              Failed
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search prompts..."
              value={filters.q ?? ''}
              onChange={handleSearch}
              className="pl-8 h-8"
            />
          </div>
        </div>

        {/* Job list */}
        <TabsContent value={currentTab} className="flex-1 overflow-auto m-0">
          <div className="p-4 space-y-2">
            {isLoading ? (
              // Loading skeletons
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-2">
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-12" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ))
            ) : jobs.length === 0 ? (
              // Empty state
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <div className="text-3xl mb-2">📭</div>
                <p>No jobs found</p>
                {filters.q && (
                  <p className="text-sm">Try a different search term</p>
                )}
              </div>
            ) : (
              // Job cards
              jobs.map((job) => <JobCard key={job.id} job={job} />)
            )}

            {/* Loading indicator for refetching */}
            {isFetching && !isLoading && (
              <div className="text-center py-2 text-sm text-muted-foreground">
                Updating...
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
