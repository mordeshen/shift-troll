import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();

function getPrisma(req: Request): PrismaClient {
  return req.app.locals.prisma;
}

// Update/create rating
router.put('/:id/rate', authenticate, authorize('manager', 'team_lead'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { id } = req.params as Record<string, string>;
  const { ratings, notes } = req.body;

  if (!ratings || !Array.isArray(ratings)) {
    res.status(400).json({ error: 'נדרשים דירוגים' });
    return;
  }

  try {
    const results = [];
    for (const rating of ratings) {
      const { category, score } = rating;
      if (!['reliability', 'teamwork', 'flexibility', 'performance'].includes(category)) continue;
      if (score < 1 || score > 5) continue;

      const result = await prisma.rating.upsert({
        where: {
          employeeId_category_ratedBy: {
            employeeId: id,
            category,
            ratedBy: req.user!.id,
          },
        },
        update: { score, notes: rating.notes || null, ratedAt: new Date() },
        create: {
          employeeId: id,
          category,
          score,
          notes: rating.notes || null,
          ratedBy: req.user!.id,
        },
      });
      results.push(result);
    }

    res.json(results);
  } catch (error) {
    console.error('Rate employee error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון דירוג' });
  }
});

// Get ratings for an employee
router.get('/:id/ratings', authenticate, authorize('manager', 'team_lead', 'director'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { id } = req.params as Record<string, string>;

  try {
    const ratings = await prisma.rating.findMany({
      where: { employeeId: id },
      orderBy: { ratedAt: 'desc' },
    });
    res.json(ratings);
  } catch (error) {
    console.error('Get ratings error:', error);
    res.status(500).json({ error: 'שגיאה בקבלת דירוגים' });
  }
});

export default router;
