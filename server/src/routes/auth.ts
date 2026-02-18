import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

function getPrisma(req: Request): PrismaClient {
  return req.app.locals.prisma;
}

router.post('/login', async (req: Request, res: Response) => {
  const prisma = getPrisma(req);
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'נדרשים אימייל וסיסמה' });
    return;
  }

  try {
    const employee = await prisma.employee.findUnique({ where: { email } });

    if (!employee) {
      res.status(401).json({ error: 'אימייל או סיסמה שגויים' });
      return;
    }

    const validPassword = await bcrypt.compare(password, employee.password);
    if (!validPassword) {
      res.status(401).json({ error: 'אימייל או סיסמה שגויים' });
      return;
    }

    const token = jwt.sign(
      { id: employee.id, email: employee.email, role: employee.role, teamId: employee.teamId, combinedRole: employee.combinedRole },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        role: employee.role,
        teamId: employee.teamId,
        swapPoints: employee.swapPoints,
        combinedRole: employee.combinedRole,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'שגיאה בהתחברות' });
  }
});

// POST /auth/register — public employee registration
router.post('/register', async (req: Request, res: Response) => {
  const prisma = getPrisma(req);
  const { name, email, password, phone, birthYear, seniority } = req.body;

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

    const employee = await prisma.employee.create({
      data: {
        name,
        email,
        password: hashedPassword,
        phone: phone || null,
        birthYear: birthYear ? parseInt(birthYear) : null,
        seniority: seniority ? parseInt(seniority) : 0,
        role: 'employee',
        teamId: null,
      },
    });

    const token = jwt.sign(
      { id: employee.id, email: employee.email, role: employee.role, teamId: employee.teamId, combinedRole: employee.combinedRole },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        role: employee.role,
        teamId: employee.teamId,
        swapPoints: employee.swapPoints,
        combinedRole: employee.combinedRole,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'שגיאה בהרשמה' });
  }
});

// PUT /auth/change-password — self-service password change
router.put('/change-password', authenticate, async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'נדרשים סיסמה נוכחית וסיסמה חדשה' });
    return;
  }

  if (newPassword.length < 6) {
    res.status(400).json({ error: 'סיסמה חדשה חייבת להכיל לפחות 6 תווים' });
    return;
  }

  try {
    const employee = await prisma.employee.findUnique({ where: { id: req.user!.id } });
    if (!employee) {
      res.status(404).json({ error: 'משתמש לא נמצא' });
      return;
    }

    const validPassword = await bcrypt.compare(currentPassword, employee.password);
    if (!validPassword) {
      res.status(401).json({ error: 'סיסמה נוכחית שגויה' });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.employee.update({
      where: { id: req.user!.id },
      data: { password: hashedPassword },
    });

    res.json({ message: 'הסיסמה שונתה בהצלחה' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'שגיאה בשינוי סיסמה' });
  }
});

router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        teamId: true,
        swapPoints: true,
        seniority: true,
        combinedRole: true,
      },
    });

    if (!employee) {
      res.status(404).json({ error: 'משתמש לא נמצא' });
      return;
    }

    res.json(employee);
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'שגיאה בקבלת פרטי משתמש' });
  }
});

export default router;
