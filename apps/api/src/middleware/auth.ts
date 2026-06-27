import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export type Role = 'ADMIN' | 'TECHNICIAN' | 'OPERATOR' | 'VIEWER';

export interface AuthUser {
  userId: number;
  id: number;
  email: string;
  role: Role;
  factoryId?: number | null;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-me';

export function signToken(payload: Partial<AuthUser> & { email: string; role: Role }) {
  const userId = payload.userId ?? payload.id;
  return jwt.sign({ ...payload, userId, id: userId }, jwtSecret, { expiresIn: '8h' });
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

  if (!token) return res.status(401).json({ error: 'Missing token' });

  try {
    req.user = jwt.verify(token, jwtSecret) as AuthRequest['user'];
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function authorize(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Missing user' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    return next();
  };
}

export const requireAuth = authenticate;
export const requireRoles = (roles: Role[]) => authorize(...roles);
