import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const router = Router();

function getPrisma(req: Request): PrismaClient {
  return req.app.locals.prisma;
}

// --- Admin auth middleware (local to this file) ---

interface AdminRequest extends Request {
  admin?: { email: string };
}

function authenticateAdmin(req: AdminRequest, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'נדרשת הזדהות כאדמין' });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;
    if (!decoded.admin) {
      res.status(403).json({ error: 'אין הרשאת אדמין' });
      return;
    }
    req.admin = { email: decoded.email };
    next();
  } catch {
    res.status(401).json({ error: 'טוקן אדמין לא תקין' });
  }
}

// --- Routes ---

// POST /admin/login — email/password admin login
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'נדרשים אימייל וסיסמה' });
    return;
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    res.status(500).json({ error: 'הגדרות אדמין חסרות בשרת' });
    return;
  }

  if (email.toLowerCase() !== adminEmail.toLowerCase() || password !== adminPassword) {
    res.status(401).json({ error: 'אימייל או סיסמה שגויים' });
    return;
  }

  const token = jwt.sign(
    { admin: true, email: adminEmail },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: '24h' }
  );

  res.json({ token, email: adminEmail });
});

// POST /admin/google-login
router.post('/google-login', async (req: Request, res: Response) => {
  const { credential } = req.body;

  if (!credential) {
    res.status(400).json({ error: 'חסר credential' });
    return;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!clientId || !adminEmail) {
    res.status(500).json({ error: 'הגדרות Google OAuth חסרות בשרת' });
    return;
  }

  try {
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      res.status(401).json({ error: 'לא ניתן לאמת את חשבון Google' });
      return;
    }

    if (payload.email.toLowerCase() !== adminEmail.toLowerCase()) {
      res.status(403).json({ error: 'אימייל זה אינו מורשה כאדמין' });
      return;
    }

    const token = jwt.sign(
      { admin: true, email: payload.email },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '24h' }
    );

    res.json({ token, email: payload.email });
  } catch (error) {
    console.error('Google login error:', error);
    res.status(401).json({ error: 'אימות Google נכשל' });
  }
});

// GET /admin/managers
router.get('/managers', authenticateAdmin as any, async (req: AdminRequest, res: Response) => {
  const prisma = getPrisma(req);

  try {
    const managers = await prisma.employee.findMany({
      where: { role: 'manager' },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(managers);
  } catch (error) {
    console.error('Get managers error:', error);
    res.status(500).json({ error: 'שגיאה בקבלת רשימת מנהלים' });
  }
});

// POST /admin/managers
router.post('/managers', authenticateAdmin as any, async (req: AdminRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    res.status(400).json({ error: 'נדרשים שם, אימייל וסיסמה' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: 'סיסמה חייבת להכיל לפחות 6 תווים' });
    return;
  }

  try {
    const existing = await prisma.employee.findUnique({ where: { email } });
    if (existing) {
      res.status(400).json({ error: 'אימייל זה כבר קיים במערכת' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const manager = await prisma.employee.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'manager',
        seniority: 0,
        swapPoints: 0,
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });

    res.status(201).json(manager);
  } catch (error) {
    console.error('Create manager error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת מנהל' });
  }
});

export default router;
