import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { Search, Check, AlertCircle } from 'lucide-react';

interface Employee {
  id: string;
  name: string;
  email: string;
  role: string;
  combinedRole: boolean;
  teamId: string | null;
  teamName: string | null;
}

const ROLES = [
  { value: 'employee', label: 'עובד' },
  { value: 'team_lead', label: 'ראש צוות' },
  { value: 'manager', label: 'מנהל' },
  { value: 'director', label: 'מנהל מנהלים' },
];

export default function ManageRoles() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadEmployees();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const loadEmployees = async () => {
    try {
      const res = await api.get('/manage/employees');
      setEmployees(res.data);
    } catch {
      setToast({ message: 'שגיאה בטעינת עובדים', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const updateRole = async (id: string, field: 'role' | 'combinedRole', value: string | boolean) => {
    try {
      const res = await api.put(`/manage/employees/${id}/role`, { [field]: value });
      setEmployees(prev => prev.map(emp => emp.id === id ? res.data : emp));
      setToast({ message: 'עודכן בהצלחה', type: 'success' });
    } catch {
      setToast({ message: 'שגיאה בעדכון', type: 'error' });
    }
  };

  const filtered = employees.filter(emp =>
    emp.name.includes(search) || emp.email.includes(search)
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">ניהול תפקידים</h2>
        <div className="relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="חיפוש לפי שם..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pr-9 pl-3 py-1.5 border border-gray-200 rounded-lg text-sm w-64"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400">טוען...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-sm text-gray-500">
                <th className="p-3 text-right font-medium">עובד</th>
                <th className="p-3 text-right font-medium">אימייל</th>
                <th className="p-3 text-right font-medium">צוות</th>
                <th className="p-3 text-center font-medium">תפקיד</th>
                <th className="p-3 text-center font-medium">גישה מלאה</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(emp => (
                <tr key={emp.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                        {emp.name.charAt(0)}
                      </div>
                      <span className="text-sm font-medium">{emp.name}</span>
                    </div>
                  </td>
                  <td className="p-3 text-sm text-gray-600">{emp.email}</td>
                  <td className="p-3 text-sm text-gray-600">{emp.teamName || '—'}</td>
                  <td className="p-3 text-center">
                    <select
                      value={emp.role}
                      onChange={e => updateRole(emp.id, 'role', e.target.value)}
                      className="px-2 py-1 border border-gray-200 rounded-lg text-sm bg-white"
                    >
                      {ROLES.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => updateRole(emp.id, 'combinedRole', !emp.combinedRole)}
                      className={`w-10 h-5 rounded-full relative transition-colors ${
                        emp.combinedRole ? 'bg-blue-600' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                          emp.combinedRole ? 'left-0.5' : 'left-[22px]'
                        }`}
                      />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-gray-400 text-sm">
                    לא נמצאו עובדים
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
