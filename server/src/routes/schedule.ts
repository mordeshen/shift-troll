import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = Router();

function getPrisma(req: Request): PrismaClient {
  return req.app.locals.prisma;
}

// Generate schedule
router.post('/generate', authenticate, authorize('manager', 'director'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { weekStart, teamId, conversationId } = req.body;

  if (!weekStart || !teamId) {
    res.status(400).json({ error: 'נדרשים תאריך התחלה וצוות' });
    return;
  }

  try {
    const weekStartDate = new Date(weekStart);

    // Get team employees with their data
    const employees = await prisma.employee.findMany({
      where: { teamId, role: 'employee' },
      include: {
        constraints: { where: { weekStart: weekStartDate } },
        tags: true,
        ratings: true,
        assignments: {
          where: {
            date: {
              gte: new Date(new Date(weekStartDate).setDate(weekStartDate.getDate() - 30)),
            },
          },
        },
      },
    });

    // Load approved conversation constraints if available
    let convConstraints: any[] = [];
    let activeConversationId: string | null = conversationId || null;

    if (!activeConversationId) {
      // Try to find a completed conversation for this week/team
      const conversation = await prisma.managerConversation.findFirst({
        where: { teamId, weekStart: weekStartDate, type: 'preparation', status: 'completed' },
        orderBy: { createdAt: 'desc' },
      });
      if (conversation) activeConversationId = conversation.id;
    }

    if (activeConversationId) {
      convConstraints = await prisma.conversationConstraint.findMany({
        where: { conversationId: activeConversationId, approved: true },
      });
    }

    // Get shift templates
    const templates = await prisma.shiftTemplate.findMany({ where: { teamId } });

    // If no templates, create defaults
    if (templates.length === 0) {
      const defaultShifts = [
        { name: 'בוקר', startTime: '07:00', endTime: '15:00' },
        { name: 'ערב', startTime: '15:00', endTime: '23:00' },
        { name: 'לילה', startTime: '23:00', endTime: '07:00' },
      ];
      for (let day = 0; day < 7; day++) {
        for (const shift of defaultShifts) {
          await prisma.shiftTemplate.create({
            data: {
              name: shift.name,
              startTime: shift.startTime,
              endTime: shift.endTime,
              requiredCount: 2,
              dayOfWeek: day,
              requiredTags: [],
              teamId,
            },
          });
        }
      }
    }

    const allTemplates = await prisma.shiftTemplate.findMany({ where: { teamId } });

    // Delete existing draft assignments for this week
    await prisma.shiftAssignment.deleteMany({
      where: { weekStart: weekStartDate, teamId, status: 'draft' },
    });

    // === SCHEDULING ALGORITHM ===

    // Step 1: Build availability matrix
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStartDate);
      d.setDate(d.getDate() + i);
      days.push(d);
    }

    type SlotKey = string;
    const assignments: Map<SlotKey, string[]> = new Map();
    const employeeShiftCount: Map<string, number> = new Map();
    const employeeConsecutiveDays: Map<string, Set<string>> = new Map();
    const employeeLastShift: Map<string, string> = new Map();

    employees.forEach(e => {
      employeeShiftCount.set(e.id, 0);
      employeeConsecutiveDays.set(e.id, new Set());
    });

    // Calculate average team rating
    const avgRating = employees.reduce((sum, e) => {
      const ratings = e.ratings;
      if (ratings.length === 0) return sum + 3;
      const weighted = ratings.reduce((s, r) => {
        const w = r.category === 'reliability' ? 0.3 : r.category === 'flexibility' ? 0.3 : r.category === 'performance' ? 0.2 : 0.2;
        return s + r.score * w;
      }, 0);
      return sum + weighted;
    }, 0) / Math.max(employees.length, 1);

    // Collect all slots and sort by available employees (MRV)
    type Slot = { day: Date; dayIndex: number; template: typeof allTemplates[0]; availableEmployees: { id: string; score: number }[] };
    const slots: Slot[] = [];

    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const day = days[dayIndex];
      const dayStr = day.toISOString().split('T')[0];
      const dayTemplates = allTemplates.filter(t => t.dayOfWeek === dayIndex);

      for (const template of dayTemplates) {
        const available: { id: string; score: number }[] = [];

        for (const emp of employees) {
          const constraint = emp.constraints.find(c => c.date.toISOString().split('T')[0] === dayStr);
          let availabilityScore = 2; // default: available

          if (constraint) {
            if (constraint.type === 'hard' && constraint.availability === 'unavailable') {
              availabilityScore = 0;
            } else if (constraint.type === 'soft' && constraint.availability === 'unavailable') {
              availabilityScore = 1;
            } else if (constraint.availability === 'morning_only' && template.name !== 'בוקר') {
              availabilityScore = constraint.type === 'hard' ? 0 : 1;
            } else if (constraint.availability === 'evening_only' && template.name !== 'ערב') {
              availabilityScore = constraint.type === 'hard' ? 0 : 1;
            } else if (constraint.availability === 'night_only' && template.name !== 'לילה') {
              availabilityScore = constraint.type === 'hard' ? 0 : 1;
            } else if (constraint.availability === 'available_extra') {
              availabilityScore = 3;
            }
          }

          if (availabilityScore === 0) continue;

          // Check conversation hard constraints — separation
          const separationConstraints = convConstraints.filter(
            cc => cc.type === 'hard' && cc.category === 'separation' && cc.affectedEmployees.includes(emp.id)
          );

          // Check workload hard constraints
          const workloadConstraint = convConstraints.find(
            cc => cc.type === 'hard' && cc.category === 'workload' && cc.affectedEmployees.includes(emp.id)
          );
          if (workloadConstraint) {
            const params = workloadConstraint.parameters as any;
            if (params?.max_shifts) {
              const currentCount = employeeShiftCount.get(emp.id) || 0;
              if (currentCount >= params.max_shifts) continue;
            }
            if (params?.preferred_types && Array.isArray(params.preferred_types)) {
              const shiftTypeMap: Record<string, string> = { 'morning': 'בוקר', 'evening': 'ערב', 'night': 'לילה' };
              const preferredHebrew = params.preferred_types.map((t: string) => shiftTypeMap[t] || t);
              if (preferredHebrew.length > 0 && !preferredHebrew.includes('any') && !preferredHebrew.includes(template.name)) {
                availabilityScore = Math.max(availabilityScore - 1, 1); // Reduce but don't eliminate
              }
            }
          }

          // Check burnout constraint
          const burnoutConstraint = convConstraints.find(
            cc => (cc.type === 'hard' || cc.type === 'soft') && cc.category === 'burnout' && cc.affectedEmployees.includes(emp.id)
          );
          if (burnoutConstraint) {
            const params = burnoutConstraint.parameters as any;
            if (params?.max_shifts && burnoutConstraint.type === 'hard') {
              const currentCount = employeeShiftCount.get(emp.id) || 0;
              if (currentCount >= params.max_shifts) continue;
            }
          }

          // Rating score
          const ratings = emp.ratings;
          let ratingScore = 3;
          if (ratings.length > 0) {
            ratingScore = ratings.reduce((s, r) => {
              const w = r.category === 'reliability' ? 0.3 : r.category === 'flexibility' ? 0.3 : r.category === 'performance' ? 0.2 : 0.2;
              return s + r.score * w;
            }, 0);
          }

          // Fairness score
          const monthlyShifts = emp.assignments.length;
          const avgShifts = employees.reduce((s, e) => s + e.assignments.length, 0) / Math.max(employees.length, 1);
          const fairnessScore = avgShifts > 0 ? 1 - (monthlyShifts / avgShifts) : 1;

          // Swap points score
          const maxSwapPoints = Math.max(...employees.map(e => e.swapPoints), 1);
          const swapScore = emp.swapPoints / maxSwapPoints;

          // Tag match score
          const tagMatch = template.requiredTags.length === 0 ? 1 :
            template.requiredTags.some(t => emp.tags.some(et => et.tag === t)) ? 1 : 0;

          // Conversation-based scoring adjustments
          let convBonus = 0;

          // Utilization bonus — employee who wants more shifts
          const utilizationConstraint = convConstraints.find(
            cc => cc.category === 'utilization' && cc.affectedEmployees.includes(emp.id) && cc.approved
          );
          if (utilizationConstraint) {
            convBonus += 0.05;
          }

          // Development pairing bonus
          const developmentConstraint = convConstraints.find(
            cc => cc.category === 'development' && cc.affectedEmployees.includes(emp.id) && cc.approved
          );
          if (developmentConstraint) {
            const params = developmentConstraint.parameters as any;
            if (params?.shift_types) {
              const shiftTypeMap: Record<string, string> = { 'morning': 'בוקר', 'evening': 'ערב', 'night': 'לילה', 'closing': 'ערב' };
              const targetShifts = params.shift_types.map((t: string) => shiftTypeMap[t] || t);
              if (targetShifts.includes(template.name)) {
                convBonus += 0.08;
              }
            }
          }

          // Burnout reduction penalty (soft)
          if (burnoutConstraint && burnoutConstraint.type === 'soft') {
            convBonus -= 0.05;
          }

          const totalScore =
            (ratingScore / 5) * 0.25 +
            Math.max(0, Math.min(1, fairnessScore)) * 0.25 +
            (availabilityScore / 3) * 0.2 +
            swapScore * 0.1 +
            tagMatch * 0.1 +
            convBonus +
            0.1; // base normalization

          available.push({ id: emp.id, score: totalScore });
        }

        slots.push({ day, dayIndex, template, availableEmployees: available });
      }
    }

    // Step 3: Sort by MRV (most constrained first)
    slots.sort((a, b) => a.availableEmployees.length - b.availableEmployees.length);

    // Step 3: Assign using greedy + backtracking
    const warnings: string[] = [];

    for (const slot of slots) {
      const key = `${slot.day.toISOString().split('T')[0]}_${slot.template.name}`;
      const assigned: string[] = [];

      // Sort candidates by score descending
      const candidates = [...slot.availableEmployees].sort((a, b) => b.score - a.score);

      for (const candidate of candidates) {
        if (assigned.length >= slot.template.requiredCount) break;

        // Check 6 consecutive days rule
        const empDays = employeeConsecutiveDays.get(candidate.id)!;
        const dayStr = slot.day.toISOString().split('T')[0];

        // Check separation constraints — don't assign together
        let separationViolation = false;
        for (const cc of convConstraints.filter(c => c.category === 'separation' && c.approved)) {
          if (cc.affectedEmployees.includes(candidate.id)) {
            const otherIds = cc.affectedEmployees.filter((eid: string) => eid !== candidate.id);
            const params = cc.parameters as any;
            const shiftTypeMap: Record<string, string> = { 'morning': 'בוקר', 'evening': 'ערב', 'night': 'לילה' };
            const shiftTypes = params?.shift_types?.map((t: string) => shiftTypeMap[t] || t) || [];
            // If shift_types specified, only enforce for those shifts; otherwise all
            if (shiftTypes.length === 0 || shiftTypes.includes(slot.template.name)) {
              if (otherIds.some((oid: string) => assigned.includes(oid))) {
                if (cc.type === 'hard') {
                  separationViolation = true;
                  break;
                }
                // Soft separation — add warning but allow
              }
            }
          }
        }
        if (separationViolation) continue;

        // Check night→morning transition
        const lastShift = employeeLastShift.get(`${candidate.id}_${slot.dayIndex - 1}`);
        if (lastShift === 'לילה' && slot.template.name === 'בוקר') continue;

        // Count consecutive working days
        let consecutiveCount = 0;
        for (let d = slot.dayIndex - 1; d >= 0; d--) {
          if (empDays.has(days[d].toISOString().split('T')[0])) consecutiveCount++;
          else break;
        }
        if (consecutiveCount >= 6) continue;

        assigned.push(candidate.id);
        employeeShiftCount.set(candidate.id, (employeeShiftCount.get(candidate.id) || 0) + 1);
        empDays.add(dayStr);
        employeeLastShift.set(`${candidate.id}_${slot.dayIndex}`, slot.template.name);
      }

      assignments.set(key, assigned);

      // Generate warnings
      if (assigned.length < slot.template.requiredCount) {
        const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
        warnings.push(`משמרת ${slot.template.name} ביום ${dayNames[slot.dayIndex]} — חסרים ${slot.template.requiredCount - assigned.length} עובדים`);
      }

      // Check for soft constraint violations
      for (const empId of assigned) {
        const emp = employees.find(e => e.id === empId)!;
        const dayStr = slot.day.toISOString().split('T')[0];
        const constraint = emp.constraints.find(c => c.date.toISOString().split('T')[0] === dayStr);
        if (constraint && constraint.type === 'soft') {
          const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
          warnings.push(`${emp.name} שובץ ליום ${dayNames[slot.dayIndex]} ${slot.template.name} למרות שהעדיף/ה שלא`);
        }
      }

      // Check soft separation violations
      for (const cc of convConstraints.filter(c => c.category === 'separation' && c.type === 'soft' && c.approved)) {
        const params = cc.parameters as any;
        const shiftTypeMap: Record<string, string> = { 'morning': 'בוקר', 'evening': 'ערב', 'night': 'לילה' };
        const shiftTypes = params?.shift_types?.map((t: string) => shiftTypeMap[t] || t) || [];
        if (shiftTypes.length === 0 || shiftTypes.includes(slot.template.name)) {
          const affectedInSlot = cc.affectedEmployees.filter((eid: string) => assigned.includes(eid));
          if (affectedInSlot.length > 1) {
            const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
            const names = affectedInSlot.map((eid: string) => employees.find(e => e.id === eid)?.name || eid);
            warnings.push(`${names.join(' ו-')} שובצו ביחד ביום ${dayNames[slot.dayIndex]} ${slot.template.name} (מהשיחה: ${cc.description})`);
          }
        }
      }

      // Check for required tags
      if (slot.template.requiredTags.length > 0) {
        const assignedEmps = assigned.map(id => employees.find(e => e.id === id)!);
        for (const tag of slot.template.requiredTags) {
          if (!assignedEmps.some(e => e.tags.some(t => t.tag === tag))) {
            const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
            warnings.push(`אין עובד עם תג '${tag}' במשמרת ${slot.template.name} ביום ${dayNames[slot.dayIndex]}`);
          }
        }
      }
    }

    // Build reasoning for each assignment
    const reasoningMap = new Map<string, any>();

    for (const [key, empIds] of assignments) {
      const [dateStr, shiftName] = key.split('_');
      for (const empId of empIds) {
        const emp = employees.find(e => e.id === empId);
        const reasons: string[] = [];

        // Check employee constraint
        const constraint = emp?.constraints.find(c => c.date.toISOString().split('T')[0] === dateStr);
        if (constraint) {
          if (constraint.availability === 'available_extra') {
            reasons.push('העובד/ת הצהיר/ה זמינות נוספת');
          } else if (constraint.type === 'soft') {
            reasons.push(`שובץ למרות העדפה שלא (${constraint.reason || 'אילוץ רך'})`);
          }
        } else {
          reasons.push('זמין/ה לפי ברירת מחדל');
        }

        // Check conversation constraints that influenced this
        for (const cc of convConstraints.filter(c => c.approved)) {
          if (cc.affectedEmployees.includes(empId)) {
            if (cc.category === 'separation') {
              reasons.push(`הפרדה: ${cc.description}`);
            } else if (cc.category === 'development') {
              reasons.push(`הזדמנות פיתוח: ${cc.description}`);
            } else if (cc.category === 'utilization') {
              reasons.push(`ניצול מוטיבציה: ${cc.description}`);
            } else if (cc.category === 'burnout' || cc.category === 'workload') {
              reasons.push(`הפחתת עומס: ${cc.description}`);
            } else if (cc.category === 'pairing') {
              reasons.push(`שיבוץ משותף: ${cc.description}`);
            }
          }
        }

        reasoningMap.set(`${empId}_${dateStr}_${shiftName}`, {
          reasons,
          conversationInfluenced: reasons.some(r => r.includes('הפרדה') || r.includes('הזדמנות') || r.includes('ניצול') || r.includes('הפחתת') || r.includes('שיבוץ משותף')),
        });
      }
    }

    // Save assignments to DB
    const dbAssignments = [];
    for (const [key, empIds] of assignments) {
      const [dateStr, shiftName] = key.split('_');
      for (const empId of empIds) {
        const reasoning = reasoningMap.get(`${empId}_${dateStr}_${shiftName}`) || null;
        dbAssignments.push({
          employeeId: empId,
          date: new Date(dateStr),
          shiftName,
          status: 'draft',
          weekStart: weekStartDate,
          teamId,
          conversationId: activeConversationId || undefined,
          aiReasoning: reasoning,
        });
      }
    }

    if (dbAssignments.length > 0) {
      await prisma.shiftAssignment.createMany({ data: dbAssignments });
    }

    // Return the schedule
    const schedule = await prisma.shiftAssignment.findMany({
      where: { weekStart: weekStartDate, teamId },
      include: { employee: { select: { id: true, name: true, tags: true } } },
      orderBy: [{ date: 'asc' }],
    });

    res.json({ schedule, warnings });
  } catch (error) {
    console.error('Generate schedule error:', error);
    res.status(500).json({ error: 'שגיאה בייצור הסידור' });
  }
});

