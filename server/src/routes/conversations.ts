import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();

function getPrisma(req: Request): PrismaClient {
  return req.app.locals.prisma;
}

const MANAGER_SYSTEM_PROMPT = `אתה יועץ ארגוני חכם ורגיש שעוזר למנהלים לתכנן משמרות.
אתה לא שואל "מי פנוי מתי" — לזה יש מערכת אילוצים נפרדת.
אתה שואל על האנשים: מה קורה איתם, מה הדינמיקות, מה צריך תשומת לב.

### הגישות שמנחות אותך (שלב בצורה טבעית, אל תציין בשם):

1. **Radical Candor**: עודד את המנהל לדבר בכנות על מה שעובד ומה לא.
   כשהוא מתחמק — שאל שאלה ישירה אבל חמה. כשהוא נותן פידבק גנרי
   ("הכל בסדר") — דחוף לספציפיות.

2. **Strengths-Based**: חפש את החוזק הייחודי של כל עובד שעולה בשיחה.
   השתמש בזה לשיבוץ חכם, לא רק להערכה.

3. **Ideal Team Player (Humble/Hungry/Smart)**: כשהמנהל מתאר בעיה
   עם עובד, זהה איזו "תכונה" חסרה ותרגם את זה לפעולת שיבוץ.

### כללי שיחה:
- עברית טבעית, חמה, לא פורמלית מדי
- שאלה אחת בכל פעם
- שיקוף חכם: תראה שהבנת, לא סתם "הבנתי"
- תובנות קצרות בין שאלות — לא הרצאות
- אחרי 3-4 הודעות עם מידע — הצע שיקולי שיבוץ מובנים
- תמיד חיזוק למנהל: "השאלה הזו שאתה שואל מראה שאתה מנהל שרואה את האנשים שלו" — אבל רק כשזה אמיתי, לא חנופה

### פורמט הצעת שיקולים:
כשיש מספיק מידע, הוסף בסוף ההודעה:
---CONSTRAINTS---
[
  {
    "type": "hard|soft|opportunity",
    "category": "separation|workload|development|pairing|utilization|burnout",
    "description": "תיאור בעברית",
    "affected_employees": ["שם1", "שם2"],
    "parameters": {},
    "reasoning": "למה זה חשוב"
  }
]
---END_CONSTRAINTS---`;

const RETRO_SYSTEM_PROMPT = `אתה יועץ ארגוני חכם שעוזר למנהלים לסכם את השבוע.
תפקידך לבדוק מה קרה בפועל מול מה שתוכנן, ולעזור למנהל להפיק לקחים.

### כללי שיחה:
- עברית טבעית, חמה
- התבסס על הנתונים של השבוע ועל מה שנאמר בשיחת ההכנה
- שאל על דברים ספציפיים שעלו בשיחת ההכנה
- עזור למנהל לזהות דפוסים
- סכם תובנות שיעברו לשיחה הבאה

### פורמט תובנות:
כשיש מספיק מידע, הוסף בסוף ההודעה:
---INSIGHTS---
[
  {
    "type": "pattern|improvement|attention|positive",
    "description": "תיאור בעברית",
    "affected_employees": ["שם1"],
    "carry_forward": true
  }
]
---END_INSIGHTS---`;

