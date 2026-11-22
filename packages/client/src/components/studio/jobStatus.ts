export const jobStatus = {
  queued: { label: 'Queued', variant: 'secondary' },
  running: { label: 'Running', variant: 'warning' },
  succeeded: { label: 'Complete', variant: 'success' },
  failed: { label: 'Failed', variant: 'destructive' },
  canceled: { label: 'Canceled', variant: 'outline' },
  unknown: { label: 'Needs attention', variant: 'outline' },
} as const;
