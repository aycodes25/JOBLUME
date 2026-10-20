import { QueryClient, focusManager } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { ApiRequestError } from './api/client';

/** Same rule as the web: retry network and server errors twice, never a 4xx. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return !(error instanceof ApiRequestError && error.status >= 400 && error.status < 500) && failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 15_000, refetchOnWindowFocus: true, retry: shouldRetry },
    },
  });
}

/** TanStack Query's "window focus" on a phone: the app coming back to the foreground. Returns the unsubscribe. */
export function watchAppFocus(): () => void {
  focusManager.setEventListener((setFocused) => {
    const sub = AppState.addEventListener('change', (state) => setFocused(state === 'active'));
    return () => sub.remove();
  });
  return () => focusManager.setEventListener(() => () => {});
}
