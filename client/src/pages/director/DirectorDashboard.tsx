import { useState, useEffect } from 'react';
import api from '../../utils/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Brain, AlertTriangle, TrendingUp, Users, ChevronDown, ChevronUp } from 'lucide-react';

interface TeamBurnout {
  teamId: string;
  teamName: string;
  avgBurnout: number;
  status: 'red' | 'orange' | 'green';
  employees: { id: string; name: string; score: number; hasActiveLifeEvent: boolean }[];
}

interface TeamComparison {
  teamId: string;
  teamName: string;
  employeeCount: number;
  fillRate: number;
  avgRating: number;
  fairnessScore: number;
}

interface Trend {
  month: string;
  totalAssignments: number;
  cancellations: number;
  hardConstraints: number;
  softConstraints: number;
}

interface Prediction {
  type: string;
  severity: string;
  text: string;
  affected_teams: string[];
  timeframe: string;
}

const COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899'];

export default function DirectorDashboard() {
  const [burnout, setBurnout] = useState<TeamBurnout[]>([]);
  const [comparison, setComparison] = useState<TeamComparison[]>([]);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [predictLoading, setPredictLoading] = useState(false);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/director/burnout-index'),
      api.get('/director/team-comparison'),
      api.get('/director/trends?months=6'),
    ]).then(([burnoutRes, compRes, trendsRes]) => {
      setBurnout(burnoutRes.data);
      setComparison(compRes.data);
      setTrends(trendsRes.data);
    }).finally(() => setLoading(false));
  }, []);

  const requestPrediction = async () => {
    setPredictLoading(true);
    try {
      const res = await api.post('/director/predict');
      setPredictions(res.data.predictions || []);
    } catch {
      alert('שגיאה בקבלת חיזוי');
    } finally {
      setPredictLoading(false);
    }
  };

  const constraintPieData = trends.length > 0 ? [
    { name: 'אילוצים קשיחים', value: trends.reduce((s, t) => s + t.hardConstraints, 0) },
    { name: 'אילוצים רכים', value: trends.reduce((s, t) => s + t.softConstraints, 0) },
  ] : [];

  if (loading) {
    return <div className="text-center py-20 text-gray-400">טוען Dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Dashboard הנהלה</h2>

      {/* Area 1: Burnout Index */}
      <div>
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-orange-500" />
          מדד שחיקה
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {burnout.map(team => (
            <div key={team.teamId} className={`rounded-xl border-2 p-5 transition-all ${
              team.status === 'red' ? 'border-red-300 bg-red-50' :
              team.status === 'orange' ? 'border-orange-300 bg-orange-50' :
              'border-green-300 bg-green-50'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-lg">{team.teamName}</h4>
                <span className={`text-2xl font-bold ${
                  team.status === 'red' ? 'text-red-600' :
                  team.status === 'orange' ? 'text-orange-600' :
                  'text-green-600'
                }`}>
                  {team.avgBurnout}/10
                </span>
              </div>
              <button
                onClick={() => setExpandedTeam(expandedTeam === team.teamId ? null : team.teamId)}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
              >
                {expandedTeam === team.teamId ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                פרטי עובדים
              </button>

              {expandedTeam === team.teamId && (
                <div className="mt-3 space-y-2">
                  {team.employees.map(emp => (
                    <div key={emp.id} className="flex items-center justify-between text-sm bg-white/60 rounded-lg p-2">
                      <span>{emp.name}</span>
                      <div className="flex items-center gap-2">
                        {emp.hasActiveLifeEvent && (
                          <span className="text-xs bg-orange-200 text-orange-700 px-2 py-0.5 rounded-full">אירוע חיים</span>
                        )}
                        <span className={`font-bold ${emp.score > 7 ? 'text-red-600' : emp.score > 4 ? 'text-orange-600' : 'text-green-600'}`}>
                          {emp.score}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Area 2: Team Comparison */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-500" />
          השוואת צוותים
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b border-gray-100">
              <th className="text-right py-2 font-medium">צוות</th>
              <th className="text-center py-2 font-medium">עובדים</th>
              <th className="text-center py-2 font-medium">מילוי משמרות (%)</th>
              <th className="text-center py-2 font-medium">ציון ממוצע</th>
              <th className="text-center py-2 font-medium">ציון הוגנות</th>
            </tr>
          </thead>
          <tbody>
            {comparison.map(team => (
              <tr key={team.teamId} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-3 font-medium">{team.teamName}</td>
                <td className="py-3 text-center">{team.employeeCount}</td>
                <td className="py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${team.fillRate > 90 ? 'bg-green-500' : team.fillRate > 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${team.fillRate}%` }}
                      />
                    </div>
                    <span>{team.fillRate}%</span>
                  </div>
                </td>
                <td className="py-3 text-center">{team.avgRating}</td>
                <td className="py-3 text-center">{team.fairnessScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Area 3: Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 lg:col-span-2">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-500" />
            מגמות — 6 חודשים
          </h3>
          {trends.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="totalAssignments" name="שיבוצים" stroke="#3b82f6" strokeWidth={2} />
                <Line type="monotone" dataKey="cancellations" name="ביטולים" stroke="#ef4444" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center py-6">אין נתונים</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-bold mb-4">חלוקת סוגי אילוצים</h3>
          {constraintPieData.some(d => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={constraintPieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  dataKey="value"
                >
                  {constraintPieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center py-6">אין נתונים</p>
          )}
        </div>
      </div>

      {/* Area 4: AI Predictions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-500" />
            חיזוי AI
          </h3>
          <button
            onClick={requestPrediction}
            disabled={predictLoading}
            className="px-4 py-2 bg-gradient-to-l from-purple-600 to-blue-600 text-white rounded-lg text-sm hover:from-purple-700 hover:to-blue-700 disabled:opacity-50"
          >
            {predictLoading ? 'מנתח...' : 'בקש חיזוי לחודש הבא'}
          </button>
        </div>

        {predictions.length > 0 && (
          <div className="space-y-3">
            {predictions.map((pred, i) => (
              <div key={i} className={`p-4 rounded-xl border ${
                pred.severity === 'high' ? 'bg-red-50 border-red-200' :
                pred.severity === 'medium' ? 'bg-orange-50 border-orange-200' :
                'bg-blue-50 border-blue-200'
              }`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        pred.severity === 'high' ? 'bg-red-100 text-red-700' :
                        pred.severity === 'medium' ? 'bg-orange-100 text-orange-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {pred.type === 'shortage' ? 'מחסור' :
                         pred.type === 'burnout' ? 'שחיקה' :
                         pred.type === 'trend' ? 'מגמה' : 'המלצה'}
                      </span>
                      <span className="text-xs text-gray-400">{pred.timeframe}</span>
                    </div>
                    <p className="text-sm font-medium">{pred.text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
