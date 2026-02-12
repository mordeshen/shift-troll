# מערכת ניהול משמרות AI — מסמך אפיון טכני מלא

## הוראות ל-Claude Code

אתה בונה מערכת ניהול משמרות מבוססת AI עם 4 ממשקים נפרדים לפי תפקיד. **עבוד מודול אחרי מודול לפי סדר הבנייה בתחתית המסמך.** אל תוסיף פיצ'רים שלא מתוארים כאן.

**Stack טכנולוגי:**
- Frontend: React + TypeScript + Tailwind CSS
- Backend: Node.js + Express
- Database: PostgreSQL (עם Prisma ORM)
- AI: Anthropic Claude API (claude-sonnet-4-5-20250929)
- שפת ממשק: עברית (RTL)
- Auth: JWT פשוט עם role-based access (employee / team_lead / manager / director)

---

## ארכיטקטורת תפקידים

```
director (מנהל מנהלים)
  └── manager (מנהל)
       └── team_lead (ראש צוות)
            └── employee (עובד)
```

כל תפקיד רואה רק את המסך שלו. ראש צוות רואה רק את העובדים בצוות שלו. מנהל רואה את כל הצוותים תחתיו. director רואה הכל.

---

## מודול 1: מסך העובד — צ'אט אילוצים בשפה טבעית

### מטרה
העובד כותב בעברית חופשית את הזמינות שלו. ה-AI מפרסר לאילוצים מובנים. העובד מאשר ושולח.

### ממשק משתמש

**חלק עליון:** צ'אט עם העובד
- שדה טקסט חופשי + כפתור שליחה
- תשובת ה-AI מוצגת כבועת צ'אט: "הבנתי, הנה מה שקלטתי:"
- העובד יכול לכתוב הודעות נוספות לתיקון: "לא, ביום שלישי התכוונתי רק בוקר"
- ה-AI מעדכן את האילוצים בהתאם

**חלק תחתון:** כרטיסיות אילוצים
- כרטיס לכל יום עם אילוץ — מציג: תאריך, סוג (קשיח/רך), זמינות, סיבה
- כל כרטיס ניתן לעריכה ידנית (dropdown לשינוי זמינות/סוג)
- כפתור מחיקה על כל כרטיס
- ימים ללא אילוץ מוצגים בירוק בהיר עם "זמין"

**פוטר:** כפתור "שלח לסידור" — פעיל רק אחרי שהעובד אישר

**אלמנט נוסף:** מד "נקודות חילוף"
- מוצג בפינה העליונה — מראה לעובד כמה נקודות צבר (מהחלפות שעשה לאחרים)
- tooltip שמסביר: "הנקודות מזכות אותך בעדיפות כשתצטרך החלפה"

### לוגיקת AI — צ'אט רב-תורני

ה-AI צריך לתמוך בשיחה, לא רק בפירוק הודעה בודדת. שמור את ההיסטוריה של השיחה.

**System Prompt:**

```
אתה עוזר ידידותי שמסייע לעובדים לדווח על הזמינות שלהם למשמרות.

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
- השבוע מתחיל ב: {NEXT_SUNDAY_DATE}
```

**Flow:**

1. עובד כותב הודעה ראשונה
2. Backend שולח ל-Claude עם system prompt + הודעת העובד
3. Claude מחזיר JSON עם message + constraints
4. Frontend מציג את ה-message כבועת צ'אט + כרטיסיות אילוצים
5. עובד כותב תיקון → Backend שולח את כל ההיסטוריה + הודעה חדשה
6. Claude מחזיר JSON מעודכן (מחליף את כל מערך ה-constraints)
7. חוזר על 5-6 עד שהעובד מרוצה
8. "שלח לסידור" → שמירה ב-DB עם `confirmed: true`

### דוגמת שיחה

**עובד:** "השבוע הבא אני במילואים ביום שני, יום שלישי יש לי מבחן אז רק ערב, וחמישי עדיף שלא"

