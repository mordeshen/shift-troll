import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();

function getPrisma(req: Request): PrismaClient {
  return req.app.locals.prisma;
}

// Get current week's constraints for the logged-in employee
router.get('/my', authenticate, authorize('employee'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  try {
    const constraints = await prisma.constraint.findMany({
      where: { employeeId: req.user!.id },
      orderBy: { date: 'asc' },
    });
    res.json(constraints);
  } catch (error) {
    console.error('Get constraints error:', error);
    res.status(500).json({ error: 'שגיאה בקבלת אילוצים' });
  }
});

// Chat with AI to parse constraints
router.post('/chat', authenticate, authorize('employee'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { messages, weekStart } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'נדרשות הודעות' });
    return;
  }

  try {
    const nextSunday = weekStart || getNextSunday();

    const systemPrompt = `אתה עוזר ידידותי שמסייע לעובדים לדווח על הזמינות שלהם למשמרות.

תפקידך:
1. להבין מה העובד אומר בשפה חופשית
2. לתרגם לאילוצים מובנים
3. לאפשר תיקונים דרך שיחה

בכל תשובה, החזר JSON במבנה הבא (ורק JSON, ללא טקסט נוסף):

{
  "message": "הודעה ידידותית לעובד בעברית שמסכמת מה הבנת",
  "constraints": [
    {
      "date": "YYYY-MM-DD",
      "type": "hard" | "soft",
      "availability": "unavailable" | "morning_only" | "evening_only" | "night_only" | "available",
      "reason": "סיבה קצרה",
      "original_text": "הציטוט מההודעה"
    }
  ],
  "general_notes": "הערות כלליות"
}

כללי סיווג:
- "אני לא יכול" / "מבחן" / "מילואים" / "טיפול" / "חתונה" = hard
- "עדיף שלא" / "אם אפשר" / "פחות נוח לי" / "מעדיף" = soft
- דפוס חוזר ("כל יום שני") → פרוס לכל הימים הרלוונטיים בשבוע
- אם העובד מתקן → עדכן את האילוצים הקיימים, אל תוסיף כפולים
- השבוע מתחיל ב: ${nextSunday}`;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m: any) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Try to parse the JSON response
    let parsed;
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
      parsed = JSON.parse(jsonMatch[1]!.trim());
    } catch {
      parsed = { message: text, constraints: [], general_notes: '' };
    }

    res.json(parsed);
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'שגיאה בתקשורת עם ה-AI' });
  }
});

// Confirm and save constraints
router.post('/confirm', authenticate, authorize('employee'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { constraints, weekStart } = req.body;

  if (!constraints || !Array.isArray(constraints)) {
    res.status(400).json({ error: 'נדרשים אילוצים' });
    return;
  }

  try {
    const weekStartDate = new Date(weekStart || getNextSunday());

    // Delete existing unconfirmed constraints for this week
    await prisma.constraint.deleteMany({
      where: {
        employeeId: req.user!.id,
        weekStart: weekStartDate,
      },
    });

    // Create new constraints
    const created = await prisma.constraint.createMany({
      data: constraints.map((c: any) => ({
        employeeId: req.user!.id,
        weekStart: weekStartDate,
        date: new Date(c.date),
        type: c.type,
        availability: c.availability,
        reason: c.reason || null,
        originalText: c.original_text || null,
        confirmed: true,
      })),
    });

    res.json({ message: 'האילוצים נשמרו בהצלחה', count: created.count });
  } catch (error) {
    console.error('Confirm constraints error:', error);
    res.status(500).json({ error: 'שגיאה בשמירת אילוצים' });
  }
});

function getNextSunday(): string {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
  const nextSunday = new Date(today);
  nextSunday.setDate(today.getDate() + daysUntilSunday);
  return nextSunday.toISOString().split('T')[0];
}

export default router;
