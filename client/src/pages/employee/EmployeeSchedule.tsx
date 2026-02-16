import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';
import { Calendar, ChevronRight, ChevronLeft, RefreshCw, Check, AlertCircle, Loader2 } from 'lucide-react';

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
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const requestSwap = async (assignmentId: string) => {
    try {
      await api.post('/swaps/request', { assignmentId });
      setToast({ message: 'בקשת החלפה נשלחה!', type: 'success' });
      const res = await api.get(`/schedule/${weekStart}/${user?.teamId}`);
      setAssignments(res.data.schedule.filter((a: Assignment) => a.employee.id === user?.id));
    } catch (err: any) {
      setToast({ message: err.response?.data?.error || 'שגיאה', type: 'error' });
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">המשמרות שלי</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekOffset(w => w + 1)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="שבוע הבא">
            <ChevronRight className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium px-3">{days[0].display} — {days[6].display}</span>
          <button onClick={() => setWeekOffset(w => w - 1)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="שבוע קודם">
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400">
          <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin opacity-50" />
          <p>טוען משמרות...</p>
        </div>
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
                          className="flex items-center gap-1 text-xs px-3 py-1.5 bg-white/70 rounded-lg hover:bg-white transition-colors"
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

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg text-sm text-white z-50 ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}
    </div>
  );
}
