import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';
import { Calendar, ArrowRight, ArrowLeft, Zap, Send, AlertTriangle, GripVertical } from 'lucide-react';

interface Assignment {
  id: string;
  employeeId: string;
  date: string;
  shiftName: string;
  status: string;
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
  const { user } = useAuth();
  const [teams, setTeams] = useState<any[]>([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [weekOffset, setWeekOffset] = useState(1);
  const [schedule, setSchedule] = useState<Assignment[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [dragItem, setDragItem] = useState<Assignment | null>(null);

  const weekStart = getWeekStart(weekOffset);
  const days = [];
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
    } catch {
      setSchedule([]);
      setWarnings([]);
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
      alert(err.response?.data?.error || 'שגיאה בייצור סידור');
    } finally {
      setGenerating(false);
    }
  };

  const publishSchedule = async () => {
    try {
      await api.post('/schedule/publish', { weekStart, teamId: selectedTeam });
      loadSchedule();
      alert('הסידור פורסם בהצלחה!');
    } catch (err: any) {
      alert(err.response?.data?.error || 'שגיאה בפרסום');
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
      alert(err.response?.data?.error || 'שגיאה בהזזה');
    }
    setDragItem(null);
  };

  const getAssignments = (date: string, shiftName: string) =>
    schedule.filter(a => a.date.split('T')[0] === date && a.shiftName === shiftName);

  const getCellColor = (date: string, shiftName: string) => {
    const assignments = getAssignments(date, shiftName);
    if (assignments.length === 0) return 'bg-red-50';
    // Check if any soft constraint violated
    const hasWarning = warnings.some(w => w.includes(shiftName) && w.includes(DAY_NAMES[days.findIndex(d => d.date === date)]));
    if (hasWarning) return 'bg-yellow-50';
    return 'bg-white';
  };

  const isDraft = schedule.some(a => a.status === 'draft');
  const isPublished = schedule.some(a => a.status === 'published');

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
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

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setWeekOffset(w => w - 1)} className="p-2 hover:bg-gray-100 rounded-lg">
              <ArrowRight className="w-5 h-5" />
            </button>
            <span className="text-sm font-medium px-2">{days[0].display} — {days[6].display}</span>
            <button onClick={() => setWeekOffset(w => w + 1)} className="p-2 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>

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
        <div className="text-center py-10 text-gray-400">טוען...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
                              className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs cursor-grab active:cursor-grabbing transition-colors ${
                                a.status === 'draft' ? 'bg-blue-100 text-blue-800' :
                                a.status === 'published' ? 'bg-green-100 text-green-800' :
                                a.status === 'swap_requested' ? 'bg-orange-100 text-orange-800' :
                                'bg-gray-100 text-gray-800'
                              }`}
                            >
                              <GripVertical className="w-3 h-3 opacity-40" />
                              <span className="truncate">{a.employee.name}</span>
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
      <div className="flex items-center gap-6 mt-4 text-xs text-gray-500">
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
      </div>
    </div>
  );
}
