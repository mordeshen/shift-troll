import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();

function getPrisma(req: Request): PrismaClient {
  return req.app.locals.prisma;
}

// Burnout index
router.get('/burnout-index', authenticate, authorize('director'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);

  try {
    const teams = await prisma.team.findMany({
      include: {
        employees: {
          where: { role: 'employee' },
          include: {
            assignments: {
              where: {
                date: { gte: new Date(new Date().setDate(new Date().getDate() - 30)) },
              },
              orderBy: { date: 'desc' },
            },
            constraints: {
              where: { type: 'soft' },
              orderBy: { date: 'desc' },
              take: 10,
            },
            lifeEvents: {
              where: {
                OR: [
                  { endDate: null },
                  { endDate: { gte: new Date() } },
                ],
              },
            },
          },
        },
      },
    });

    const teamBurnout = teams.map(team => {
      const employeeBurnout = team.employees.map(emp => {
        // Calculate consecutive shifts
        let maxConsecutive = 0;
        let currentConsecutive = 0;
        const sortedAssignments = [...emp.assignments].sort((a, b) => a.date.getTime() - b.date.getTime());

        for (let i = 0; i < sortedAssignments.length; i++) {
          if (i === 0) {
            currentConsecutive = 1;
          } else {
            const diff = (sortedAssignments[i].date.getTime() - sortedAssignments[i - 1].date.getTime()) / (1000 * 60 * 60 * 24);
            currentConsecutive = diff <= 1.5 ? currentConsecutive + 1 : 1;
          }
          maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
        }

        // Night shifts count
        const nightShifts = emp.assignments.filter(a => a.shiftName === 'לילה').length;

        // Days since last day off (approximate)
        const totalShifts = emp.assignments.length;

        // Soft constraints violated
        const softConstraints = emp.constraints.length;

        // Burnout score (0-10)
        const burnoutScore = Math.min(10,
          (maxConsecutive / 6) * 3 +
          (nightShifts / 10) * 2.5 +
          (totalShifts / 25) * 2.5 +
          (softConstraints / 5) * 2
        );

        return {
          id: emp.id,
          name: emp.name,
          score: Math.round(burnoutScore * 10) / 10,
          hasActiveLifeEvent: emp.lifeEvents.length > 0,
        };
      });

      const avgBurnout = employeeBurnout.length > 0
        ? employeeBurnout.reduce((sum, e) => sum + e.score, 0) / employeeBurnout.length
        : 0;

      return {
        teamId: team.id,
        teamName: team.name,
        avgBurnout: Math.round(avgBurnout * 10) / 10,
        status: avgBurnout > 7 ? 'red' : avgBurnout > 4 ? 'orange' : 'green',
        employees: employeeBurnout.sort((a, b) => b.score - a.score),
      };
    });

    res.json(teamBurnout);
  } catch (error) {
    console.error('Burnout index error:', error);
    res.status(500).json({ error: 'שגיאה בחישוב מדד שחיקה' });
  }
});

// Team comparison
router.get('/team-comparison', authenticate, authorize('director'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);

  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const teams = await prisma.team.findMany({
      include: {
        employees: {
          where: { role: 'employee' },
          include: {
            assignments: {
              where: { date: { gte: monthStart, lt: monthEnd } },
            },
            ratings: true,
          },
        },
      },
    });

    const templates = await prisma.shiftTemplate.findMany();

    const comparison = teams.map(team => {
      const totalEmployees = team.employees.length;
      const totalAssignments = team.employees.reduce((sum, e) => sum + e.assignments.length, 0);

      // Calculate expected slots
      const teamTemplates = templates.filter(t => t.teamId === team.id);
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const expectedSlots = teamTemplates.reduce((sum, t) => sum + t.requiredCount, 0) * (daysInMonth / 7);

      const fillRate = expectedSlots > 0 ? Math.round((totalAssignments / expectedSlots) * 100) : 0;

      // Cancellations (swap requests)
      // Avg rating
      const allRatings = team.employees.flatMap(e => e.ratings);
      const avgRating = allRatings.length > 0
        ? allRatings.reduce((sum, r) => sum + r.score, 0) / allRatings.length
        : 0;

      // Fairness score
      const shiftCounts = team.employees.map(e => e.assignments.length);
      const avg = shiftCounts.length ? shiftCounts.reduce((a, b) => a + b, 0) / shiftCounts.length : 0;
      const variance = shiftCounts.length
        ? shiftCounts.reduce((sum, c) => sum + Math.pow(c - avg, 2), 0) / shiftCounts.length
        : 0;
      const fairnessScore = Math.max(0, 10 - Math.sqrt(variance));

      return {
        teamId: team.id,
        teamName: team.name,
        employeeCount: totalEmployees,
        fillRate: Math.min(100, fillRate),
        avgRating: Math.round(avgRating * 10) / 10,
        fairnessScore: Math.round(fairnessScore * 10) / 10,
      };
    });

    res.json(comparison);
  } catch (error) {
    console.error('Team comparison error:', error);
    res.status(500).json({ error: 'שגיאה בהשוואת צוותים' });
  }
});

