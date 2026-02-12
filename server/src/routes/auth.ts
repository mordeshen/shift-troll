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
      { id: employee.id, email: employee.email, role: employee.role, teamId: employee.teamId },
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
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'שגיאה בהתחברות' });
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
