import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();

function getPrisma(req: Request): PrismaClient {
  return req.app.locals.prisma;
}

// Request swap
router.post('/request', authenticate, authorize('employee'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { assignmentId } = req.body;

  try {
    const assignment = await prisma.shiftAssignment.findUnique({ where: { id: assignmentId } });
    if (!assignment || assignment.employeeId !== req.user!.id) {
      res.status(400).json({ error: 'שיבוץ לא נמצא או לא שייך לך' });
      return;
    }

    const swap = await prisma.swapRequest.create({
      data: {
        requesterId: req.user!.id,
        assignmentId,
      },
    });

    await prisma.shiftAssignment.update({
      where: { id: assignmentId },
      data: { status: 'swap_requested' },
    });

    res.json(swap);
  } catch (error) {
    console.error('Swap request error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת בקשת החלפה' });
  }
});

// Get available coverers for a swap
router.get('/available/:assignmentId', authenticate, async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { assignmentId } = req.params as Record<string, string>;

  try {
    const assignment = await prisma.shiftAssignment.findUnique({
      where: { id: assignmentId },
      include: { employee: true },
    });

    if (!assignment) {
      res.status(404).json({ error: 'שיבוץ לא נמצא' });
      return;
    }

    const dateStr = assignment.date.toISOString().split('T')[0];

    // Find employees in same team who are available
    const available = await prisma.employee.findMany({
      where: {
        teamId: assignment.teamId,
        id: { not: assignment.employeeId },
        role: 'employee',
      },
      include: {
        constraints: {
          where: { weekStart: assignment.weekStart },
        },
        tags: true,
        assignments: {
          where: { date: assignment.date },
        },
      },
    });

    const eligible = available.filter(emp => {
      // Not already working this shift
      if (emp.assignments.some(a => a.shiftName === assignment.shiftName)) return false;

      // Check constraints
      const constraint = emp.constraints.find(c => c.date.toISOString().split('T')[0] === dateStr);
      if (constraint && constraint.type === 'hard' && constraint.availability === 'unavailable') return false;

      return true;
    });

    res.json(eligible.map(e => ({
      id: e.id,
      name: e.name,
      tags: e.tags.map(t => t.tag),
      swapPoints: e.swapPoints,
    })));
  } catch (error) {
    console.error('Available coverers error:', error);
    res.status(500).json({ error: 'שגיאה בחיפוש מחליפים' });
  }
});

// Cover a swap
router.post('/:id/cover', authenticate, authorize('employee'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { id } = req.params as Record<string, string>;

  try {
    const swap = await prisma.swapRequest.findUnique({ where: { id } });
    if (!swap || swap.status !== 'open') {
      res.status(400).json({ error: 'בקשת החלפה לא זמינה' });
      return;
    }

    await prisma.swapRequest.update({
      where: { id },
      data: { covererId: req.user!.id, status: 'covered' },
    });

    res.json({ message: 'הצעת הכיסוי נשלחה לאישור המנהל' });
  } catch (error) {
    console.error('Cover swap error:', error);
    res.status(500).json({ error: 'שגיאה בכיסוי ההחלפה' });
  }
});

// Approve swap (manager)
router.post('/:id/approve', authenticate, authorize('manager', 'director'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { id } = req.params as Record<string, string>;

  try {
    const swap = await prisma.swapRequest.findUnique({
      where: { id },
      include: { requester: true, coverer: true },
    });

    if (!swap || swap.status !== 'covered' || !swap.covererId) {
      res.status(400).json({ error: 'בקשת החלפה לא מוכנה לאישור' });
      return;
    }

    // Update assignment to new employee
    await prisma.shiftAssignment.update({
      where: { id: swap.assignmentId },
      data: { employeeId: swap.covererId, status: 'swapped' },
    });

    // Update swap status
    await prisma.swapRequest.update({
      where: { id },
      data: { status: 'approved', pointsAwarded: true, resolvedAt: new Date() },
    });

    // Award/deduct swap points (minimum 0)
    await prisma.employee.update({
      where: { id: swap.covererId },
      data: { swapPoints: { increment: 1 } },
    });

    const requester = await prisma.employee.findUnique({ where: { id: swap.requesterId } });
    if (requester && requester.swapPoints > 0) {
      await prisma.employee.update({
        where: { id: swap.requesterId },
        data: { swapPoints: { decrement: 1 } },
      });
    }

    res.json({ message: 'ההחלפה אושרה' });
  } catch (error) {
    console.error('Approve swap error:', error);
    res.status(500).json({ error: 'שגיאה באישור ההחלפה' });
  }
});

// Reject swap (manager)
router.post('/:id/reject', authenticate, authorize('manager', 'director'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { id } = req.params as Record<string, string>;

  try {
    await prisma.swapRequest.update({
      where: { id },
      data: { status: 'rejected', resolvedAt: new Date() },
    });

    // Restore assignment status
    const swap = await prisma.swapRequest.findUnique({ where: { id } });
    if (swap) {
      await prisma.shiftAssignment.update({
        where: { id: swap.assignmentId },
        data: { status: 'published' },
      });
    }

    res.json({ message: 'ההחלפה נדחתה' });
  } catch (error) {
    console.error('Reject swap error:', error);
    res.status(500).json({ error: 'שגיאה בדחיית ההחלפה' });
  }
});

// Get all swap requests (for manager view)
router.get('/', authenticate, authorize('manager', 'director'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  try {
    const swaps = await prisma.swapRequest.findMany({
      include: {
        requester: { select: { id: true, name: true, teamId: true } },
        coverer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(swaps);
  } catch (error) {
    console.error('Get swaps error:', error);
    res.status(500).json({ error: 'שגיאה בקבלת בקשות החלפה' });
  }
});

// Get my swap requests (employee)
router.get('/my', authenticate, authorize('employee'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  try {
    const swaps = await prisma.swapRequest.findMany({
      where: {
        OR: [
          { requesterId: req.user!.id },
          { covererId: req.user!.id },
        ],
      },
      include: {
        requester: { select: { name: true } },
        coverer: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(swaps);
  } catch (error) {
    console.error('Get my swaps error:', error);
    res.status(500).json({ error: 'שגיאה בקבלת בקשות ההחלפה שלך' });
  }
});

export default router;
