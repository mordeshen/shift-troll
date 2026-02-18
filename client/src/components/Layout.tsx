import { useState } from 'react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Calendar, Users, BarChart3, MessageSquare, Settings, Menu, X, Key, Check, AlertCircle } from 'lucide-react';
import api from '../utils/api';

const roleLabels: Record<string, string> = {
  employee: 'עובד',
  team_lead: 'ראש צוות',
  manager: 'מנהל',
  director: 'מנהל מנהלים',
};

interface NavItem {
  path: string;
  label: string;
  icon: typeof Calendar;
  section?: string;
}

const navByRole: Record<string, NavItem[]> = {
  employee: [
    { path: '/employee/chat', label: 'דיווח זמינות', icon: MessageSquare, section: 'עובד' },
    { path: '/employee/schedule', label: 'המשמרות שלי', icon: Calendar },
  ],
  team_lead: [
    { path: '/team-lead/employees', label: 'עובדי הצוות', icon: Users, section: 'ראש צוות' },
  ],
  manager: [
    { path: '/manager/schedule', label: 'לוח שיבוץ', icon: Calendar, section: 'מנהל' },
    { path: '/manager/conversation', label: 'שיחת הכנה', icon: MessageSquare },
    { path: '/manager/employees', label: 'ניהול עובדים', icon: Users },
    { path: '/manager/swaps', label: 'לוח החלפות', icon: Settings },
    { path: '/manager/ratings', label: 'דירוג עובדים', icon: BarChart3 },
    { path: '/manager/stats', label: 'סטטיסטיקות', icon: BarChart3 },
  ],
  director: [
    { path: '/director/dashboard', label: 'Dashboard', icon: BarChart3, section: 'הנהלה' },
    { path: '/director/manage-roles', label: 'ניהול תפקידים', icon: Settings },
  ],
};

function getNavItems(effectiveRoles: string[]): NavItem[] {
  const items: NavItem[] = [];
  const order = ['team_lead', 'manager', 'director', 'employee'];
  for (const role of order) {
    if (effectiveRoles.includes(role)) {
      items.push(...(navByRole[role] || []));
    }
  }
  return items;
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordToast, setPasswordToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleChangePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordToast({ message: 'הסיסמאות אינן תואמות', type: 'error' });
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setPasswordToast({ message: 'סיסמה חדשה חייבת להכיל לפחות 6 תווים', type: 'error' });
      return;
    }
    try {
      await api.put('/auth/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordToast({ message: 'הסיסמה שונתה בהצלחה', type: 'success' });
      setTimeout(() => {
        setShowPasswordChange(false);
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setPasswordToast(null);
      }, 1500);
    } catch (err: any) {
      setPasswordToast({ message: err.response?.data?.error || 'שגיאה בשינוי סיסמה', type: 'error' });
    }
  };

  const effectiveRoles = user?.effectiveRoles || [user?.role || ''];
  const navItems = getNavItems(effectiveRoles);
  const showCombinedLabel = user?.combinedRole;

  const navContent = (
    <ul className="py-4">
      {navItems.map((item, idx) => {
        const isActive = location.pathname === item.path;
        const showSection = item.section && effectiveRoles.length > 1;
        return (
          <li key={item.path}>
            {showSection && idx > 0 && (
              <div className="border-t border-gray-200 my-2" />
            )}
            {showSection && (
              <div className="px-6 pt-2 pb-1 text-xs font-semibold text-gray-400 uppercase">
                {item.section}
              </div>
            )}
            <Link
              to={item.path}
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-6 py-3 text-sm transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700 border-r-3 border-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Hamburger - mobile only */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-1.5 -mr-1.5 hover:bg-gray-100 rounded-lg"
              aria-label="תפריט"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <Calendar className="w-6 h-6 text-blue-600" />
            <h1 className="text-lg md:text-xl font-bold text-gray-900">מערכת משמרות</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 hidden sm:inline">
              {user?.name} — <span className="font-medium">{roleLabels[user?.role || '']}</span>
              {showCombinedLabel && <span className="text-blue-600 mr-1">(גישה מלאה)</span>}
            </span>
            <button
              onClick={() => setShowPasswordChange(true)}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-amber-600 transition-colors"
              aria-label="שינוי סיסמה"
              title="שינוי סיסמה"
            >
              <Key className="w-4 h-4" />
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600 transition-colors"
              aria-label="יציאה"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">יציאה</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Desktop Sidebar */}
        <nav className="hidden md:block w-56 bg-white border-l border-gray-200 min-h-[calc(100vh-57px)] shrink-0">
          {navContent}
        </nav>

        {/* Mobile Overlay */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setMobileMenuOpen(false)} />
            <nav className="absolute top-[57px] right-0 w-64 bg-white shadow-xl h-[calc(100vh-57px)] overflow-y-auto">
              {navContent}
            </nav>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-6 min-w-0">
          <Outlet />
        </main>
      </div>

      {/* Change Password Modal */}
      {showPasswordChange && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => { setShowPasswordChange(false); setPasswordToast(null); }}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm" dir="rtl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Key className="w-5 h-5 text-amber-600" />
              שינוי סיסמה
            </h3>

            {passwordToast && (
              <div className={`flex items-center gap-2 p-2.5 rounded-lg text-sm mb-3 ${
                passwordToast.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {passwordToast.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {passwordToast.message}
              </div>
            )}

            <div className="space-y-3">
              <input
                type="password"
                placeholder="סיסמה נוכחית"
                value={passwordForm.currentPassword}
                onChange={e => setPasswordForm(f => ({ ...f, currentPassword: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
              />
              <input
                type="password"
                placeholder="סיסמה חדשה (6+ תווים)"
                value={passwordForm.newPassword}
                onChange={e => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
              />
              <input
                type="password"
                placeholder="אימות סיסמה חדשה"
                value={passwordForm.confirmPassword}
                onChange={e => setPasswordForm(f => ({ ...f, confirmPassword: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleChangePassword}
                className="flex-1 bg-amber-600 text-white py-2 rounded-lg font-medium hover:bg-amber-700 transition-colors text-sm"
              >
                שנה סיסמה
              </button>
              <button
                onClick={() => { setShowPasswordChange(false); setPasswordToast(null); }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