// Build context for the AI conversation
async function buildConversationContext(
  prisma: PrismaClient,
  teamId: string,
  weekStart: Date,
  type: string
) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      employees: {
        where: { role: 'employee' },
        include: {
          tags: true,
          lifeEvents: { where: { endDate: null } },
          ratings: true,
          constraints: { where: { weekStart } },
          assignments: {
            where: {
              date: {
                gte: new Date(new Date(weekStart).setDate(weekStart.getDate() - 7)),
                lt: weekStart,
              },
            },
          },
        },
      },
    },
  });

  if (!team) return '';

  let context = `### מידע על הצוות: ${team.name}\n\n`;
  context += `### עובדים (${team.employees.length}):\n`;

  for (const emp of team.employees) {
    const tags = emp.tags.map(t => t.tag).join(', ');
    const avgRating = emp.ratings.length > 0
      ? (emp.ratings.reduce((s, r) => s + r.score, 0) / emp.ratings.length).toFixed(1)
      : 'אין דירוג';
    const lastWeekShifts = emp.assignments.length;
    const activeEvents = emp.lifeEvents.map(e => `${e.title} (${e.availabilityImpact})`).join(', ');

    context += `- **${emp.name}**: וותק ${emp.seniority} שנים`;
    if (tags) context += `, תגים: [${tags}]`;
    context += `, דירוג: ${avgRating}`;
    context += `, משמרות בשבוע שעבר: ${lastWeekShifts}`;
    if (activeEvents) context += `, אירועים: ${activeEvents}`;
    context += `\n`;
  }

  // For retrospective, add prep conversation summary
  if (type === 'retrospective') {
    const prepConversation = await prisma.managerConversation.findFirst({
      where: { teamId, weekStart, type: 'preparation', status: 'completed' },
      include: { constraints: { where: { approved: true } } },
    });

    if (prepConversation) {
      context += `\n### סיכום שיחת ההכנה לשבוע:\n`;
      if (prepConversation.extractedInsights) {
        context += JSON.stringify(prepConversation.extractedInsights, null, 2);
      }
      context += `\n\n### שיקולים שאושרו:\n`;
      for (const c of prepConversation.constraints) {
        context += `- [${c.type}] ${c.description}\n`;
      }
    }

    // Add actual week data
    const weekAssignments = await prisma.shiftAssignment.findMany({
      where: { weekStart, teamId },
      include: { employee: { select: { name: true } } },
    });

    const employeeShiftCounts = new Map<string, number>();
    for (const a of weekAssignments) {
      const name = a.employee.name;
      employeeShiftCounts.set(name, (employeeShiftCounts.get(name) || 0) + 1);
    }

    context += `\n### נתוני השבוע בפועל:\n`;
    for (const [name, count] of employeeShiftCounts) {
      context += `- ${name}: ${count} משמרות\n`;
    }
  }

  // Add employee constraints for this week (preparation)
  if (type === 'preparation') {
    const empsWithConstraints = team.employees.filter(e => e.constraints.length > 0);
    if (empsWithConstraints.length > 0) {
      context += `\n### אילוצים שעובדים הזינו לשבוע הבא:\n`;
      for (const emp of empsWithConstraints) {
        for (const c of emp.constraints) {
          const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
          const dayIndex = c.date.getDay();
          context += `- ${emp.name}: יום ${dayNames[dayIndex]} — ${c.availability} (${c.type})${c.reason ? ` [${c.reason}]` : ''}\n`;
        }
      }
    }
  }

  // Add previous conversations for carry-forward
  const prevConversations = await prisma.managerConversation.findMany({
    where: {
      teamId,
      status: 'completed',
      weekStart: { lt: weekStart },
    },
    orderBy: { weekStart: 'desc' },
    take: 2,
    select: { extractedInsights: true, weekStart: true },
  });

  if (prevConversations.length > 0) {
    context += `\n### תובנות משיחות קודמות:\n`;
    for (const pc of prevConversations) {
      if (pc.extractedInsights) {
        context += `שבוע ${pc.weekStart.toISOString().split('T')[0]}: ${JSON.stringify(pc.extractedInsights)}\n`;
      }
    }
  }

  return context;
}

// Parse constraints from AI response
function parseConstraints(text: string): { cleanText: string; constraints: any[] } {
  const constraintMatch = text.match(/---CONSTRAINTS---([\s\S]*?)---END_CONSTRAINTS---/);
  let constraints: any[] = [];
  let cleanText = text;

  if (constraintMatch) {
    cleanText = text.replace(/---CONSTRAINTS---[\s\S]*?---END_CONSTRAINTS---/, '').trim();
    try {
      const jsonStr = constraintMatch[1].trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, jsonStr];
      constraints = JSON.parse(jsonMatch[1]!.trim());
    } catch {
      // Failed to parse, ignore constraints
    }
  }

  return { cleanText, constraints };
}

// Parse insights from retrospective AI response
function parseInsights(text: string): { cleanText: string; insights: any[] } {
  const insightMatch = text.match(/---INSIGHTS---([\s\S]*?)---END_INSIGHTS---/);
  let insights: any[] = [];
  let cleanText = text;

  if (insightMatch) {
    cleanText = text.replace(/---INSIGHTS---[\s\S]*?---END_INSIGHTS---/, '').trim();
    try {
      const jsonStr = insightMatch[1].trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, jsonStr];
      insights = JSON.parse(jsonMatch[1]!.trim());
    } catch {
      // Failed to parse
    }
  }

  return { cleanText, insights };
}