// Trends
router.get('/trends', authenticate, authorize('director'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const months = parseInt(req.query.months as string) || 6;

  try {
    const trends = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

      const assignments = await prisma.shiftAssignment.findMany({
        where: { date: { gte: monthStart, lt: monthEnd } },
      });

      const constraints = await prisma.constraint.findMany({
        where: { date: { gte: monthStart, lt: monthEnd } },
      });

      const swaps = await prisma.swapRequest.findMany({
        where: { createdAt: { gte: monthStart, lt: monthEnd } },
      });

      trends.push({
        month: monthStart.toISOString().slice(0, 7),
        totalAssignments: assignments.length,
        cancellations: swaps.filter(s => s.status === 'approved').length,
        hardConstraints: constraints.filter(c => c.type === 'hard').length,
        softConstraints: constraints.filter(c => c.type === 'soft').length,
      });
    }

    res.json(trends);
  } catch (error) {
    console.error('Trends error:', error);
    res.status(500).json({ error: 'שגיאה בקבלת מגמות' });
  }
});

// AI Predictions
router.post('/predict', authenticate, authorize('director'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);

  try {
    const teams = await prisma.team.findMany({
      include: {
        employees: {
          include: {
            assignments: {
              where: {
                date: { gte: new Date(new Date().setMonth(new Date().getMonth() - 3)) },
              },
            },
            lifeEvents: {
              where: {
                OR: [
                  { endDate: null },
                  { endDate: { gte: new Date() } },
                ],
              },
            },
            constraints: {
              orderBy: { date: 'desc' },
              take: 20,
            },
          },
        },
      },
    });

    const teamSummaries = teams.map(team => ({
      name: team.name,
      id: team.id,
      employeeCount: team.employees.length,
      avgMonthlyShifts: team.employees.reduce((sum, e) => sum + e.assignments.length, 0) / Math.max(team.employees.length, 1) / 3,
      activeLifeEvents: team.employees.reduce((sum, e) => sum + e.lifeEvents.length, 0),
      hardConstraintsLastMonth: team.employees.reduce((sum, e) =>
        sum + e.constraints.filter(c => c.type === 'hard').length, 0),
    }));

    const systemPrompt = `אתה מנתח נתוני כוח אדם ברמה ארגונית.

קלט: נתונים מצרפיים של צוותים כולל: מספר עובדים, אחוזי מילוי, ביטולים, אירועי חיים פעילים, וחגים קרובים.

תן 3-5 תחזיות או המלצות ברמה אסטרטגית. דוגמאות:
- "בחודש הבא יש חגים + 3 עובדים במילואים בצוות ב' — צפוי מחסור של ~25% בכוח אדם"
- "צוות א' מציג ירידה עקבית באחוזי מילוי — ייתכן שיש בעיית ניהול"
- "מומלץ להעביר 2 עובדים גמישים מצוות ג' לחיזוק צוות ב' בתקופת החגים"

החזר JSON:
{
  "predictions": [
    {
      "type": "shortage" | "burnout" | "trend" | "recommendation",
      "severity": "low" | "medium" | "high",
      "text": "התחזית בעברית",
      "affected_teams": ["team_id"],
      "timeframe": "חודש הבא / רבעון הבא"
    }
  ]
}`;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `נתוני הצוותים:\n${JSON.stringify(teamSummaries, null, 2)}\n\nתאריך נוכחי: ${new Date().toISOString().split('T')[0]}`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    let parsed;
    try {
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
      parsed = JSON.parse(jsonMatch[1]!.trim());
    } catch {
      parsed = { predictions: [{ type: 'recommendation', severity: 'medium', text, affected_teams: [], timeframe: 'חודש הבא' }] };
    }

    res.json(parsed);
  } catch (error) {
    console.error('Predict error:', error);
    res.status(500).json({ error: 'שגיאה בחיזוי AI' });
  }
});

export default router;
