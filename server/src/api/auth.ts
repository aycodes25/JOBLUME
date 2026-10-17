import type { RequestHandler } from 'express';

export interface AuthUser {
  id: string;
  email: string | null;
}
export type GetUser = (token: string) => Promise<AuthUser | null>;

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export function requireAuth(getUser: GetUser): RequestHandler {
  return async (req, res, next) => {
    const match = /^Bearer (.+)$/i.exec(req.header('authorization') ?? '');
    if (!match) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    try {
      const user = await getUser(match[1]!);
      if (!user) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}
