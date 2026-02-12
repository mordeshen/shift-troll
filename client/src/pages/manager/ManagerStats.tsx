import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ArrowRight, ArrowLeft } from 'lucide-react';

interface Distribution {
  name: string;
  morning: number;
  evening: number;
  night: number;
  total: number;
}

interface Stats {
  distribution: Distribution[];
  fairness: { avg: string; max: number; min: number; range: number };
  swapStats: { total: number; approved: number; rejected: number; pending: number };
  violations: { name: string; date: string; reason: string }[];
}

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function getWeekStart(offset: number): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day + offset * 7);
  return d.toISOString().split('T')[0];
}

export default function ManagerStats() {
  const [teams, setTeams] = useState<any[]>([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const weekStart = getWeekStart(weekOffset);

  useEffect(() => {
    api.get('/team').then(res => {
      setTeams(res.data);
      if (res.data.length > 0) setSelectedTeam(res.data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedTeam) return;
    setLoading(true);
    api.get(`/stats/weekly/${weekStart}/${selectedTeam}`)
      .then(res => setStats(res.data))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [selectedTeam, weekStart]);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    days.push({
      date: d.toISOString().split('T')[0],
      display: `${DAY_NAMES[i]} ${d.getDate()}/${d.getMonth() + 1}`,
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">סטטיסטיקות שבועיות</h2>
        <div className="flex items-center gap-4">
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
          <div className="flex items-center gap-2">
            <button onClick={() => setWeekOffset(w => w - 1)} className="p-2 hover:bg-gray-100 rounded-lg">
              <ArrowRight className="w-5 h-5" />
            </button>
            <span className="text-sm font-medium">{days[0].display} — {days[6].display}</span>
            <button onClick={() => setWeekOffset(w => w + 1)} className="p-2 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400">טוען...</div>
      ) : !stats ? (
        <div className="text-center py-10 text-gray-400">אין נתונים</div>
      ) : (
        <div className="space-y-6">
          {/* Shift Distribution Chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-bold mb-4">חלוקת משמרות לעובד</h3>
            {stats.distribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stats.distribution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="morning" name="בוקר" fill="#f59e0b" />
                  <Bar dataKey="evening" name="ערב" fill="#3b82f6" />
                  <Bar dataKey="night" name="לילה" fill="#6366f1" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-400 text-center py-6">אין נתונים</p>
            )}
          </div>

          {/* Fairness & Swap Stats */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-bold mb-4">מדד הוגנות</h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-blue-600">{stats.fairness.avg}</p>
                  <p className="text-xs text-gray-500">ממוצע משמרות</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">{stats.fairness.max}</p>
                  <p className="text-xs text-gray-500">מקסימום</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600">{stats.fairness.min}</p>
                  <p className="text-xs text-gray-500">מינימום</p>
                </div>
              </div>
              <div className="mt-4 text-center">
                <p className="text-sm text-gray-500">פער: <span className="font-bold">{stats.fairness.range}</span> משמרות</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-bold mb-4">בקשות החלפה</h3>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-blue-600">{stats.swapStats.total}</p>
                  <p className="text-xs text-gray-500">סה"כ</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">{stats.swapStats.approved}</p>
                  <p className="text-xs text-gray-500">אושרו</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600">{stats.swapStats.rejected}</p>
                  <p className="text-xs text-gray-500">נדחו</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-orange-600">{stats.swapStats.pending}</p>
                  <p className="text-xs text-gray-500">ממתינים</p>
                </div>
              </div>
            </div>
          </div>

          {/* Soft Constraint Violations */}
          {stats.violations.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-bold mb-4">אילוצים רכים שהופרו</h3>
              <div className="space-y-2">
                {stats.violations.map((v, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm py-2 border-b border-gray-50 last:border-0">
                    <span className="font-medium">{v.name}</span>
                    <span className="text-gray-400">—</span>
                    <span className="text-gray-600">{v.date}</span>
                    <span className="text-gray-400">—</span>
                    <span className="text-gray-500">{v.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
