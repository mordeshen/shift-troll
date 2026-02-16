import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Calendar, Users, BarChart3, MessageSquare, Settings } from 'lucide-react';

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

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const effectiveRoles = user?.effectiveRoles || [user?.role || ''];
  const navItems = getNavItems(effectiveRoles);
  const showCombinedLabel = user?.combinedRole;

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-bold text-gray-900">מערכת משמרות</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              {user?.name} — <span className="font-medium">{roleLabels[user?.role || '']}</span>
              {showCombinedLabel && <span className="text-blue-600 mr-1">(גישה מלאה)</span>}
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              יציאה
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <nav className="w-56 bg-white border-l border-gray-200 min-h-[calc(100vh-57px)]">
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
                    className={`flex items-center gap-3 px-6 py-3 text-sm transition-colors ${
                      isActive
                        ? 'bg-blue-50 text-blue-700 border-l-3 border-blue-700 font-medium'
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
        </nav>

        {/* Main Content */}
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
