import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();

const VALID_ROLES = ['employee', 'team_lead', 'manager', 'director'];

function getPrisma(req: Request): PrismaClient {
  return req.app.locals.prisma;
}

// GET /manage/employees — list all employees (director only)
router.get('/', authenticate, authorize('director'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);

  try {
    const employees = await prisma.employee.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        combinedRole: true,
        teamId: true,
        team: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    });

    const result = employees.map(emp => ({
      id: emp.id,
      name: emp.name,
      email: emp.email,
      role: emp.role,
      combinedRole: emp.combinedRole,
      teamId: emp.teamId,
      teamName: emp.team?.name || null,
    }));

    res.json(result);
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({ error: 'שגיאה בקבלת רשימת עובדים' });
  }
});

// PUT /manage/employees/:id/role — update role and/or combinedRole (director only)
router.put('/:id/role', authenticate, authorize('director'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { id } = req.params as Record<string, string>;
  const { role, combinedRole } = req.body;

  // Validate inputs
  if (role !== undefined && !VALID_ROLES.includes(role)) {
    res.status(400).json({ error: `תפקיד לא תקין. אפשרויות: ${VALID_ROLES.join(', ')}` });
    return;
  }

  if (combinedRole !== undefined && typeof combinedRole !== 'boolean') {
    res.status(400).json({ error: 'combinedRole חייב להיות true או false' });
    return;
  }

  if (role === undefined && combinedRole === undefined) {
    res.status(400).json({ error: 'נדרש לפחות שדה אחד לעדכון (role או combinedRole)' });
    return;
  }

  try {
    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee) {
      res.status(404).json({ error: 'עובד לא נמצא' });
      return;
    }

    const updateData: Record<string, any> = {};
    if (role !== undefined) updateData.role = role;
    if (combinedRole !== undefined) updateData.combinedRole = combinedRole;

    const updated = await prisma.employee.update({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        combinedRole: true,
        teamId: true,
        team: { select: { name: true } },
      },
      data: updateData,
    });

    res.json({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      combinedRole: updated.combinedRole,
      teamId: updated.teamId,
      teamName: updated.team?.name || null,
    });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון תפקיד' });
  }
});

// --- Manager endpoints ---

// GET /manage/employees/for-manager — employees in manager's teams + unassigned
router.get('/for-manager', authenticate, authorize('manager'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const managerId = req.user!.id;

  try {
    // Get teams managed by this manager
    const teams = await prisma.team.findMany({
      where: { managerId },
      select: { id: true, name: true },
    });

    const teamIds = teams.map(t => t.id);

    // Employees in manager's teams
    const teamEmployees = await prisma.employee.findMany({
      where: { teamId: { in: teamIds }, role: 'employee' },
      select: {
        id: true, name: true, email: true, phone: true,
        birthYear: true, seniority: true, teamId: true,
        team: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Employees without a team
    const unassignedEmployees = await prisma.employee.findMany({
      where: { teamId: null, role: 'employee' },
      select: {
        id: true, name: true, email: true, phone: true,
        birthYear: true, seniority: true, teamId: true,
      },
      orderBy: { name: 'asc' },
    });

    res.json({
      teams,
      teamEmployees: teamEmployees.map(e => ({ ...e, teamName: e.team?.name || null })),
      unassignedEmployees: unassignedEmployees.map(e => ({ ...e, teamName: null })),
    });
  } catch (error) {
    console.error('Get employees for manager error:', error);
    res.status(500).json({ error: 'שגיאה בקבלת רשימת עובדים' });
  }
});

// POST /manage/employees/create — manager creates an employee manually
router.post('/create', authenticate, authorize('manager'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { name, email, password, phone, birthYear, seniority, teamId } = req.body;

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

    // If teamId provided, verify it belongs to this manager
    if (teamId) {
      const team = await prisma.team.findFirst({
        where: { id: teamId, managerId: req.user!.id },
      });
      if (!team) {
        res.status(400).json({ error: 'הצוות לא שייך למנהל זה' });
        return;
      }
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
        teamId: teamId || null,
      },
      select: {
        id: true, name: true, email: true, phone: true,
        birthYear: true, seniority: true, teamId: true,
        team: { select: { name: true } },
      },
    });

    res.status(201).json({ ...employee, teamName: employee.team?.name || null });
  } catch (error) {
    console.error('Create employee error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת עובד' });
  }
});

// PUT /manage/employees/:id/details — update employee details
router.put('/:id/details', authenticate, authorize('manager'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { id } = req.params as Record<string, string>;
  const { name, phone, seniority, birthYear } = req.body;

  try {
    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee) {
      res.status(404).json({ error: 'עובד לא נמצא' });
      return;
    }

    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone || null;
    if (seniority !== undefined) updateData.seniority = parseInt(seniority);
    if (birthYear !== undefined) updateData.birthYear = birthYear ? parseInt(birthYear) : null;

    const updated = await prisma.employee.update({
      where: { id },
      data: updateData,
      select: {
        id: true, name: true, email: true, phone: true,
        birthYear: true, seniority: true, teamId: true,
        team: { select: { name: true } },
      },
    });

    res.json({ ...updated, teamName: updated.team?.name || null });
  } catch (error) {
    console.error('Update employee details error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון פרטי עובד' });
  }
});

// PUT /manage/employees/:id/assign — assign employee to team
router.put('/:id/assign', authenticate, authorize('manager'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { id } = req.params as Record<string, string>;
  const { teamId } = req.body;

  if (!teamId) {
    res.status(400).json({ error: 'נדרש מזהה צוות' });
    return;
  }

  try {
    // Verify team belongs to this manager
    const team = await prisma.team.findFirst({
      where: { id: teamId, managerId: req.user!.id },
    });
    if (!team) {
      res.status(400).json({ error: 'הצוות לא שייך למנהל זה' });
      return;
    }

    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee) {
      res.status(404).json({ error: 'עובד לא נמצא' });
      return;
    }

    const updated = await prisma.employee.update({
      where: { id },
      data: { teamId },
      select: {
        id: true, name: true, email: true, phone: true,
        birthYear: true, seniority: true, teamId: true,
        team: { select: { name: true } },
      },
    });

    res.json({ ...updated, teamName: updated.team?.name || null });
  } catch (error) {
    console.error('Assign employee error:', error);
    res.status(500).json({ error: 'שגיאה בשיוך עובד לצוות' });
  }
});

export default router;
