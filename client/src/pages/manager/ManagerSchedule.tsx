import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { ChevronRight, ChevronLeft, Zap, Send, AlertTriangle, GripVertical, Check, AlertCircle, Loader2, MessageSquare, Info, X, Brain } from 'lucide-react';

interface Assignment {
  id: string;
  employeeId: string;
  date: string;
  shiftName: string;
  status: string;
  conversationId?: string;
  aiReasoning?: {
    reasons: string[];
    conversationInfluenced: boolean;
  };
  employee: { id: string; name: string; tags?: { tag: string }[] };
}

const SHIFTS = ['בוקר', 'ערב', 'לילה'];
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function getWeekStart(offset: number): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day + offset * 7);
  return d.toISOString().split('T')[0];
}

export default function ManagerSchedule() {
  useAuth();
  const navigate = useNavigate();
  const [teams, setTeams] = useState<any[]>([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [weekOffset, setWeekOffset] = useState(1);
  const [schedule, setSchedule] = useState<Assignment[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [dragItem, setDragItem] = useState<Assignment | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [conversationStatus, setConversationStatus] = useState<string | null>(null);

  const weekStart = getWeekStart(weekOffset);
  const days: { date: string; name: string; display: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    days.push({
      date: d.toISOString().split('T')[0],
      name: DAY_NAMES[i],
      display: `${DAY_NAMES[i]} ${d.getDate()}/${d.getMonth() + 1}`,
    });
  }

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    api.get('/team').then(res => {
      setTeams(res.data);
      if (res.data.length > 0) setSelectedTeam(res.data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedTeam) return;
    loadSchedule();
  }, [selectedTeam, weekStart]);

  const loadSchedule = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/schedule/${weekStart}/${selectedTeam}`);
      setSchedule(res.data.schedule);
      setWarnings(res.data.warnings || []);
      setConversationStatus(res.data.conversationStatus || null);
    } catch {
      setSchedule([]);
      setWarnings([]);
      setConversationStatus(null);
    } finally {
      setLoading(false);
    }
  };

  const generateSchedule = async () => {
    setGenerating(true);
    try {
      const res = await api.post('/schedule/generate', { weekStart, teamId: selectedTeam });
      setSchedule(res.data.schedule);
      setWarnings(res.data.warnings || []);
    } catch (err: any) {
      setToast({ message: err.response?.data?.error || 'שגיאה בייצור סידור', type: 'error' });
    } finally {
      setGenerating(false);
    }
  };

  const publishSchedule = async () => {
    try {
      await api.post('/schedule/publish', { weekStart, teamId: selectedTeam });
      loadSchedule();
      setToast({ message: 'הסידור פורסם בהצלחה!', type: 'success' });
    } catch (err: any) {
      setToast({ message: err.response?.data?.error || 'שגיאה בפרסום', type: 'error' });
    }
  };

  const handleDrop = async (date: string, shiftName: string) => {
    if (!dragItem) return;
    try {
      await api.put('/schedule/move', {
        assignmentId: dragItem.id,
        newDate: date,
        newShift: shiftName,
      });
      loadSchedule();
    } catch (err: any) {
      setToast({ message: err.response?.data?.error || 'שגיאה בהזזה', type: 'error' });
    }
    setDragItem(null);
  };

  const getAssignments = (date: string, shiftName: string) =>
    schedule.filter(a => a.date.split('T')[0] === date && a.shiftName === shiftName);

  const getCellColor = (date: string, shiftName: string) => {
    const assignments = getAssignments(date, shiftName);
    if (assignments.length === 0) return 'bg-red-50';
    const hasWarning = warnings.some(w => w.includes(shiftName) && w.includes(DAY_NAMES[days.findIndex(d => d.date === date)]));
    if (hasWarning) return 'bg-yellow-50';
    return 'bg-white';
  };

  const isDraft = schedule.some(a => a.status === 'draft');
  const hasConversationInfluence = schedule.some(a => a.aiReasoning?.conversationInfluenced);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between mb-6 gap-3">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold">לוח שיבוץ</h2>
          {teams.length > 1 && (
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
            >
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setWeekOffset(w => w + 1)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="שבוע הבא">
              <ChevronRight className="w-5 h-5" />
            </button>
            <span className="text-sm font-medium px-2">{days[0].display} — {days[6].display}</span>
            <button onClick={() => setWeekOffset(w => w - 1)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="שבוע קודם">
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>

          <button
            onClick={() => navigate('/manager/conversation')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
              conversationStatus === 'completed'
                ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            {conversationStatus === 'completed' ? 'שיחה הושלמה' : 'שיחת הכנה'}
          </button>

          <button
            onClick={generateSchedule}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            <Zap className="w-4 h-4" />
            {generating ? 'מייצר...' : 'ייצר סידור'}
          </button>

          {isDraft && (
            <button
              onClick={publishSchedule}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
            >
              <Send className="w-4 h-4" />
              פרסם
            </button>
          )}
        </div>
      </div>

      {/* Conversation influence badge */}
      {hasConversationInfluence && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 mb-4 flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-600" />
          <span className="text-sm text-purple-700">הסידור מושפע משיחת ההכנה — לחץ על שיבוץ לפרטים</span>
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <h3 className="font-medium text-amber-800">התראות ({warnings.length})</h3>
          </div>
          <ul className="space-y-1">
            {warnings.map((w, i) => (
              <li key={i} className="text-sm text-amber-700">• {w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Schedule Grid */}
      {loading ? (
        <div className="text-center py-10 text-gray-400">
          <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin opacity-50" />
          <p>טוען סידור...</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="p-3 text-right text-sm font-medium text-gray-500 w-20">משמרת</th>
                {days.map(day => (
                  <th key={day.date} className="p-3 text-center text-sm font-medium text-gray-500">
                    {day.display}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SHIFTS.map(shift => (
                <tr key={shift} className="border-t border-gray-100">
                  <td className="p-3 text-sm font-medium text-gray-700 bg-gray-50">{shift}</td>
                  {days.map(day => {
                    const cellAssignments = getAssignments(day.date, shift);
                    return (
                      <td
                        key={`${day.date}_${shift}`}
                        className={`p-2 border-r border-gray-100 min-w-[120px] ${getCellColor(day.date, shift)} transition-colors`}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDrop(day.date, shift)}
                      >
                        <div className="space-y-1 min-h-[60px]">
                          {cellAssignments.map(a => (
                            <div
                              key={a.id}
                              draggable
                              onDragStart={() => setDragItem(a)}
                              onClick={() => setSelectedAssignment(a)}
                              className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs cursor-grab active:cursor-grabbing transition-colors relative group ${
                                a.status === 'draft' ? 'bg-blue-100 text-blue-800' :
                                a.status === 'published' ? 'bg-green-100 text-green-800' :
                                a.status === 'swap_requested' ? 'bg-orange-100 text-orange-800' :
                                'bg-gray-100 text-gray-800'
                              }`}
                            >
                              <GripVertical className="w-3 h-3 opacity-40" />
                              <span className="truncate">{a.employee.name}</span>
                              {a.aiReasoning?.conversationInfluenced && (
                                <Brain className="w-3 h-3 text-purple-500 shrink-0" />
                              )}
                            </div>
                          ))}
                          {cellAssignments.length === 0 && (
                            <div className="text-xs text-gray-300 text-center py-4">—</div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-6 mt-4 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-blue-100" /> טיוטה
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-green-100" /> מפורסם
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-orange-100" /> בקשת החלפה
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-yellow-50 border border-yellow-200" /> אילוץ רך מופר
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-red-50 border border-red-200" /> חסרים עובדים
        </div>
        {hasConversationInfluence && (
          <div className="flex items-center gap-1">
            <Brain className="w-3 h-3 text-purple-500" /> מושפע משיחה
          </div>
        )}
      </div>

      {/* Reasoning Popover */}
      {selectedAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedAssignment(null)} />
          <div className="relative bg-white rounded-xl shadow-xl border border-gray-200 p-5 max-w-sm w-full mx-4">
            <button
              onClick={() => setSelectedAssignment(null)}
              className="absolute top-3 left-3 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                selectedAssignment.aiReasoning?.conversationInfluenced
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-blue-100 text-blue-700'
              }`}>
                {selectedAssignment.employee.name.charAt(0)}
              </div>
              <div>
                <h4 className="font-bold text-gray-900">{selectedAssignment.employee.name}</h4>
                <p className="text-xs text-gray-500">
                  {selectedAssignment.shiftName} — {
                    DAY_NAMES[new Date(selectedAssignment.date).getDay()]
                  } {new Date(selectedAssignment.date).getDate()}/{new Date(selectedAssignment.date).getMonth() + 1}
                </p>
              </div>
            </div>

            {selectedAssignment.aiReasoning ? (
              <div>
                <h5 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <Info className="w-4 h-4" />
                  למה ככה:
                </h5>
                <ul className="space-y-1.5">
                  {selectedAssignment.aiReasoning.reasons.map((reason, i) => (
                    <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                      <span className="text-gray-400 mt-0.5">•</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
                {selectedAssignment.aiReasoning.conversationInfluenced && (
                  <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-1.5 text-xs text-purple-600">
                    <Brain className="w-3.5 h-3.5" />
                    שיבוץ זה הושפע משיחת ההכנה
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">אין מידע נוסף על שיבוץ זה</p>
            )}
          </div>
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
