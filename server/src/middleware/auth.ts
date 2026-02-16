import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const ALL_ROLES = ['team_lead', 'manager', 'director', 'employee'];

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    teamId?: string;
    combinedRole: boolean;
    effectiveRoles: string[];
  };
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    res.status(401).json({ error: 'נדרשת הזדהות' });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;
    const combinedRole = decoded.combinedRole === true;
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      teamId: decoded.teamId,
      combinedRole,
      effectiveRoles: combinedRole ? ALL_ROLES : [decoded.role],
    };
    next();
  } catch {
    res.status(401).json({ error: 'טוקן לא תקין' });
  }
}

export function authorize(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !req.user.effectiveRoles.some(r => roles.includes(r))) {
      res.status(403).json({ error: 'אין הרשאה לפעולה זו' });
      return;
    }
    next();
  };
}