**AI:**
```json
{
  "message": "קלטתי! שני — מילואים (לא זמין), שלישי — רק ערב בגלל מבחן, חמישי — עדיף שלא. שאר הימים זמין. נכון?",
  "constraints": [
    { "date": "2026-02-15", "type": "hard", "availability": "unavailable", "reason": "מילואים", "original_text": "אני במילואים ביום שני" },
    { "date": "2026-02-16", "type": "hard", "availability": "evening_only", "reason": "מבחן", "original_text": "יום שלישי יש לי מבחן אז רק ערב" },
    { "date": "2026-02-18", "type": "soft", "availability": "unavailable", "reason": "העדפה אישית", "original_text": "חמישי עדיף שלא" }
  ],
  "general_notes": "זמין בשאר הימים"
}
```

**עובד:** "רגע, ביום שלישי התכוונתי שאני יכול גם בוקר, לא רק ערב"

**AI:**
```json
{
  "message": "עדכנתי — שלישי: בוקר או ערב. השאר נשאר כמו שהיה.",
  "constraints": [
    { "date": "2026-02-15", "type": "hard", "availability": "unavailable", "reason": "מילואים", "original_text": "אני במילואים ביום שני" },
    { "date": "2026-02-16", "type": "hard", "availability": "available", "reason": "מבחן — זמין בוקר וערב", "original_text": "יום שלישי התכוונתי שאני יכול גם בוקר" },
    { "date": "2026-02-18", "type": "soft", "availability": "unavailable", "reason": "העדפה אישית", "original_text": "חמישי עדיף שלא" }
  ],
  "general_notes": "זמין בשאר הימים"
}
```

---

## מודול 2: מסך ראש צוות — פרופיל אנושי של עובדים

### מטרה
ראש הצוות מכיר את העובדים שלו הכי טוב. המסך הזה נותן לו כלים לתעד את מה שהוא יודע — בצורה שה-AI והמנהל יוכלו להשתמש בה אחר כך.

### ממשק משתמש

**צד ימין: רשימת עובדי הצוות**
- כרטיס לכל עובד עם: שם, תמונה (אופציונלי), ותק, תגיות פעילות
- חיפוש + פילטר לפי תג
- אינדיקטור צבע: ירוק = הכל תקין, כתום = אירוע חיים פעיל, אדום = עומס גבוה

**מרכז: פרופיל עובד מורחב (נפתח בלחיצה)**

3 טאבים:

#### טאב 1: תיוג אופי (The Manager's Lens)
מערכת תגיות drag & drop. התגיות מחולקות לקטגוריות:

**תפקודי:**
- `closer` — הסוגר: מתפקד מצוין תחת לחץ בסוף משמרת
- `opener` — הפותח: מגיע מוקדם, מכין הכל
- `mentor` — החונך: טוב לליווי עובדים חדשים
- `dynamic` — דינמי: מסתגל לשינויים של הרגע האחרון
- `anchor` — העוגן: יציב, אפשר לסמוך שיגיע תמיד
- `specialist` — מומחה: יודע לעשות משהו ספציפי שאחרים לא

**חברתי:**
- `morale_booster` — מרים מורל
- `team_player` — שחקן צוות
- `solo` — עובד טוב לבד
- `leader` — מוביל טבעי

**זמינות:**
- `flexible` — גמיש בזמנים
- `nights_ok` — מוכן ללילות
- `weekends_ok` — מוכן לסופ"שים
- `limited` — זמינות מוגבלת

ראש הצוות גורר תגיות לפרופיל העובד. אפשר גם להוסיף תגית חופשית (custom tag).

#### טאב 2: ציר זמן אירועי חיים
ציר זמן ויזואלי (timeline) שמציג:
- מילואים (תאריכי התחלה-סיום)
- לימודים (תקופה + ימי מבחנים)
- הריון/חופשת לידה
- אירוע משפחתי
- בעיה בריאותית
- אחר (שדה חופשי)

