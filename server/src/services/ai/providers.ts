export interface Prompt {
  system: string;
  user: string;
}
export type ProviderFn = (p: Prompt) => Promise<string>;

export class ProviderError extends Error {
  constructor(message: string, public readonly retryable: boolean, public readonly status?: number) {
    super(message);
    this.name = 'ProviderError';
  }
}

const isRetryable = (status: number) => status === 429 || status >= 500;

interface ProviderConfig {
  apiKey: string;
  model: string;
}

export function geminiProvider(cfg: ProviderConfig, fetchImpl: typeof fetch = fetch): ProviderFn {
  return async ({ system, user }) => {
    let res: Response;
    try {
      res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      throw new ProviderError(`gemini request failed: ${(err as Error).message}`, true);
    }
    if (!res.ok) throw new ProviderError(`gemini HTTP ${res.status}`, isRetryable(res.status), res.status);
    const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text) throw new ProviderError('gemini returned no candidates', true);
    return text;
  };
}

export function openaiProvider(cfg: ProviderConfig, fetchImpl: typeof fetch = fetch): ProviderFn {
  return async ({ system, user }) => {
    let res: Response;
    try {
      res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: cfg.model,
          temperature: 0.4,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      throw new ProviderError(`openai request failed: ${(err as Error).message}`, true);
    }
    if (!res.ok) throw new ProviderError(`openai HTTP ${res.status}`, isRetryable(res.status), res.status);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text) throw new ProviderError('openai returned empty content', true);
    return text;
  };
}
