import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();

function getPrisma(req: Request): PrismaClient {
  return req.app.locals.prisma;
}

// Weekly stats
router.get('/weekly/:weekStart/:teamId', authenticate, authorize('manager', 'director'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { weekStart, teamId } = req.params as Record<string, string>;

  try {
    const weekStartDate = new Date(weekStart);
    const weekEnd = new Date(weekStartDate);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Shift distribution per employee
    const assignments = await prisma.shiftAssignment.findMany({
      where: { weekStart: weekStartDate, teamId },
      include: { employee: { select: { id: true, name: true } } },
    });

    const distribution: Record<string, { name: string; morning: number; evening: number; night: number; total: number }> = {};
    for (const a of assignments) {
      if (!distribution[a.employeeId]) {
        distribution[a.employeeId] = { name: (a as any).employee.name, morning: 0, evening: 0, night: 0, total: 0 };
      }
      if (a.shiftName === 'בוקר') distribution[a.employeeId].morning++;
      else if (a.shiftName === 'ערב') distribution[a.employeeId].evening++;
      else if (a.shiftName === 'לילה') distribution[a.employeeId].night++;
      distribution[a.employeeId].total++;
    }

    // Fairness index
    const totals = Object.values(distribution).map(d => d.total);
    const avg = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
    const max = Math.max(...totals, 0);
    const min = Math.min(...totals, 0);

    // Swap stats
    const swaps = await prisma.swapRequest.findMany({
      where: {
        createdAt: { gte: weekStartDate, lt: weekEnd },
      },
    });

    const swapStats = {
      total: swaps.length,
      approved: swaps.filter(s => s.status === 'approved').length,
      rejected: swaps.filter(s => s.status === 'rejected').length,
      pending: swaps.filter(s => ['open', 'covered'].includes(s.status)).length,
    };

    // Soft constraint violations
    const employees = await prisma.employee.findMany({
      where: { teamId },
      include: {
        constraints: { where: { weekStart: weekStartDate, type: 'soft' } },
      },
    });

    const violations: { name: string; date: string; reason: string }[] = [];
    for (const emp of employees) {
      for (const c of emp.constraints) {
        const dateStr = c.date.toISOString().split('T')[0];
        const assigned = assignments.find(
          a => a.employeeId === emp.id && a.date.toISOString().split('T')[0] === dateStr
        );
        if (assigned) {
          violations.push({
            name: emp.name,
            date: dateStr,
            reason: c.reason || 'העדפה אישית',
          });
        }
      }
    }

    res.json({
      distribution: Object.values(distribution),
      fairness: { avg: avg.toFixed(1), max, min, range: max - min },
      swapStats,
      violations,
    });
  } catch (error) {
    console.error('Weekly stats error:', error);
    res.status(500).json({ error: 'שגיאה בקבלת סטטיסטיקות' });
  }
});

// Fairness index
router.get('/fairness/:month/:teamId', authenticate, authorize('manager', 'director'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { month, teamId } = req.params as Record<string, string>;

  try {
    const startDate = new Date(`${month}-01`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    const assignments = await prisma.shiftAssignment.findMany({
      where: {
        teamId,
        date: { gte: startDate, lt: endDate },
      },
      include: { employee: { select: { id: true, name: true } } },
    });

    const counts: Record<string, { name: string; total: number; nights: number; weekends: number }> = {};
    for (const a of assignments) {
      if (!counts[a.employeeId]) {
        counts[a.employeeId] = { name: (a as any).employee.name, total: 0, nights: 0, weekends: 0 };
      }
      counts[a.employeeId].total++;
      if (a.shiftName === 'לילה') counts[a.employeeId].nights++;
      if ([5, 6].includes(a.date.getDay())) counts[a.employeeId].weekends++;
    }

    res.json(Object.values(counts));
  } catch (error) {
    console.error('Fairness stats error:', error);
    res.status(500).json({ error: 'שגיאה בקבלת מדד הוגנות' });
  }
});

export default router;