כל אירוע = כרטיס על הציר עם: סוג, תאריכים, הערות, השפעה על זמינות (dropdown: "לא זמין כלל" / "זמינות חלקית" / "לקחת בחשבון").

**חשוב:** המידע הזה רגיש. מוצג רק לראש צוות ולמנהל ישיר. ב-dashboard של director מופיע רק כ"עומס אישי: גבוה/בינוני/נמוך".

#### טאב 3: AI Insights
כפתור "בקש תובנות מ-AI" — שולח ל-Claude את היסטוריית התיוג, האילוצים, והמשמרות של העובד ומקבל:

**System Prompt ל-Team Lead Insights:**

```
אתה מנתח נתוני עובדים ונותן תובנות לראשי צוותים.

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
}
```

### מבנה נתונים

```prisma
model EmployeeTag {
  id          String   @id @default(uuid())
  employeeId  String
  tag         String   // מהרשימה הקבועה או custom
  category    String   // "functional" | "social" | "availability" | "custom"
  assignedBy  String   // team_lead user ID
  assignedAt  DateTime @default(now())
  
  @@unique([employeeId, tag])
}

model LifeEvent {
  id              String   @id @default(uuid())
  employeeId      String
  type            String   // "military" | "studies" | "pregnancy" | "family" | "health" | "other"
  title           String
  startDate       DateTime
  endDate         DateTime?
  notes           String?
  availabilityImpact String // "unavailable" | "partial" | "consider"
  createdBy       String   // team_lead user ID
  createdAt       DateTime @default(now())
}
```

### API Endpoints

```
GET    /api/team/:teamId/employees         → עובדי הצוות עם תגיות ואירועים
POST   /api/employees/:id/tags             → הוספת תג (body: { tag, category })
DELETE /api/employees/:id/tags/:tag         → הסרת תג
POST   /api/employees/:id/life-events      → הוספת אירוע חיים
PUT    /api/employees/:id/life-events/:eid  → עדכון אירוע
DELETE /api/employees/:id/life-events/:eid  → מחיקת אירוע
POST   /api/employees/:id/ai-insights      → בקשת תובנות AI
```

---

## מודול 3: מסך המנהל — שיבוץ ותכנון

### מטרה
המנהל רואה את כל האילוצים, התגיות, והדירוגים — ומשתמש בהם כדי לייצר סידור עבודה חודשי/שבועי. המסך כולל את מנוע השיבוץ, לוח החלפות, ומערכת הדירוג.

### ממשק משתמש

**4 טאבים עיקריים:**

#### טאב 1: לוח שיבוץ ("לוח השחמט")
- תצוגה שבועית: שורות = משמרות (בוקר/ערב/לילה), עמודות = ימים
- תצוגה חודשית: overview מוקטן עם אינדיקטורי צבע
- כל תא = רשימת עובדים משובצים
- Drag & drop להזיז עובד בין תאים
- צבעי רקע:
  - ירוק = תקין, העובד זמין
  - צהוב = soft constraint מופר (העובד העדיף שלא, אבל שובץ)
  - אדום = בעיה (אין מספיק עובדים / חוסר בתג נדרש)
  - כחול = עובד סימן "זמין גם" (מועמד להחלפה)
- כפתור "ייצר סידור" → מפעיל את האלגוריתם
- כפתור "פרסם" → שולח לעובדים

#### טאב 2: לוח החלפות (Swap Board)
מסך שבו עובדים יכולים לבקש החלפות, והמנהל מאשר.

**Flow:**
1. עובד מבקש החלפה (מהמסך שלו — כפתור "בקש החלפה" על משמרת משובצת)
2. המערכת מציגה עובדים זמינים שיכולים להחליף (לפי אילוצים + תגיות)
3. עובד מחליף מאשר
4. המנהל רואה את הבקשה ומאשר סופית
5. **נקודות חילוף:** העובד שכיסה מקבל נקודה. העובד שביקש מוריד נקודה.

```
הנקודות משפיעות על:
- עדיפות בבקשות החלפה עתידיות (מי שצבר יותר → מקבל אישור מהיר יותר)
- ציון ההוגנות באלגוריתם השיבוץ
- מוצגות לעובד במסך שלו
```

