import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import EmployeeChat from './pages/employee/EmployeeChat';
import EmployeeSchedule from './pages/employee/EmployeeSchedule';
import TeamLeadEmployees from './pages/teamlead/TeamLeadEmployees';
import ManagerSchedule from './pages/manager/ManagerSchedule';
import ManagerSwaps from './pages/manager/ManagerSwaps';
import ManagerRatings from './pages/manager/ManagerRatings';
import ManagerStats from './pages/manager/ManagerStats';
import DirectorDashboard from './pages/director/DirectorDashboard';

function RoleRedirect() {
  const { user, loading } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">טוען...</div>;
  if (!user) return <Navigate to="/login" />;

  switch (user.role) {
    case 'employee': return <Navigate to="/employee/chat" />;
    case 'team_lead': return <Navigate to="/team-lead/employees" />;
    case 'manager': return <Navigate to="/manager/schedule" />;
    case 'director': return <Navigate to="/director/dashboard" />;
    default: return <Navigate to="/login" />;
  }
}

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles: string[] }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">טוען...</div>;
  if (!user) return <Navigate to="/login" />;
  if (!roles.includes(user.role)) return <Navigate to="/" />;

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RoleRedirect />} />

          {/* Employee Routes */}
          <Route element={<ProtectedRoute roles={['employee']}><Layout /></ProtectedRoute>}>
            <Route path="/employee/chat" element={<EmployeeChat />} />
            <Route path="/employee/schedule" element={<EmployeeSchedule />} />
          </Route>

          {/* Team Lead Routes */}
          <Route element={<ProtectedRoute roles={['team_lead']}><Layout /></ProtectedRoute>}>
            <Route path="/team-lead/employees" element={<TeamLeadEmployees />} />
          </Route>

          {/* Manager Routes */}
          <Route element={<ProtectedRoute roles={['manager']}><Layout /></ProtectedRoute>}>
            <Route path="/manager/schedule" element={<ManagerSchedule />} />
            <Route path="/manager/swaps" element={<ManagerSwaps />} />
            <Route path="/manager/ratings" element={<ManagerRatings />} />
            <Route path="/manager/stats" element={<ManagerStats />} />
          </Route>

          {/* Director Routes */}
          <Route element={<ProtectedRoute roles={['director']}><Layout /></ProtectedRoute>}>
            <Route path="/director/dashboard" element={<DirectorDashboard />} />
          </Route>

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
