import { describe, expect, it, vi } from 'vitest';
import { geminiProvider, openaiProvider, ProviderError } from '../../src/services/ai/providers.js';

const prompt = { system: 'sys', user: 'usr' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('geminiProvider', () => {
  it('posts to the model endpoint with the api key header and returns the text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] }));
    const out = await geminiProvider({ apiKey: 'K', model: 'gemini-x' }, fetchImpl as unknown as typeof fetch)(prompt);
    expect(out).toBe('{"a":1}');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent');
    expect((init as RequestInit).headers).toMatchObject({ 'x-goog-api-key': 'K' });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.systemInstruction.parts[0].text).toBe('sys');
    expect(body.contents[0].parts[0].text).toBe('usr');
  });

  it('marks 429 and 5xx as retryable, 400 as not', async () => {
    const run = (status: number) =>
      geminiProvider({ apiKey: 'K', model: 'm' }, vi.fn().mockResolvedValue(json({}, status)) as unknown as typeof fetch)(prompt);
    await expect(run(429)).rejects.toMatchObject({ retryable: true, status: 429 });
    await expect(run(503)).rejects.toMatchObject({ retryable: true });
    await expect(run(400)).rejects.toMatchObject({ retryable: false });
    await expect(run(400)).rejects.toBeInstanceOf(ProviderError);
  });

  it('treats an empty candidate list as a retryable failure', async () => {
    const p = geminiProvider({ apiKey: 'K', model: 'm' }, vi.fn().mockResolvedValue(json({ candidates: [] })) as unknown as typeof fetch);
    await expect(p(prompt)).rejects.toMatchObject({ retryable: true });
  });
});

describe('openaiProvider', () => {
  it('posts a json_object chat completion and returns the message content', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ choices: [{ message: { content: '{"b":2}' } }] }));
    const out = await openaiProvider({ apiKey: 'S', model: 'gpt-4o-mini' }, fetchImpl as unknown as typeof fetch)(prompt);
    expect(out).toBe('{"b":2}');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer S' });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages).toEqual([{ role: 'system', content: 'sys' }, { role: 'user', content: 'usr' }]);
  });

  it('throws a ProviderError on HTTP failure', async () => {
    const p = openaiProvider({ apiKey: 'S', model: 'm' }, vi.fn().mockResolvedValue(json({}, 500)) as unknown as typeof fetch);
    await expect(p(prompt)).rejects.toMatchObject({ retryable: true, status: 500 });
  });
});
