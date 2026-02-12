import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';
import { Calendar, ArrowRight, ArrowLeft, RefreshCw } from 'lucide-react';

interface Assignment {
  id: string;
  date: string;
  shiftName: string;
  status: string;
  employee: { id: string; name: string };
}

const shiftColors: Record<string, string> = {
  'בוקר': 'bg-amber-100 text-amber-800 border-amber-200',
  'ערב': 'bg-blue-100 text-blue-800 border-blue-200',
  'לילה': 'bg-indigo-100 text-indigo-800 border-indigo-200',
};

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d.toISOString().split('T')[0];
}

export default function EmployeeSchedule() {
  const { user } = useAuth();
  const [weekOffset, setWeekOffset] = useState(0);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + weekOffset * 7);
  const weekStart = getWeekStart(baseDate);

  const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    days.push({
      date: d.toISOString().split('T')[0],
      name: dayNames[i],
      display: `${dayNames[i]} ${d.getDate()}/${d.getMonth() + 1}`,
    });
  }

  useEffect(() => {
    if (!user?.teamId) return;
    setLoading(true);
    api.get(`/schedule/${weekStart}/${user.teamId}`)
      .then(res => {
        const myAssignments = res.data.schedule.filter(
          (a: Assignment) => a.employee.id === user.id
        );
        setAssignments(myAssignments);
      })
      .catch(() => setAssignments([]))
      .finally(() => setLoading(false));
  }, [weekStart, user?.teamId, user?.id]);

  const requestSwap = async (assignmentId: string) => {
    try {
      await api.post('/swaps/request', { assignmentId });
      alert('בקשת החלפה נשלחה!');
      // Refresh
      const res = await api.get(`/schedule/${weekStart}/${user?.teamId}`);
      setAssignments(res.data.schedule.filter((a: Assignment) => a.employee.id === user?.id));
    } catch (err: any) {
      alert(err.response?.data?.error || 'שגיאה');
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">המשמרות שלי</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekOffset(w => w - 1)} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowRight className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium px-3">{days[0].display} — {days[6].display}</span>
          <button onClick={() => setWeekOffset(w => w + 1)} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400">טוען...</div>
      ) : assignments.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>אין משמרות השבוע</p>
        </div>
      ) : (
        <div className="space-y-3">
          {days.map(day => {
            const dayAssignments = assignments.filter(a => a.date.split('T')[0] === day.date);
            if (dayAssignments.length === 0) return null;

            return (
              <div key={day.date} className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="font-medium text-gray-700 mb-3">{day.display}</h3>
                <div className="space-y-2">
                  {dayAssignments.map(a => (
                    <div key={a.id} className={`flex items-center justify-between p-3 rounded-lg border ${shiftColors[a.shiftName] || 'bg-gray-100'}`}>
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{a.shiftName}</span>
                        <span className="text-xs opacity-70">
                          {a.status === 'published' ? 'מפורסם' : a.status === 'swap_requested' ? 'בבקשת החלפה' : a.status}
                        </span>
                      </div>
                      {a.status === 'published' && (
                        <button
                          onClick={() => requestSwap(a.id)}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 bg-white/50 rounded-lg hover:bg-white/80 transition-colors"
                        >
                          <RefreshCw className="w-3 h-3" />
                          בקש החלפה
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