#### טאב 3: דירוג עובדים
טבלה של כל העובדים עם:
- שם + תגיות
- 4 מדדי דירוג (כוכבים 1-5):
  - **אמינות** — הגעה בזמן, מעט ביטולים
  - **עבודת צוות** — משוב מעמיתים
  - **גמישות** — נכונות להחליף, כיסוי משמרות
  - **ביצועים** — איכות העבודה
- ציון כולל (משוקלל: אמינות 0.3, גמישות 0.3, ביצועים 0.2, צוות 0.2)
- שדה הערות חופשי
- כפתור "היסטוריה" שמציג שינויי דירוג לאורך זמן

#### טאב 4: סטטיסטיקות שבועיות
- חלוקת משמרות לעובד (bar chart)
- מדד הוגנות: מי עובד הכי הרבה / הכי פחות
- בקשות החלפה: כמה אושרו, כמה נדחו
- soft constraints שהופרו (עם שמות)

### אלגוריתם השיבוץ

**אל תשתמש ב-AI לשיבוץ עצמו.** אלגוריתם דטרמיניסטי:

```
שלב 1: בנה מטריצת זמינות
  לכל עובד × כל משמרת:
    0 = hard constraint → לא זמין
    1 = soft constraint → זמין אבל לא מעדיף
    2 = זמין
    3 = "זמין גם" (העובד סימן שמוכן לעוד)

שלב 2: חשב ציון לכל עובד-משמרת
  ציון = (rating × 0.3) + (הוגנות × 0.3) + (זמינות × 0.2) + (swap_points × 0.1) + (tag_match × 0.1)
  
  הוגנות = 1 - (משמרות_החודש / ממוצע_צוות)
  tag_match = 1 אם לעובד יש תג שהמשמרת דורשת, 0 אחרת
  swap_points = normalized(נקודות_חילוף) // 0-1

שלב 3: שיבוץ MRV + Backtracking
  - מיין משמרות לפי מספר עובדים זמינים (מהקשה לקלה)
  - לכל משמרת: שבץ את העובד עם הציון הגבוה ביותר
  - אם נתקע: חזור אחורה ונסה שילוב אחר

שלב 4: וולידציה
  - אף עובד לא עובד יותר מ-6 ימים ברצף
  - אין מעבר לילה→בוקר (פחות מ-8 שעות מנוחה)
  - כל hard constraint נשמר ב-100%
  - אם משמרת דורשת תג (למשל "senior") — חייב שלפחות עובד אחד בה יענה לדרישה
  - התרה על כל soft constraint שהופר

שלב 5: ייצור warnings
  - "משמרת ערב ביום שלישי — חסר עובד אחד"
  - "שרה שובצה ליום חמישי למרות שהעדיפה שלא"
  - "אין עובד עם תג 'closer' במשמרת ערב ביום ראשון"
```

### מבנה נתונים

