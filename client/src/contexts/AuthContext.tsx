import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import api from '../utils/api';

const ALL_ROLES = ['team_lead', 'manager', 'director', 'employee'] as const;

interface User {
  id: string;
  name: string;
  email: string;
  role: 'employee' | 'team_lead' | 'manager' | 'director';
  teamId?: string;
  swapPoints: number;
  combinedRole: boolean;
  effectiveRoles: string[];
}

function computeEffectiveRoles(role: string, combinedRole: boolean): string[] {
  return combinedRole ? [...ALL_ROLES] : [role];
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  setSession: (token: string, userData: any) => void;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      api.get('/auth/me')
        .then(res => {
          const data = res.data;
          setUser({
            ...data,
            combinedRole: data.combinedRole ?? false,
            effectiveRoles: computeEffectiveRoles(data.role, data.combinedRole ?? false),
          });
        })
        .catch(() => {
          localStorage.removeItem('token');
          setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', res.data.token);
    setToken(res.data.token);
    const u = res.data.user;
    setUser({
      ...u,
      combinedRole: u.combinedRole ?? false,
      effectiveRoles: computeEffectiveRoles(u.role, u.combinedRole ?? false),
    });
  };

  const setSession = (newToken: string, userData: any) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser({
      ...userData,
      combinedRole: userData.combinedRole ?? false,
      effectiveRoles: computeEffectiveRoles(userData.role, userData.combinedRole ?? false),
    });
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, setSession, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
