/**
 * One process that runs both the API and the worker: for hosts that give you a single small service
 * (for example Render's free web service). Each module starts itself when it is imported.
 * With two services, run `npm run start:api` and `npm run start:worker` separately instead.
 */
await import('./api/index.js');
await import('./worker/index.js');