```prisma
model Employee {
  id            String          @id @default(uuid())
  name          String
  email         String          @unique
  phone         String?
  role          String          @default("employee") // "employee" | "team_lead" | "manager" | "director"
  teamId        String?
  team          Team?           @relation(fields: [teamId], references: [id])
  seniority     Int             @default(0) // חודשי ותק
  swapPoints    Int             @default(0)
  constraints   Constraint[]
  tags          EmployeeTag[]
  lifeEvents    LifeEvent[]
  ratings       Rating[]
  assignments   ShiftAssignment[]
  swapRequests  SwapRequest[]   @relation("requester")
  swapCovers    SwapRequest[]   @relation("coverer")
  createdAt     DateTime        @default(now())
}

model Team {
  id        String     @id @default(uuid())
  name      String
  leadId    String     // team_lead user ID
  managerId String     // manager user ID
  employees Employee[]
}

model Constraint {
  id           String   @id @default(uuid())
  employeeId   String
  employee     Employee @relation(fields: [employeeId], references: [id])
  weekStart    DateTime
  date         DateTime
  type         String   // "hard" | "soft"
  availability String   // "unavailable" | "morning_only" | "evening_only" | "night_only" | "available" | "available_extra"
  reason       String?
  originalText String?
  confirmed    Boolean  @default(false)
  createdAt    DateTime @default(now())
}

model ShiftTemplate {
  id             String   @id @default(uuid())
  name           String   // "בוקר", "ערב", "לילה"
  startTime      String   // "07:00"
  endTime        String   // "15:00"
  requiredCount  Int
  dayOfWeek      Int      // 0-6
  requiredTags   String[]
  teamId         String
  createdAt      DateTime @default(now())
}

model ShiftAssignment {
  id          String   @id @default(uuid())
  employeeId  String
  employee    Employee @relation(fields: [employeeId], references: [id])
  date        DateTime
  shiftName   String
  status      String   @default("draft") // "draft" | "published" | "swap_requested" | "swapped"
  weekStart   DateTime
  teamId      String
  createdAt   DateTime @default(now())
}

model SwapRequest {
  id            String   @id @default(uuid())
  requesterId   String
  requester     Employee @relation("requester", fields: [requesterId], references: [id])
  assignmentId  String
  covererId     String?
  coverer       Employee? @relation("coverer", fields: [covererId], references: [id])
  status        String   @default("open") // "open" | "covered" | "approved" | "rejected" | "cancelled"
  pointsAwarded Boolean  @default(false)
  createdAt     DateTime @default(now())
  resolvedAt    DateTime?
}

model Rating {
  id          String   @id @default(uuid())
  employeeId  String
  employee    Employee @relation(fields: [employeeId], references: [id])
  category    String   // "reliability" | "teamwork" | "flexibility" | "performance"
  score       Int      // 1-5
  notes       String?
  ratedBy     String
  ratedAt     DateTime @default(now())
  
  @@unique([employeeId, category, ratedBy])
}
```

### API Endpoints — מנהל

```
POST   /api/schedule/generate          → ייצור סידור (body: { weekStart, teamId })
GET    /api/schedule/:weekStart/:teamId → קבלת סידור קיים
PUT    /api/schedule/move              → הזזת עובד (body: { assignmentId, newDate, newShift })
POST   /api/schedule/publish           → פרסום סידור
GET    /api/schedule/warnings/:weekStart/:teamId → התראות

POST   /api/swaps/request              → בקשת החלפה (body: { assignmentId })
GET    /api/swaps/available/:assignmentId → עובדים זמינים להחלפה
POST   /api/swaps/:id/cover            → עובד מכסה (body: { covererId })
POST   /api/swaps/:id/approve          → מנהל מאשר
POST   /api/swaps/:id/reject           → מנהל דוחה

PUT    /api/employees/:id/rate         → עדכון דירוג
GET    /api/stats/weekly/:weekStart/:teamId → סטטיסטיקות
GET    /api/stats/fairness/:month/:teamId  → מדד הוגנות
```

---

## מודול 4: Dashboard הנהלה — מבט מאקרו

### מטרה
מנהלי המנהלים (directors) רואים תמונה רחבה: מגמות, שחיקה, יעילות צוותים, ותחזיות. **אין כאן ניהול של אנשים בודדים** — רק נתונים מצרפיים.

### ממשק משתמש

**4 אזורים בדף אחד (Dashboard):**

#### אזור 1: מדד שחיקה (Burnout Index) — ראש הדף
- כרטיס אדום/כתום/ירוק לכל צוות
- חישוב: ממוצע משוקלל של (משמרות ברצף × 0.3 + משמרות לילה × 0.25 + ימים ללא חופש × 0.25 + soft constraints שהופרו × 0.2)
- לחיצה על צוות → drill down לעובדים עם הציון הגבוה ביותר (ללא פרטים רגישים, רק "עובד X — ציון שחיקה: 7.2/10")

