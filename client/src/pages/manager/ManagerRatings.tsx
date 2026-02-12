import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { Star, Save } from 'lucide-react';

interface Employee {
  id: string;
  name: string;
  tags: { tag: string }[];
  ratings: { category: string; score: number }[];
}

const CATEGORIES = [
  { key: 'reliability', label: 'אמינות', weight: 0.3 },
  { key: 'flexibility', label: 'גמישות', weight: 0.3 },
  { key: 'performance', label: 'ביצועים', weight: 0.2 },
  { key: 'teamwork', label: 'עבודת צוות', weight: 0.2 },
];

const TAG_LABELS: Record<string, string> = {
  closer: 'סוגר', opener: 'פותח', mentor: 'חונך', dynamic: 'דינמי',
  anchor: 'עוגן', specialist: 'מומחה', morale_booster: 'מרים מורל',
  team_player: 'שחקן צוות', solo: 'עובד לבד', leader: 'מוביל',
  flexible: 'גמיש', nights_ok: 'לילות', weekends_ok: 'סופ"שים', limited: 'מוגבל',
};

export default function ManagerRatings() {
  const [teams, setTeams] = useState<any[]>([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRatings, setEditRatings] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/team').then(res => {
      setTeams(res.data);
      if (res.data.length > 0) setSelectedTeam(res.data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedTeam) return;
    setLoading(true);
    api.get(`/team/${selectedTeam}/employees`)
      .then(res => setEmployees(res.data))
      .catch(() => setEmployees([]))
      .finally(() => setLoading(false));
  }, [selectedTeam]);

  const getScore = (emp: Employee, category: string) => {
    const rating = emp.ratings.find(r => r.category === category);
    return rating?.score || 0;
  };

  const getWeightedScore = (emp: Employee) => {
    return CATEGORIES.reduce((sum, cat) => sum + getScore(emp, cat.key) * cat.weight, 0).toFixed(1);
  };

  const startEditing = (emp: Employee) => {
    setEditingId(emp.id);
    const ratings: Record<string, number> = {};
    CATEGORIES.forEach(cat => {
      ratings[cat.key] = getScore(emp, cat.key) || 3;
    });
    setEditRatings(ratings);
  };

  const saveRatings = async () => {
    if (!editingId) return;
    try {
      await api.put(`/employees/${editingId}/rate`, {
        ratings: Object.entries(editRatings).map(([category, score]) => ({ category, score })),
      });
      setEditingId(null);
      // Reload
      const res = await api.get(`/team/${selectedTeam}/employees`);
      setEmployees(res.data);
    } catch {
      alert('שגיאה בשמירה');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">דירוג עובדים</h2>
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

      {loading ? (
        <div className="text-center py-10 text-gray-400">טוען...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-sm text-gray-500">
                <th className="p-3 text-right font-medium">עובד</th>
                <th className="p-3 text-right font-medium">תגיות</th>
                {CATEGORIES.map(cat => (
                  <th key={cat.key} className="p-3 text-center font-medium">{cat.label}</th>
                ))}
                <th className="p-3 text-center font-medium">ציון כולל</th>
                <th className="p-3 text-center font-medium w-24">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {employees.filter(e => e.ratings).map(emp => (
                <tr key={emp.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                        {emp.name.charAt(0)}
                      </div>
                      <span className="text-sm font-medium">{emp.name}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {emp.tags.slice(0, 3).map(t => (
                        <span key={t.tag} className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">
                          {TAG_LABELS[t.tag] || t.tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  {CATEGORIES.map(cat => (
                    <td key={cat.key} className="p-3 text-center">
                      {editingId === emp.id ? (
                        <div className="flex items-center justify-center gap-0.5">
                          {[1, 2, 3, 4, 5].map(star => (
                            <button
                              key={star}
                              onClick={() => setEditRatings(r => ({ ...r, [cat.key]: star }))}
                              className="focus:outline-none"
                            >
                              <Star
                                className={`w-4 h-4 ${star <= editRatings[cat.key] ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`}
                              />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-0.5">
                          {[1, 2, 3, 4, 5].map(star => (
                            <Star
                              key={star}
                              className={`w-3 h-3 ${star <= getScore(emp, cat.key) ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`}
                            />
                          ))}
                        </div>
                      )}
                    </td>
                  ))}
                  <td className="p-3 text-center">
                    <span className="text-lg font-bold text-blue-600">{getWeightedScore(emp)}</span>
                  </td>
                  <td className="p-3 text-center">
                    {editingId === emp.id ? (
                      <button
                        onClick={saveRatings}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700 mx-auto"
                      >
                        <Save className="w-3 h-3" />
                        שמור
                      </button>
                    ) : (
                      <button
                        onClick={() => startEditing(emp)}
                        className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs hover:bg-gray-200"
                      >
                        ערוך
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