// Get existing schedule
router.get('/:weekStart/:teamId', authenticate, async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { weekStart, teamId } = req.params as Record<string, string>;

  try {
    const schedule = await prisma.shiftAssignment.findMany({
      where: { weekStart: new Date(weekStart), teamId },
      include: { employee: { select: { id: true, name: true, tags: true } } },
      orderBy: [{ date: 'asc' }],
    });

    const warnings = await generateWarnings(prisma, new Date(weekStart), teamId);

    // Check if there's a conversation for this week
    const conversation = await prisma.managerConversation.findFirst({
      where: { teamId, weekStart: new Date(weekStart), type: 'preparation' },
      select: { id: true, status: true },
    });

    res.json({ schedule, warnings, conversationId: conversation?.id, conversationStatus: conversation?.status });
  } catch (error) {
    console.error('Get schedule error:', error);
    res.status(500).json({ error: 'שגיאה בקבלת הסידור' });
  }
});

// Move employee (drag & drop)
router.put('/move', authenticate, authorize('manager', 'director'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { assignmentId, newDate, newShift } = req.body;

  try {
    const updated = await prisma.shiftAssignment.update({
      where: { id: assignmentId },
      data: {
        date: new Date(newDate),
        shiftName: newShift,
      },
      include: { employee: { select: { id: true, name: true } } },
    });
    res.json(updated);
  } catch (error) {
    console.error('Move assignment error:', error);
    res.status(500).json({ error: 'שגיאה בהזזת שיבוץ' });
  }
});