// Create a new conversation
router.post('/', authenticate, authorize('manager', 'director'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { weekStart, teamId, type = 'preparation' } = req.body;

  if (!weekStart || !teamId) {
    res.status(400).json({ error: 'נדרשים תאריך התחלה וצוות' });
    return;
  }

  try {
    // Check if conversation already exists
    const existing = await prisma.managerConversation.findUnique({
      where: {
        managerId_teamId_weekStart_type: {
          managerId: req.user!.id,
          teamId,
          weekStart: new Date(weekStart),
          type,
        },
      },
      include: { constraints: true },
    });

    if (existing) {
      res.json(existing);
      return;
    }

    // Verify API key exists
    if (!process.env.ANTHROPIC_API_KEY) {
      res.status(500).json({ error: 'מפתח ANTHROPIC_API_KEY לא מוגדר בשרת' });
      return;
    }

    // Build context
    const context = await buildConversationContext(prisma, teamId, new Date(weekStart), type);

    // Create opening message from AI
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const systemPrompt = type === 'retrospective' ? RETRO_SYSTEM_PROMPT : MANAGER_SYSTEM_PROMPT;

    const openingPrompt = type === 'retrospective'
      ? `הנה הנתונים על הצוות והשבוע:\n${context}\n\nפתח שיחת רטרוספקטיבה קצרה עם המנהל. התבסס על מה שתוכנן בשיחת ההכנה מול מה שקרה בפועל. התחל בשאלה ממוקדת אחת.`
      : `הנה הנתונים על הצוות:\n${context}\n\nפתח שיחת הכנה עם המנהל לקראת השבוע הקרוב. התחל בברכה חמה ושאלה אחת על השבוע שעבר.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: openingPrompt }],
    });

    const aiText = response.content[0].type === 'text' ? response.content[0].text : '';

    const messages = [
      { role: 'assistant', content: aiText },
    ];

    const conversation = await prisma.managerConversation.create({
      data: {
        managerId: req.user!.id,
        teamId,
        weekStart: new Date(weekStart),
        type,
        messages,
        status: 'active',
      },
      include: { constraints: true },
    });

    res.json(conversation);
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת שיחה' });
  }
});

// Send message in conversation
router.post('/:id/message', authenticate, authorize('manager', 'director'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const id = req.params.id as string;
  const { message } = req.body;

  if (!message) {
    res.status(400).json({ error: 'נדרשת הודעה' });
    return;
  }

  try {
    const conversation = await prisma.managerConversation.findUnique({
      where: { id },
    });

    if (!conversation) {
      res.status(404).json({ error: 'שיחה לא נמצאה' });
      return;
    }

    if (conversation.status !== 'active') {
      res.status(400).json({ error: 'השיחה כבר הסתיימה' });
      return;
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      res.status(500).json({ error: 'מפתח ANTHROPIC_API_KEY לא מוגדר בשרת' });
      return;
    }

    // Build context for this message
    const context = await buildConversationContext(
      prisma, conversation.teamId, conversation.weekStart, conversation.type
    );

    const existingMessages = conversation.messages as any[];
    const systemPrompt = conversation.type === 'retrospective' ? RETRO_SYSTEM_PROMPT : MANAGER_SYSTEM_PROMPT;

    // Build messages for Claude API
    const apiMessages: { role: 'user' | 'assistant'; content: string }[] = [
      { role: 'user', content: `הנה הנתונים על הצוות:\n${context}\n\nהתחל שיחה.` },
    ];

    for (const msg of existingMessages) {
      apiMessages.push({ role: msg.role, content: msg.content });
    }
    apiMessages.push({ role: 'user', content: message });

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      system: systemPrompt,
      messages: apiMessages,
    });

    const aiText = response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse constraints or insights from response
    let newConstraints: any[] = [];
    let cleanAiText = aiText;

    if (conversation.type === 'preparation') {
      const parsed = parseConstraints(aiText);
      cleanAiText = parsed.cleanText;
      newConstraints = parsed.constraints;
    } else {
      const parsed = parseInsights(aiText);
      cleanAiText = parsed.cleanText;
      // Store insights as extractedInsights
      if (parsed.insights.length > 0) {
        await prisma.managerConversation.update({
          where: { id },
          data: {
            extractedInsights: parsed.insights as any,
          },
        });
      }
    }

    // Update conversation messages
    const updatedMessages = [
      ...existingMessages,
      { role: 'user', content: message },
      { role: 'assistant', content: cleanAiText },
    ];

    // Save new constraints if any
    if (newConstraints.length > 0) {
      // Resolve employee names to IDs
      const teamEmployees = await prisma.employee.findMany({
        where: { teamId: conversation.teamId },
        select: { id: true, name: true },
      });

      for (const c of newConstraints) {
        const affectedIds: string[] = (c.affected_employees || []).map((name: string) => {
          const emp = teamEmployees.find(e => e.name === name);
          return emp?.id;
        }).filter((x: string | undefined): x is string => !!x);

        await prisma.conversationConstraint.create({
          data: {
            conversationId: id,
            type: c.type || 'soft',
            category: c.category || 'workload',
            description: c.description || '',
            affectedEmployees: affectedIds,
            parameters: c.parameters || {},
            reasoning: c.reasoning || '',
            priority: c.priority || 5,
            approved: false,
          },
        });
      }
    }

    const updated = await prisma.managerConversation.update({
      where: { id },
      data: { messages: updatedMessages },
      include: { constraints: true },
    });

    res.json(updated);
  } catch (error) {
    console.error('Conversation message error:', error);
    res.status(500).json({ error: 'שגיאה בשליחת הודעה' });
  }
});

// Complete conversation
router.post('/:id/complete', authenticate, authorize('manager', 'director'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const id = req.params.id as string;

  try {
    const conversation = await prisma.managerConversation.findUnique({
      where: { id },
      include: { constraints: true },
    });

    if (!conversation) {
      res.status(404).json({ error: 'שיחה לא נמצאה' });
      return;
    }

    // Build summary from approved constraints
    const approvedConstraints = conversation.constraints.filter((c: any) => c.approved);

    const updated = await prisma.managerConversation.update({
      where: { id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        extractedInsights: {
          approvedCount: approvedConstraints.length,
          totalProposed: conversation.constraints.length,
          categories: [...new Set(approvedConstraints.map((c: any) => c.category))] as string[],
        },
      },
      include: { constraints: true },
    });

    res.json(updated);
  } catch (error) {
    console.error('Complete conversation error:', error);
    res.status(500).json({ error: 'שגיאה בסיום השיחה' });
  }
});

// Get constraints for a conversation
router.get('/:id/constraints', authenticate, authorize('manager', 'director'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const id = req.params.id as string;

  try {
    const constraints = await prisma.conversationConstraint.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
    });

    // Resolve employee names
    const allEmployeeIds = [...new Set(constraints.flatMap(c => c.affectedEmployees))];
    const employees = await prisma.employee.findMany({
      where: { id: { in: allEmployeeIds } },
      select: { id: true, name: true },
    });

    const enriched = constraints.map(c => ({
      ...c,
      affectedEmployeeNames: c.affectedEmployees.map(eid => {
        const emp = employees.find(e => e.id === eid);
        return emp?.name || eid;
      }),
    }));

    res.json(enriched);
  } catch (error) {
    console.error('Get constraints error:', error);
    res.status(500).json({ error: 'שגיאה בקבלת שיקולים' });
  }
});

// Approve/reject a constraint
router.put('/constraints/:constraintId', authenticate, authorize('manager', 'director'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const constraintId = req.params.constraintId as string;
  const { approved } = req.body;

  try {
    const updated = await prisma.conversationConstraint.update({
      where: { id: constraintId },
      data: { approved },
    });

    res.json(updated);
  } catch (error) {
    console.error('Update constraint error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון שיקול' });
  }
});

// Get conversation for a specific week/team
router.get('/week/:weekStart/:teamId', authenticate, authorize('manager', 'director'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const weekStart = req.params.weekStart as string;
  const teamId = req.params.teamId as string;
  const type = (req.query.type as string) || 'preparation';

  try {
    const conversation = await prisma.managerConversation.findFirst({
      where: {
        teamId,
        weekStart: new Date(weekStart),
        type,
      },
      include: { constraints: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!conversation) {
      res.json(null);
      return;
    }

    // Resolve employee names for constraints
    const allEmployeeIds = [...new Set(conversation.constraints.flatMap(c => c.affectedEmployees))];
    const employees = await prisma.employee.findMany({
      where: { id: { in: allEmployeeIds } },
      select: { id: true, name: true },
    });

    const enrichedConstraints = conversation.constraints.map(c => ({
      ...c,
      affectedEmployeeNames: c.affectedEmployees.map(eid => {
        const emp = employees.find(e => e.id === eid);
        return emp?.name || eid;
      }),
    }));

    res.json({ ...conversation, constraints: enrichedConstraints });
  } catch (error) {
    console.error('Get week conversation error:', error);
    res.status(500).json({ error: 'שגיאה בקבלת שיחה' });
  }
});

// Delete a constraint
router.delete('/constraints/:constraintId', authenticate, authorize('manager', 'director'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const constraintId = req.params.constraintId as string;

  try {
    await prisma.conversationConstraint.delete({
      where: { id: constraintId },
    });

    res.json({ message: 'השיקול נמחק' });
  } catch (error) {
    console.error('Delete constraint error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת שיקול' });
  }
});

export default router;
