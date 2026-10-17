export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
    public readonly details?: unknown,
  ) {
    super(message ?? code);
    this.name = 'ApiRequestError';
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  getToken(): Promise<string | null>;
  onUnauthorized(): void | Promise<void>;
  fetchImpl?: typeof fetch;
}

export interface RequestInitLite {
  method?: string;
  json?: unknown;
  formData?: FormData;
}

export type ApiClient = <T>(path: string, init?: RequestInitLite) => Promise<T>;

export function createApiClient(opts: ApiClientOptions): ApiClient {
  const doFetch: typeof fetch = opts.fetchImpl ?? ((...args) => fetch(...args));

  async function notifyUnauthorized(): Promise<void> {
    try {
      await opts.onUnauthorized();
    } catch {
      // A failing callback must never replace the original 401.
    }
  }

  return async function request<T>(path: string, init: RequestInitLite = {}): Promise<T> {
    const token = await opts.getToken();
    if (!token) {
      await notifyUnauthorized();
      throw new ApiRequestError(401, 'unauthorized');
    }

    const headers: Record<string, string> = { authorization: `Bearer ${token}` };
    let body: BodyInit | undefined;
    if (init.json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(init.json);
    } else if (init.formData) {
      body = init.formData;
    }

    let res: Response;
    try {
      res = await doFetch(`${opts.baseUrl}${path}`, { method: init.method ?? 'GET', headers, body });
    } catch {
      throw new ApiRequestError(0, 'network_error', 'Network request failed');
    }

    if (res.status === 401) {
      await notifyUnauthorized();
      throw new ApiRequestError(401, 'unauthorized');
    }

    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        if (res.ok) throw new ApiRequestError(res.status, 'bad_response', 'The server sent an unreadable response');
        data = null;
      }
    }

    if (!res.ok) {
      const errBody = (data ?? {}) as { error?: string; message?: string; details?: unknown };
      throw new ApiRequestError(res.status, errBody.error ?? 'http_error', errBody.message, errBody.details);
    }
    return data as T;
  };
}