// Publish schedule
router.post('/publish', authenticate, authorize('manager', 'director'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { weekStart, teamId } = req.body;

  try {
    await prisma.shiftAssignment.updateMany({
      where: { weekStart: new Date(weekStart), teamId, status: 'draft' },
      data: { status: 'published' },
    });
    res.json({ message: 'הסידור פורסם בהצלחה' });
  } catch (error) {
    console.error('Publish schedule error:', error);
    res.status(500).json({ error: 'שגיאה בפרסום הסידור' });
  }
});

// Get warnings
router.get('/warnings/:weekStart/:teamId', authenticate, authorize('manager', 'director'), async (req: AuthRequest, res: Response) => {
  const prisma = getPrisma(req);
  const { weekStart, teamId } = req.params as Record<string, string>;

  try {
    const warnings = await generateWarnings(prisma, new Date(weekStart), teamId);
    res.json(warnings);
  } catch (error) {
    console.error('Get warnings error:', error);
    res.status(500).json({ error: 'שגיאה בקבלת התראות' });
  }
});

async function generateWarnings(prisma: PrismaClient, weekStart: Date, teamId: string): Promise<string[]> {
  const warnings: string[] = [];
  const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

  const assignments = await prisma.shiftAssignment.findMany({
    where: { weekStart, teamId },
    include: {
      employee: { include: { constraints: { where: { weekStart } }, tags: true } },
    },
  });

  const templates = await prisma.shiftTemplate.findMany({ where: { teamId } });

  // Check each shift slot
  for (let day = 0; day < 7; day++) {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + day);
    const dateStr = date.toISOString().split('T')[0];

    const dayTemplates = templates.filter(t => t.dayOfWeek === day);
    for (const template of dayTemplates) {
      const slotAssignments = assignments.filter(
        a => a.date.toISOString().split('T')[0] === dateStr && a.shiftName === template.name
      );

      if (slotAssignments.length < template.requiredCount) {
        warnings.push(`משמרת ${template.name} ביום ${dayNames[day]} — חסרים ${template.requiredCount - slotAssignments.length} עובדים`);
      }

      // Check soft constraint violations
      for (const a of slotAssignments) {
        const constraint = a.employee.constraints.find(
          c => c.date.toISOString().split('T')[0] === dateStr && c.type === 'soft'
        );
        if (constraint) {
          warnings.push(`${a.employee.name} שובץ/ה ליום ${dayNames[day]} ${template.name} למרות שהעדיף/ה שלא`);
        }
      }
    }
  }

  return warnings;
}

export default router;
