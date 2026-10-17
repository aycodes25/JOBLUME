import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { requireAuth } from './auth.js';
import type { AppDeps } from './deps.js';
import { errorHandler } from './errors.js';
import { analyticsRoutes } from './routes/analytics.js';
import { applicationRoutes } from './routes/applications.js';
import { cvRoutes } from './routes/cv.js';
import { followUpRoutes } from './routes/followups.js';
import { gmailCallbackRoutes, gmailRoutes } from './routes/gmail.js';
import { jobRoutes } from './routes/jobs.js';
import { profileRoutes } from './routes/profile.js';

export function createApp(d: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: d.webOrigin }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/gmail', gmailCallbackRoutes(d));

  app.use(requireAuth(d.getUser));
  app.use(rateLimit({ windowMs: 60_000, limit: 120, keyGenerator: (req) => req.user!.id, standardHeaders: true, legacyHeaders: false }));

  app.use('/profile', profileRoutes(d));
  app.use('/cv', cvRoutes(d));
  app.use('/applications', applicationRoutes(d));
  app.use('/jobs', jobRoutes(d));
  app.use('/analytics', analyticsRoutes(d));
  app.use('/follow-ups', followUpRoutes(d));
  app.use('/gmail', gmailRoutes(d));

  app.use(errorHandler);
  return app;
}