#### אזור 2: השוואת צוותים — טבלה
| צוות | עובדים | מילוי משמרות (%) | ביטולים החודש | ציון הוגנות | ציון ממוצע |
|------|--------|-----------------|---------------|-------------|-----------|
| צוות א' | 12 | 96% | 3 | 8.1 | 4.2 |
| צוות ב' | 8  | 88% | 7 | 6.5 | 3.8 |

#### אזור 3: מגמות (Trends) — גרפים
- גרף קו: אחוז מילוי משמרות לאורך 6 חודשים
- גרף עמודות: ביטולים לפי חודש
- גרף עוגה: חלוקת סוגי אילוצים (hard vs soft)

#### אזור 4: חיזוי AI
כפתור "בקש חיזוי לחודש הבא" — שולח ל-Claude:

**System Prompt:**

```
אתה מנתח נתוני כוח אדם ברמה ארגונית.

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
      "affected_teams": ["team_id_1"],
      "timeframe": "חודש הבא / רבעון הבא"
    }
  ]
}
```

### API Endpoints — Director

```
GET /api/director/burnout-index          → מדד שחיקה לכל הצוותים
GET /api/director/team-comparison        → טבלת השוואת צוותים
GET /api/director/trends?months=6        → נתוני מגמות
POST /api/director/predict               → חיזוי AI לחודש הבא
```

---

## סדר בנייה

```
שלב 1: תשתית
  ├── הקם Prisma schema מלא (כל הטבלאות)
  ├── JWT auth עם roles
  ├── Seed: 3 צוותים, 15 עובדים, 3 ראשי צוות, 2 מנהלים, 1 director
  └── Layout ראשי עם RTL + ניווט לפי role

שלב 2: מודול 1 — צ'אט עובד
  ├── Frontend: מסך צ'אט + כרטיסיות אילוצים
  ├── Backend: Claude API integration
  └── בדיקה: שיחה רב-תורנית עובדת, אילוצים נשמרים

שלב 3: מודול 2 — מסך ראש צוות
  ├── Frontend: רשימת עובדים + 3 טאבים (תגיות, ציר זמן, AI)
  ├── Backend: CRUD לתגיות ואירועי חיים
  └── בדיקה: תיוג drag & drop, אירוע חיים על ציר זמן

שלב 4: מודול 3 — מסך מנהל
  ├── Frontend: לוח שיבוץ + לוח החלפות + דירוג + סטטיסטיקות
  ├── Backend: אלגוריתם שיבוץ + swap flow
  └── בדיקה: ייצור סידור, drag & drop, החלפה מלאה

שלב 5: מודול 4 — Dashboard
  ├── Frontend: 4 אזורים + גרפים (recharts)
  ├── Backend: aggregation queries + Claude AI predictions
  └── בדיקה: מדדים נכונים, חיזוי מחזיר תוצאות הגיוניות

שלב 6: אינטגרציה
  ├── Flow מלא: עובד → ראש צוות → מנהל → director
  ├── בדיקה end-to-end
  └── ניקוי + תיעוד
```

## הגדרות סביבה (.env)

```
DATABASE_URL=postgresql://user:pass@localhost:5432/shifts
ANTHROPIC_API_KEY=sk-ant-...
JWT_SECRET=your-secret-key
PORT=3001
```

## הערות חשובות

- **כל הממשק בעברית ו-RTL** — `dir="rtl"` על ה-body, Tailwind עם RTL support
- **אל תוסיף פיצ'רים** שלא מוזכרים כאן — לא gamification, לא notifications push, לא email
- **כל endpoint צריך error handling** עם הודעות שגיאה בעברית
- **השתמש ב-claude-sonnet-4-5-20250929** לכל קריאות ה-API
- **מידע רגיש (אירועי חיים)** — מוצג רק לראש צוות ומנהל ישיר, לא ל-director
- **נקודות חילוף** — לעולם לא יורדות מתחת ל-0. עובד חדש מתחיל עם 3 נקודות
- **כל הגרפים ב-Dashboard** עם recharts
