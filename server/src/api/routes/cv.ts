import { Router } from 'express';
import multer from 'multer';
import { ApiError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import type { AppDeps } from '../deps.js';
import { asyncHandler } from '../errors.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

export function cvRoutes(d: Pick<AppDeps, 'cv' | 'jobs'>) {
  const router = Router();
  router.post('/', upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'file_required', 'Attach a file in the "file" field');
    const result = await d.cv.upload(req.user!.id, { buffer: req.file.buffer });
    d.jobs.rematch(req.user!.id).catch((err) => logger.warn({ err }, 'rematch after CV upload failed'));
    res.json(result);
  }));
  return router;
}
