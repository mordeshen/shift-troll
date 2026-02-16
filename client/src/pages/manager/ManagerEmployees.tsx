import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { Search, Check, AlertCircle, Plus, Pencil, Save, X, Copy, Users, UserPlus } from 'lucide-react';

interface Team {
  id: string;
  name: string;
}

interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  birthYear: number | null;
  seniority: number;
  teamId: string | null;
  teamName: string | null;
}

export default function ManagerEmployees() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamEmployees, setTeamEmployees] = useState<Employee[]>([]);
  const [unassignedEmployees, setUnassignedEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'team' | 'unassigned'>('team');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ name: '', phone: '', birthYear: '', seniority: '' });
  const [showCreate, setShowCreate] = useState(false);
  const [createData, setCreateData] = useState({ name: '', email: '', password: '', phone: '', birthYear: '', seniority: '', teamId: '' });
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const loadData = async () => {
    try {
      const res = await api.get('/manage/employees/for-manager');
      setTeams(res.data.teams);
      setTeamEmployees(res.data.teamEmployees);
      setUnassignedEmployees(res.data.unassignedEmployees);
    } catch {
      setToast({ message: 'שגיאה בטעינת עובדים', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (emp: Employee) => {
    setEditingId(emp.id);
    setEditData({
      name: emp.name,
      phone: emp.phone || '',
      birthYear: emp.birthYear?.toString() || '',
      seniority: emp.seniority.toString(),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (id: string) => {
    try {
      const res = await api.put(`/manage/employees/${id}/details`, editData);
      const updated = res.data;
      setTeamEmployees(prev => prev.map(e => e.id === id ? updated : e));
      setUnassignedEmployees(prev => prev.map(e => e.id === id ? updated : e));
      setEditingId(null);
      setToast({ message: 'עודכן בהצלחה', type: 'success' });
    } catch {
      setToast({ message: 'שגיאה בעדכון', type: 'error' });
    }
  };

  const assignToTeam = async (employeeId: string, teamId: string) => {
    try {
      const res = await api.put(`/manage/employees/${employeeId}/assign`, { teamId });
      const updated = res.data;
      setUnassignedEmployees(prev => prev.filter(e => e.id !== employeeId));
      setTeamEmployees(prev => [...prev, updated]);
      setToast({ message: 'עובד שויך לצוות בהצלחה', type: 'success' });
    } catch {
      setToast({ message: 'שגיאה בשיוך לצוות', type: 'error' });
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await api.post('/manage/employees/create', createData);
      const newEmp = res.data;
      if (newEmp.teamId) {
        setTeamEmployees(prev => [...prev, newEmp]);
      } else {
        setUnassignedEmployees(prev => [...prev, newEmp]);
      }
      setShowCreate(false);
      setCreateData({ name: '', email: '', password: '', phone: '', birthYear: '', seniority: '', teamId: '' });
      setToast({ message: 'עובד נוצר בהצלחה', type: 'success' });
    } catch (err: any) {
      setToast({ message: err.response?.data?.error || 'שגיאה ביצירת עובד', type: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const copyLink = () => {
    const url = `${window.location.origin}/register`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentList = tab === 'team' ? teamEmployees : unassignedEmployees;
  const filtered = currentList.filter(emp =>
    emp.name.includes(search) || emp.email.includes(search)
  );

  return (
    <div>
      {/* Registration Link Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-blue-800">לינק הרשמה לעובדים חדשים</p>
          <p className="text-xs text-blue-600 mt-0.5 font-mono">{window.location.origin}/register</p>
        </div>
        <button
          onClick={copyLink}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
        >
          <Copy className="w-3.5 h-3.5" />
          {copied ? 'הועתק!' : 'העתק'}
        </button>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">ניהול עובדים</h2>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="חיפוש לפי שם..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pr-9 pl-3 py-1.5 border border-gray-200 rounded-lg text-sm w-56"
            />
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            הוסף עובד
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('team')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm transition-colors ${
            tab === 'team' ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users className="w-4 h-4" />
          בצוותים שלי ({teamEmployees.length})
        </button>
        <button
          onClick={() => setTab('unassigned')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm transition-colors ${
            tab === 'unassigned' ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <UserPlus className="w-4 h-4" />
          ללא צוות ({unassignedEmployees.length})
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-10 text-gray-400">טוען...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-sm text-gray-500">
                <th className="p-3 text-right font-medium">שם</th>
                <th className="p-3 text-right font-medium">אימייל</th>
                <th className="p-3 text-right font-medium">טלפון</th>
                <th className="p-3 text-right font-medium">שנת לידה</th>
                <th className="p-3 text-right font-medium">ותק</th>
                {tab === 'team' && <th className="p-3 text-right font-medium">צוות</th>}
                <th className="p-3 text-center font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(emp => (
                <tr key={emp.id} className="border-t border-gray-100 hover:bg-gray-50">
                  {editingId === emp.id ? (
                    <>
                      <td className="p-3">
                        <input
                          value={editData.name}
                          onChange={e => setEditData(d => ({ ...d, name: e.target.value }))}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </td>
                      <td className="p-3 text-sm text-gray-600">{emp.email}</td>
                      <td className="p-3">
                        <input
                          value={editData.phone}
                          onChange={e => setEditData(d => ({ ...d, phone: e.target.value }))}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          placeholder="—"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="number"
                          value={editData.birthYear}
                          onChange={e => setEditData(d => ({ ...d, birthYear: e.target.value }))}
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                          placeholder="—"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="number"
                          value={editData.seniority}
                          onChange={e => setEditData(d => ({ ...d, seniority: e.target.value }))}
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </td>
                      {tab === 'team' && <td className="p-3 text-sm text-gray-600">{emp.teamName || '—'}</td>}
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => saveEdit(emp.id)} className="p-1 text-green-600 hover:bg-green-50 rounded">
                            <Save className="w-4 h-4" />
                          </button>
                          <button onClick={cancelEdit} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                            {emp.name.charAt(0)}
                          </div>
                          <span className="text-sm font-medium">{emp.name}</span>
                        </div>
                      </td>
                      <td className="p-3 text-sm text-gray-600">{emp.email}</td>
                      <td className="p-3 text-sm text-gray-600">{emp.phone || '—'}</td>
                      <td className="p-3 text-sm text-gray-600">{emp.birthYear || '—'}</td>
                      <td className="p-3 text-sm text-gray-600">{emp.seniority} חודשים</td>
                      {tab === 'team' && <td className="p-3 text-sm text-gray-600">{emp.teamName || '—'}</td>}
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => startEdit(emp)} className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="עריכה">
                            <Pencil className="w-4 h-4" />
                          </button>
                          {tab === 'unassigned' && teams.length > 0 && (
                            <select
                              defaultValue=""
                              onChange={e => { if (e.target.value) assignToTeam(emp.id, e.target.value); }}
                              className="px-2 py-1 border border-gray-200 rounded text-xs bg-white"
                            >
                              <option value="" disabled>שייך לצוות</option>
                              {teams.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={tab === 'team' ? 7 : 6} className="p-6 text-center text-gray-400 text-sm">
                    {search ? 'לא נמצאו תוצאות' : tab === 'unassigned' ? 'אין עובדים ללא צוות' : 'אין עובדים בצוותים שלך'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Employee Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md" dir="rtl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-green-600" />
              הוספת עובד חדש
            </h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <input
                type="text"
                placeholder="שם מלא *"
                value={createData.name}
                onChange={e => setCreateData(d => ({ ...d, name: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
              />
              <input
                type="email"
                placeholder="אימייל *"
                value={createData.email}
                onChange={e => setCreateData(d => ({ ...d, email: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
              />
              <input
                type="password"
                placeholder="סיסמה (6+ תווים) *"
                value={createData.password}
                onChange={e => setCreateData(d => ({ ...d, password: e.target.value }))}
                required
                minLength={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="tel"
                  placeholder="טלפון"
                  value={createData.phone}
                  onChange={e => setCreateData(d => ({ ...d, phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
                <input
                  type="number"
                  placeholder="שנת לידה"
                  value={createData.birthYear}
                  onChange={e => setCreateData(d => ({ ...d, birthYear: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  placeholder="ותק (חודשים)"
                  value={createData.seniority}
                  onChange={e => setCreateData(d => ({ ...d, seniority: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
                <select
                  value={createData.teamId}
                  onChange={e => setCreateData(d => ({ ...d, teamId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                >
                  <option value="">ללא צוות</option>
                  {teams.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 bg-green-600 text-white py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-colors text-sm"
                >
                  {creating ? 'יוצר...' : 'צור עובד'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors"
                >
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-6 flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg text-sm text-white ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}
    </div>
  );
}
