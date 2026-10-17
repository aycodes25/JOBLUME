import { getEnv } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { createRedis } from '../lib/redis.js';
import { createSupabaseAdmin } from '../lib/supabase.js';
import { createQueues } from '../queues.js';
import { createApplicationsService } from '../services/applications.js';
import { renderCvPdf } from '../services/cv/pdf.js';
import { createCvService } from '../services/cv/upload.js';
import { createJobsService } from '../services/jobs/service.js';
import { createSignedUrl, uploadFile } from '../services/storage.js';
import { createApp } from './app.js';
import { createApplicationsRepo, createProfileRepo, setCv } from './repos.js';

const env = getEnv();
const db = createSupabaseAdmin(env);
const queues = createQueues(createRedis(env.UPSTASH_REDIS_URL));

const app = createApp({
  webOrigin: env.WEB_ORIGIN,
  getUser: async (token) => {
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  },
  profiles: createProfileRepo(db),
  cv: createCvService({
    upload: (path, bytes, contentType) => uploadFile(db, path, bytes, contentType),
    setCv: (userId, v) => setCv(db, userId, v),
  }),
  applications: createApplicationsService({
    repo: createApplicationsRepo(db),
    renderPdf: renderCvPdf,
    uploadPdf: (path, bytes) => uploadFile(db, path, bytes, 'application/pdf'),
    signUrl: (path) => createSignedUrl(db, path),
  }),
  jobs: createJobsService(queues),
});

app.listen(env.PORT, () => logger.info({ port: env.PORT }, 'api listening'));
