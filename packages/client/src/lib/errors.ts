export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    if ('data' in error) {
      const data = error.data;
      if (data && typeof data === 'object' && 'error' in data) {
        const detail = data.error;
        if (
          detail &&
          typeof detail === 'object' &&
          'message' in detail &&
          typeof detail.message === 'string'
        )
          return detail.message;
      }
    }
    if ('message' in error && typeof error.message === 'string')
      return error.message;
    if ('error' in error && typeof error.error === 'string') return error.error;
  }
  return 'The request could not be completed. Please try again.';
}
