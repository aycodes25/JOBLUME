// Bundles the extension into extension/dist (load that folder unpacked in Chrome).
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const dist = resolve(root, 'dist');
const tmp = resolve(root, '.build');

rmSync(dist, { recursive: true, force: true });
rmSync(tmp, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// manifest.ts is TypeScript: compile it for Node once, then import it.
await build({
  entryPoints: [resolve(root, 'src/manifest.ts')],
  outfile: resolve(tmp, 'manifest.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});
const { buildManifest, parseBuildConfig } = await import(pathToFileURL(resolve(tmp, 'manifest.mjs')).href);
rmSync(tmp, { recursive: true, force: true });

const cfg = parseBuildConfig(process.env);
if (!process.env.EXTENSION_STORAGE_HOST) {
  console.warn(
    'EXTENSION_STORAGE_HOST is not set: the CV download is allowed from any *.supabase.co host. Set it to your project host (for example abcd1234.supabase.co).',
  );
}

await build({
  entryPoints: {
    background: resolve(root, 'src/background.ts'),
    bridge: resolve(root, 'src/content/bridge.ts'),
    forms: resolve(root, 'src/content/forms.ts'),
    popup: resolve(root, 'src/popup/popup.ts'),
  },
  outdir: dist,
  bundle: true,
  format: 'iife',
  target: 'chrome116',
  platform: 'browser',
  define: {
    __STORAGE_HOST__: JSON.stringify(cfg.storageHost),
    __JOBLUME_ORIGINS__: JSON.stringify(cfg.origins),
    __DOCS_URL__: JSON.stringify(`${cfg.origins[0]}/extension-setup.html`),
  },
  logLevel: 'info',
});

copyFileSync(resolve(root, 'src/popup/popup.html'), resolve(dist, 'popup.html'));
writeFileSync(resolve(dist, 'manifest.json'), `${JSON.stringify(buildManifest(cfg), null, 2)}\n`);
console.log(`Built ${dist}`);
