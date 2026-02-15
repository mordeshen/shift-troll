import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Skip if already seeded
  const existing = await prisma.employee.count();
  if (existing > 0) {
    console.log('Database already seeded, skipping.');
    return;
  }

  console.log('Seeding database...');

  const password = await bcrypt.hash('123456', 10);

  // Create Director
  const director = await prisma.employee.create({
    data: {
      name: 'אבי כהן',
      email: 'director@example.com',
      password,
      role: 'director',
      seniority: 120,
      swapPoints: 0,
    },
  });

  // Create Managers
  const manager1 = await prisma.employee.create({
    data: {
      name: 'רונית לוי',
      email: 'manager1@example.com',
      password,
      role: 'manager',
      seniority: 60,
      swapPoints: 0,
    },
  });

  const manager2 = await prisma.employee.create({
    data: {
      name: 'דוד ישראלי',
      email: 'manager2@example.com',
      password,
      role: 'manager',
      seniority: 48,
      swapPoints: 0,
    },
  });

  // Create Team Leads
  const lead1 = await prisma.employee.create({
    data: {
      name: 'שרה מזרחי',
      email: 'lead1@example.com',
      password,
      role: 'team_lead',
      seniority: 36,
      swapPoints: 5,
    },
  });

  const lead2 = await prisma.employee.create({
    data: {
      name: 'יוסי אברהם',
      email: 'lead2@example.com',
      password,
      role: 'team_lead',
      seniority: 30,
      swapPoints: 3,
    },
  });

  const lead3 = await prisma.employee.create({
    data: {
      name: 'מיכל דהן',
      email: 'lead3@example.com',
      password,
      role: 'team_lead',
      seniority: 24,
      swapPoints: 4,
    },
  });

  // Create Teams
  const team1 = await prisma.team.create({
    data: {
      name: 'צוות אלפא',
      leadId: lead1.id,
      managerId: manager1.id,
    },
  });

  const team2 = await prisma.team.create({
    data: {
      name: 'צוות בטא',
      leadId: lead2.id,
      managerId: manager1.id,
    },
  });

  const team3 = await prisma.team.create({
    data: {
      name: 'צוות גמא',
      leadId: lead3.id,
      managerId: manager2.id,
    },
  });

  // Update team leads with team assignment
  await prisma.employee.update({ where: { id: lead1.id }, data: { teamId: team1.id } });
  await prisma.employee.update({ where: { id: lead2.id }, data: { teamId: team2.id } });
  await prisma.employee.update({ where: { id: lead3.id }, data: { teamId: team3.id } });

  // Create Employees
  const employeeData = [
    // Team Alpha (5 employees)
    { name: 'דנה כהן', email: 'dana@example.com', teamId: team1.id, seniority: 18 },
    { name: 'עומר פרץ', email: 'omer@example.com', teamId: team1.id, seniority: 12 },
    { name: 'נועה גולן', email: 'noa@example.com', teamId: team1.id, seniority: 24 },
    { name: 'איתי שפירא', email: 'itay@example.com', teamId: team1.id, seniority: 6 },
    { name: 'הילה ברק', email: 'hila@example.com', teamId: team1.id, seniority: 15 },
    // Team Beta (5 employees)
    { name: 'רועי מלכה', email: 'roi@example.com', teamId: team2.id, seniority: 20 },
    { name: 'ליאור חיים', email: 'lior@example.com', teamId: team2.id, seniority: 10 },
    { name: 'תמר אלון', email: 'tamar@example.com', teamId: team2.id, seniority: 8 },
    { name: 'אלעד נחום', email: 'elad@example.com', teamId: team2.id, seniority: 14 },
    { name: 'שיר וולף', email: 'shir@example.com', teamId: team2.id, seniority: 22 },
    // Team Gamma (5 employees)
    { name: 'יובל רוזן', email: 'yuval@example.com', teamId: team3.id, seniority: 16 },
    { name: 'מור ביטון', email: 'mor@example.com', teamId: team3.id, seniority: 11 },
    { name: 'גל סויסה', email: 'gal@example.com', teamId: team3.id, seniority: 9 },
    { name: 'אופיר לוי', email: 'ofir@example.com', teamId: team3.id, seniority: 19 },
    { name: 'רותם כץ', email: 'rotem@example.com', teamId: team3.id, seniority: 7 },
  ];

  const employees = [];
  for (const data of employeeData) {
    const emp = await prisma.employee.create({
      data: {
        name: data.name,
        email: data.email,
        password,
        role: 'employee',
        teamId: data.teamId,
        seniority: data.seniority,
        swapPoints: 3, // New employees start with 3
      },
    });
    employees.push(emp);
  }

  // Add some tags
  const tags = [
    { employeeId: employees[0].id, tag: 'closer', category: 'functional', assignedBy: lead1.id },
    { employeeId: employees[0].id, tag: 'team_player', category: 'social', assignedBy: lead1.id },
    { employeeId: employees[1].id, tag: 'opener', category: 'functional', assignedBy: lead1.id },
    { employeeId: employees[1].id, tag: 'dynamic', category: 'functional', assignedBy: lead1.id },
    { employeeId: employees[2].id, tag: 'mentor', category: 'functional', assignedBy: lead1.id },
    { employeeId: employees[2].id, tag: 'anchor', category: 'functional', assignedBy: lead1.id },
    { employeeId: employees[3].id, tag: 'flexible', category: 'availability', assignedBy: lead1.id },
    { employeeId: employees[4].id, tag: 'nights_ok', category: 'availability', assignedBy: lead1.id },
    { employeeId: employees[5].id, tag: 'leader', category: 'social', assignedBy: lead2.id },
    { employeeId: employees[6].id, tag: 'specialist', category: 'functional', assignedBy: lead2.id },
    { employeeId: employees[7].id, tag: 'morale_booster', category: 'social', assignedBy: lead2.id },
    { employeeId: employees[8].id, tag: 'weekends_ok', category: 'availability', assignedBy: lead2.id },
    { employeeId: employees[10].id, tag: 'anchor', category: 'functional', assignedBy: lead3.id },
    { employeeId: employees[11].id, tag: 'solo', category: 'social', assignedBy: lead3.id },
    { employeeId: employees[12].id, tag: 'flexible', category: 'availability', assignedBy: lead3.id },
  ];

  for (const tag of tags) {
    await prisma.employeeTag.create({ data: tag });
  }

  // Create shift templates for each team
  const shifts = [
    { name: 'בוקר', startTime: '07:00', endTime: '15:00' },
    { name: 'ערב', startTime: '15:00', endTime: '23:00' },
    { name: 'לילה', startTime: '23:00', endTime: '07:00' },
  ];

  for (const team of [team1, team2, team3]) {
    for (let day = 0; day < 7; day++) {
      for (const shift of shifts) {
        await prisma.shiftTemplate.create({
          data: {
            name: shift.name,
            startTime: shift.startTime,
            endTime: shift.endTime,
            requiredCount: 2,
            dayOfWeek: day,
            requiredTags: [],
            teamId: team.id,
          },
        });
      }
    }
  }

  // Add some ratings
  const ratingCategories = ['reliability', 'teamwork', 'flexibility', 'performance'] as const;
  for (const emp of employees) {
    const rater = emp.teamId === team1.id ? manager1.id : emp.teamId === team2.id ? manager1.id : manager2.id;
    for (const category of ratingCategories) {
      await prisma.rating.create({
        data: {
          employeeId: emp.id,
          category,
          score: Math.floor(Math.random() * 3) + 3, // 3-5
          ratedBy: rater,
        },
      });
    }
  }

  console.log('Seed completed!');
  console.log('');
  console.log('Login credentials (password for all: 123456):');
  console.log('  Director: director@example.com');
  console.log('  Manager 1: manager1@example.com');
  console.log('  Manager 2: manager2@example.com');
  console.log('  Team Lead 1: lead1@example.com');
  console.log('  Team Lead 2: lead2@example.com');
  console.log('  Team Lead 3: lead3@example.com');
  console.log('  Employee (example): dana@example.com');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
