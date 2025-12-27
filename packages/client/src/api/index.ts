import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type {
  CanonicalVideoJob,
  CreateJobRequest,
  CreateJobResponse,
  ListJobsQuery,
  ListJobsResponse,
  GetJobResponse,
  DeleteJobResponse,
  RefreshJobResponse,
  RemixJobRequest,
  RemixJobResponse,
  ExtendJobRequest,
  ExtendJobResponse,
  ListProvidersResponse,
  ProviderInfo,
} from '@video/types';

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  tagTypes: ['Job', 'Provider'],
  endpoints: (builder) => ({
    // Providers
    listProviders: builder.query<ProviderInfo[], void>({
      query: () => '/providers',
      transformResponse: (response: ListProvidersResponse) => response.data,
      providesTags: ['Provider'],
    }),

    // Jobs - List
    listJobs: builder.query<ListJobsResponse, ListJobsQuery | void>({
      query: (params) => {
        const searchParams = new URLSearchParams();
        if (params?.provider) searchParams.set('provider', params.provider);
        if (params?.status) searchParams.set('status', params.status);
        if (params?.q) searchParams.set('q', params.q);
        if (params?.limit) searchParams.set('limit', String(params.limit));
        if (params?.cursor) searchParams.set('cursor', params.cursor);
        const qs = searchParams.toString();
        return `/jobs${qs ? `?${qs}` : ''}`;
      },
      providesTags: (result) =>
        result
          ? [
              ...result.data.map(({ id }) => ({ type: 'Job' as const, id })),
              { type: 'Job', id: 'LIST' },
            ]
          : [{ type: 'Job', id: 'LIST' }],
    }),

    // Jobs - Get single
    getJob: builder.query<CanonicalVideoJob, string>({
      query: (id) => `/jobs/${id}`,
      transformResponse: (response: GetJobResponse) => response.data,
      providesTags: (_result, _error, id) => [{ type: 'Job', id }],
    }),

    // Jobs - Create
    createJob: builder.mutation<CanonicalVideoJob, CreateJobRequest>({
      query: (body) => ({
        url: '/jobs',
        method: 'POST',
        body,
      }),
      transformResponse: (response: CreateJobResponse) => response.data,
      invalidatesTags: [{ type: 'Job', id: 'LIST' }],
    }),

    // Jobs - Delete
    deleteJob: builder.mutation<{ id: string; deleted: true }, string>({
      query: (id) => ({
        url: `/jobs/${id}`,
        method: 'DELETE',
      }),
      transformResponse: (response: DeleteJobResponse) => response.data,
      invalidatesTags: (_result, _error, id) => [
        { type: 'Job', id },
        { type: 'Job', id: 'LIST' },
      ],
    }),

    // Jobs - Refresh status from provider
    refreshJob: builder.mutation<CanonicalVideoJob, string>({
      query: (id) => ({
        url: `/jobs/${id}/refresh`,
        method: 'POST',
      }),
      transformResponse: (response: RefreshJobResponse) => response.data,
      // Invalidate both the specific job AND the list (status may have changed)
      invalidatesTags: (_result, _error, id) => [
        { type: 'Job', id },
        { type: 'Job', id: 'LIST' },
      ],
    }),

    // Jobs - Remix (Sora only)
    remixJob: builder.mutation<
      CanonicalVideoJob,
      { id: string; body?: RemixJobRequest }
    >({
      query: ({ id, body }) => ({
        url: `/jobs/${id}/remix`,
        method: 'POST',
        body: body ?? {},
      }),
      transformResponse: (response: RemixJobResponse) => response.data,
      invalidatesTags: [{ type: 'Job', id: 'LIST' }],
    }),

    // Jobs - Extend (Veo only)
    extendJob: builder.mutation<
      CanonicalVideoJob,
      { id: string; body?: ExtendJobRequest }
    >({
      query: ({ id, body }) => ({
        url: `/jobs/${id}/extend`,
        method: 'POST',
        body: body ?? {},
      }),
      transformResponse: (response: ExtendJobResponse) => response.data,
      invalidatesTags: [{ type: 'Job', id: 'LIST' }],
    }),
  }),
});

export const {
  useListProvidersQuery,
  useListJobsQuery,
  useGetJobQuery,
  useCreateJobMutation,
  useDeleteJobMutation,
  useRefreshJobMutation,
  useRemixJobMutation,
  useExtendJobMutation,
} = api;
