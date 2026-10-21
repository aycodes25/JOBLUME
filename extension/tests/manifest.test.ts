import { describe, expect, it } from 'vitest';
import { buildManifest, parseBuildConfig } from '../src/manifest';

describe('parseBuildConfig', () => {
  it('defaults to localhost:3000 and the Supabase wildcard host', () => {
    expect(parseBuildConfig({})).toEqual({ origins: ['http://localhost:3000'], storageHost: '*.supabase.co' });
  });

  it('reads several origins and a storage host, trimming and removing duplicates', () => {
    const cfg = parseBuildConfig({
      EXTENSION_JOBLUME_ORIGINS: ' https://app.joblume.example/ , http://localhost:3000, https://app.joblume.example',
      EXTENSION_STORAGE_HOST: 'ABCD1234.supabase.co',
    });
    expect(cfg).toEqual({ origins: ['https://app.joblume.example', 'http://localhost:3000'], storageHost: 'abcd1234.supabase.co' });
  });

  it.each([
    ['plain http on a real host', { EXTENSION_JOBLUME_ORIGINS: 'http://app.joblume.example' }],
    ['an origin with a path', { EXTENSION_JOBLUME_ORIGINS: 'https://app.joblume.example/app' }],
    ['a wildcard origin', { EXTENSION_JOBLUME_ORIGINS: 'https://*.joblume.example' }],
    ['an empty origin list', { EXTENSION_JOBLUME_ORIGINS: ' , ' }],
    ['a storage host with a scheme', { EXTENSION_STORAGE_HOST: 'https://abcd.supabase.co' }],
    ['a storage host with a path', { EXTENSION_STORAGE_HOST: 'abcd.supabase.co/storage' }],
    ['a single-label storage host', { EXTENSION_STORAGE_HOST: 'localhost' }],
  ])('rejects %s', (_name, env) => {
    expect(() => parseBuildConfig(env)).toThrow();
  });
});

describe('buildManifest', () => {
  const manifest = buildManifest({ origins: ['http://localhost:3000'], storageHost: 'abcd1234.supabase.co' });

  it('is a Manifest V3 service-worker extension with the two permissions only', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background).toEqual({ service_worker: 'background.js' });
    expect([...manifest.permissions].sort()).toEqual(['storage', 'tabs']);
  });

  it('limits host permissions to the five form hosts, the JobLume origins and the storage host', () => {
    expect(manifest.host_permissions).toEqual([
      'https://boards.greenhouse.io/*',
      'https://job-boards.greenhouse.io/*',
      'https://jobs.lever.co/*',
      'https://jobs.ashbyhq.com/*',
      'https://apply.workable.com/*',
      'http://localhost:3000/*',
      'https://abcd1234.supabase.co/*',
    ]);
  });

  it('runs the bridge only on the JobLume origins and the form script only on the form hosts', () => {
    const [bridge, forms] = manifest.content_scripts;
    expect(bridge?.matches).toEqual(['http://localhost:3000/*']);
    expect(bridge?.js).toEqual(['bridge.js']);
    expect(forms?.matches).toEqual(manifest.host_permissions.slice(0, 5));
    expect(forms?.js).toEqual(['forms.js']);
  });

  it('survives a JSON round trip and has no wildcard-all host', () => {
    const text = JSON.stringify(manifest);
    expect(JSON.parse(text)).toEqual(manifest);
    expect(text).not.toContain('<all_urls>');
    expect(text).not.toContain('"*://*/*"');
  });
});
