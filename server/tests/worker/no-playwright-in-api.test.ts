import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = fileURLToPath(new URL('../../src/', import.meta.url));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return p.endsWith('.ts') ? [p] : [];
  });
}

describe('Playwright stays in the worker', () => {
  it('is named only by src/worker/browser.ts', () => {
    const users = files(src)
      .filter((f) => readFileSync(f, 'utf8').includes('playwright'))
      .map((f) => f.slice(src.length).replace(/\\/g, '/'));
    expect(users).toEqual(['worker/browser.ts']);
  });

  it('is loaded lazily, so importing the module never needs a browser', () => {
    const code = readFileSync(join(src, 'worker', 'browser.ts'), 'utf8');
    expect(code).toContain("await import('playwright-extra')");
    expect(code).toContain("await import('puppeteer-extra-plugin-stealth')");
    expect(code).not.toMatch(/^import .*(playwright|puppeteer)/m);
  });
});
