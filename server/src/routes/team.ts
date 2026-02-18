import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();

function getPrisma(req: Request): PrismaClient {
  return req.app.locals.prisma;
}

// Get team employees with tags and events
router.get('/:teamId/employees', authenticate, authorize('team_lead', 'manager', 'director'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { teamId } = req.params as Record<string, string>;

  try {
    const employees = await prisma.employee.findMany({
      where: { teamId },
      include: {
        tags: true,
        lifeEvents: true,
        ratings: true,
        assignments: {
          orderBy: { date: 'desc' },
          take: 30,
        },
        constraints: {
          orderBy: { date: 'desc' },
          take: 30,
        },
      },
    });

    // If user only has team_lead role (no director access), verify they lead this team
    if (req.user!.role === 'team_lead' && !req.user!.effectiveRoles.includes('director')) {
      const team = await prisma.team.findUnique({ where: { id: teamId } });
      if (!team || team.leadId !== req.user!.id) {
        res.status(403).json({ error: 'אין הרשאה לצוות זה' });
        return;
      }
    }

    res.json(employees);
  } catch (error) {
    console.error('Get team employees error:', error);
    res.status(500).json({ error: 'שגיאה בקבלת עובדי הצוות' });
  }
});

// Add tag to employee
router.post('/:teamId/employees/:id/tags', authenticate, authorize('team_lead', 'manager'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { id } = req.params as Record<string, string>;
  const { tag, category } = req.body;

  if (!tag || !category) {
    res.status(400).json({ error: 'נדרשים תג וקטגוריה' });
    return;
  }

  try {
    const employeeTag = await prisma.employeeTag.create({
      data: {
        employeeId: id,
        tag,
        category,
        assignedBy: req.user!.id,
      },
    });
    res.json(employeeTag);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'תג זה כבר קיים לעובד' });
      return;
    }
    console.error('Add tag error:', error);
    res.status(500).json({ error: 'שגיאה בהוספת תג' });
  }
});

// Remove tag from employee
router.delete('/:teamId/employees/:id/tags/:tag', authenticate, authorize('team_lead', 'manager'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { id, tag } = req.params as Record<string, string>;

  try {
    await prisma.employeeTag.deleteMany({
      where: { employeeId: id, tag },
    });
    res.json({ message: 'התג הוסר' });
  } catch (error) {
    console.error('Delete tag error:', error);
    res.status(500).json({ error: 'שגיאה בהסרת תג' });
  }
});

// Add life event
router.post('/:teamId/employees/:id/life-events', authenticate, authorize('team_lead', 'manager'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { id } = req.params as Record<string, string>;
  const { type, title, startDate, endDate, notes, availabilityImpact } = req.body;

  if (!type || !title || !startDate || !availabilityImpact) {
    res.status(400).json({ error: 'נדרשים סוג, כותרת, תאריך התחלה והשפעה על זמינות' });
    return;
  }

  try {
    const event = await prisma.lifeEvent.create({
      data: {
        employeeId: id,
        type,
        title,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        notes,
        availabilityImpact,
        createdBy: req.user!.id,
      },
    });
    res.json(event);
  } catch (error) {
    console.error('Add life event error:', error);
    res.status(500).json({ error: 'שגיאה בהוספת אירוע חיים' });
  }
});

// Update life event
router.put('/:teamId/employees/:id/life-events/:eid', authenticate, authorize('team_lead', 'manager'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { eid } = req.params as Record<string, string>;
  const { type, title, startDate, endDate, notes, availabilityImpact } = req.body;

  try {
    const event = await prisma.lifeEvent.update({
      where: { id: eid },
      data: {
        type,
        title,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : null,
        notes,
        availabilityImpact,
      },
    });
    res.json(event);
  } catch (error) {
    console.error('Update life event error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון אירוע חיים' });
  }
});

// Delete life event
router.delete('/:teamId/employees/:id/life-events/:eid', authenticate, authorize('team_lead', 'manager'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { eid } = req.params as Record<string, string>;

  try {
    await prisma.lifeEvent.delete({ where: { id: eid } });
    res.json({ message: 'האירוע נמחק' });
  } catch (error) {
    console.error('Delete life event error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת אירוע חיים' });
  }
});

// AI Insights for employee
router.post('/:teamId/employees/:id/ai-insights', authenticate, authorize('team_lead', 'manager'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { id } = req.params as Record<string, string>;

  try {
    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        tags: true,
        constraints: { orderBy: { date: 'desc' }, take: 30 },
        assignments: { orderBy: { date: 'desc' }, take: 30 },
        ratings: true,
        lifeEvents: true,
      },
    });

    if (!employee) {
      res.status(404).json({ error: 'עובד לא נמצא' });
      return;
    }

    const systemPrompt = `אתה מנתח נתוני עובדים ונותן תובנות לראשי צוותים.

קלט: נתוני עובד כולל תגיות, אילוצים, היסטוריית משמרות, ודירוגים.

תן 2-3 תובנות קצרות ומעשיות. דוגמאות:
- "שרה עבדה 4 משמרות לילה ברצף — שקול לתת לה הפסקה"
- "יוסי ודנה שובצו יחד 8 פעמים החודש ושניהם קיבלו דירוג גבוה — צמד שעובד טוב"
- "עומר מסומן כ'דינמי' אבל ביטל 3 החלפות ברגע האחרון — שקול לעדכן את התיוג"

החזר JSON:
{
  "insights": [
    {
      "type": "warning" | "suggestion" | "positive",
      "text": "התובנה בעברית",
      "action": "המלצה לפעולה (אופציונלי)"
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
          content: `נתוני העובד ${employee.name}:
תגיות: ${employee.tags.map(t => t.tag).join(', ') || 'אין'}
אילוצים אחרונים: ${JSON.stringify(employee.constraints.slice(0, 10))}
משמרות אחרונות: ${JSON.stringify(employee.assignments.slice(0, 10))}
דירוגים: ${JSON.stringify(employee.ratings)}
אירועי חיים: ${JSON.stringify(employee.lifeEvents)}
ותק: ${employee.seniority} חודשים
נקודות חילוף: ${employee.swapPoints}`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    let parsed;
    try {
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
      parsed = JSON.parse(jsonMatch[1]!.trim());
    } catch {
      parsed = { insights: [{ type: 'suggestion', text, action: '' }] };
    }

    res.json(parsed);
  } catch (error) {
    console.error('AI insights error:', error);
    res.status(500).json({ error: 'שגיאה בקבלת תובנות AI' });
  }
});

// Get teams for current user
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  try {
    let teams: any[];
    const effectiveRoles = req.user!.effectiveRoles;
    const include = { employees: { select: { id: true, name: true } }, lead: { select: { id: true, name: true } } };
    if (effectiveRoles.includes('director')) {
      teams = await prisma.team.findMany({ include });
    } else if (effectiveRoles.includes('manager')) {
      teams = await prisma.team.findMany({ where: { managerId: req.user!.id }, include });
    } else if (effectiveRoles.includes('team_lead')) {
      teams = await prisma.team.findMany({ where: { leadId: req.user!.id }, include });
    } else {
      teams = [];
    }
    res.json(teams);
  } catch (error) {
    console.error('Get teams error:', error);
    res.status(500).json({ error: 'שגיאה בקבלת צוותים' });
  }
});

// POST /team/create — manager creates a new team
router.post('/create', authenticate, authorize('manager', 'director'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { name, leadId } = req.body;

  if (!name || !name.trim()) {
    res.status(400).json({ error: 'נדרש שם צוות' });
    return;
  }

  try {
    // If leadId provided, verify the employee exists
    if (leadId) {
      const lead = await prisma.employee.findUnique({ where: { id: leadId } });
      if (!lead) {
        res.status(400).json({ error: 'ראש צוות לא נמצא' });
        return;
      }
    }

    const team = await prisma.team.create({
      data: {
        name: name.trim(),
        managerId: req.user!.id,
        leadId: leadId || req.user!.id, // default lead to the manager themselves
      },
      include: {
        employees: { select: { id: true, name: true } },
        lead: { select: { id: true, name: true } },
      },
    });

    // If leadId was provided, update that employee's role to team_lead
    if (leadId && leadId !== req.user!.id) {
      await prisma.employee.update({
        where: { id: leadId },
        data: { role: 'team_lead', teamId: team.id },
      });
    }

    res.status(201).json(team);
  } catch (error) {
    console.error('Create team error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת צוות' });
  }
});

// PUT /team/:id — rename team
router.put('/:id', authenticate, authorize('manager', 'director'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { id } = req.params as Record<string, string>;
  const { name, leadId } = req.body;

  try {
    // Verify team belongs to this manager (unless director)
    const team = await prisma.team.findUnique({ where: { id } });
    if (!team) {
      res.status(404).json({ error: 'צוות לא נמצא' });
      return;
    }

    if (!req.user!.effectiveRoles.includes('director') && team.managerId !== req.user!.id) {
      res.status(403).json({ error: 'אין הרשאה לצוות זה' });
      return;
    }

    const updateData: Record<string, any> = {};
    if (name && name.trim()) updateData.name = name.trim();
    if (leadId) updateData.leadId = leadId;

    const updated = await prisma.team.update({
      where: { id },
      data: updateData,
      include: {
        employees: { select: { id: true, name: true } },
        lead: { select: { id: true, name: true } },
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Update team error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון צוות' });
  }
});

// DELETE /team/:id — delete empty team
router.delete('/:id', authenticate, authorize('manager', 'director'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { id } = req.params as Record<string, string>;

  try {
    const team = await prisma.team.findUnique({
      where: { id },
      include: { employees: { select: { id: true } } },
    });

    if (!team) {
      res.status(404).json({ error: 'צוות לא נמצא' });
      return;
    }

    if (!req.user!.effectiveRoles.includes('director') && team.managerId !== req.user!.id) {
      res.status(403).json({ error: 'אין הרשאה לצוות זה' });
      return;
    }

    if (team.employees.length > 0) {
      res.status(400).json({ error: 'לא ניתן למחוק צוות עם עובדים. העבר את העובדים לצוות אחר תחילה' });
      return;
    }

    // Delete related shift templates first
    await prisma.shiftTemplate.deleteMany({ where: { teamId: id } });
    await prisma.team.delete({ where: { id } });

    res.json({ message: 'הצוות נמחק' });
  } catch (error) {
    console.error('Delete team error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת צוות' });
  }
});

export default router;
