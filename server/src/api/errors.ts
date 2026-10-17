import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { ApiError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

const isBodyParserError = (e: unknown): e is { status: number; type: string } =>
  typeof e === 'object' && e !== null && typeof (e as { status?: unknown }).status === 'number' && typeof (e as { type?: unknown }).type === 'string';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'invalid_request', details: err.flatten() });
  } else if (err instanceof multer.MulterError) {
    res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.code.toLowerCase() });
  } else if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.code, message: err.message });
  } else if (isBodyParserError(err) && err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'invalid_json' });
  } else if (isBodyParserError(err) && err.type === 'entity.too.large') {
    res.status(413).json({ error: 'payload_too_large' });
  } else {
    logger.error({ err }, 'unhandled error');
    res.status(500).json({ error: 'internal_error' });
  }
};
