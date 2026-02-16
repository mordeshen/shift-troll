import { useState, useEffect, useCallback } from 'react';
import { Shield, Plus, Check, AlertCircle, LogOut } from 'lucide-react';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

interface Manager {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

const API_BASE = '/api/admin';

async function adminFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('adminToken');
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'שגיאה');
  }
  return res.json();
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (el: HTMLElement, config: any) => void;
        };
      };
    };
  }
}

export default function Admin() {
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);

  // Check existing session
  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    const savedEmail = localStorage.getItem('adminEmail');
    if (token && savedEmail) {
      setAdminEmail(savedEmail);
    }
  }, []);

  // Load managers when authenticated
  useEffect(() => {
    if (adminEmail) loadManagers();
  }, [adminEmail]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleGoogleResponse = useCallback(async (response: any) => {
    setLoading(true);
    try {
      const data = await adminFetch('/google-login', {
        method: 'POST',
        body: JSON.stringify({ credential: response.credential }),
      });
      localStorage.setItem('adminToken', data.token);
      localStorage.setItem('adminEmail', data.email);
      setAdminEmail(data.email);
    } catch (err: any) {
      setToast({ message: err.message || 'שגיאה בהתחברות', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize Google Sign-In
  useEffect(() => {
    if (adminEmail || !GOOGLE_CLIENT_ID) return;

    const initGoogle = () => {
      if (!window.google) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleResponse,
      });
      const btnEl = document.getElementById('google-signin-btn');
      if (btnEl) {
        window.google.accounts.id.renderButton(btnEl, {
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          width: 300,
        });
      }
    };

    // Google script might already be loaded
    if (window.google) {
      initGoogle();
    } else {
      const interval = setInterval(() => {
        if (window.google) {
          clearInterval(interval);
          initGoogle();
        }
      }, 200);
      return () => clearInterval(interval);
    }
  }, [adminEmail, handleGoogleResponse]);

  const loadManagers = async () => {
    try {
      const data = await adminFetch('/managers');
      setManagers(data);
    } catch {
      setToast({ message: 'שגיאה בטעינת מנהלים', type: 'error' });
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await adminFetch('/managers', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      });
      setToast({ message: 'מנהל נוצר בהצלחה', type: 'success' });
      setName('');
      setEmail('');
      setPassword('');
      loadManagers();
    } catch (err: any) {
      setToast({ message: err.message || 'שגיאה ביצירת מנהל', type: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminEmail');
    setAdminEmail(null);
    setManagers([]);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-indigo-100" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-100 rounded-full mb-4">
            <Shield className="w-8 h-8 text-purple-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">פאנל אדמין</h1>
          <p className="text-gray-500 mt-2">ניהול מנהלים במערכת</p>
        </div>

        {!adminEmail ? (
          <div className="text-center">
            {loading ? (
              <p className="text-gray-400">מתחבר...</p>
            ) : !GOOGLE_CLIENT_ID ? (
              <p className="text-red-500 text-sm">חסר VITE_GOOGLE_CLIENT_ID בהגדרות</p>
            ) : (
              <div className="flex justify-center">
                <div id="google-signin-btn" />
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6 text-sm text-gray-500">
              <span>מחובר כ: <strong>{adminEmail}</strong></span>
              <button onClick={handleLogout} className="flex items-center gap-1 text-gray-400 hover:text-red-500 transition-colors">
                <LogOut className="w-4 h-4" />
                יציאה
              </button>
            </div>

            {/* Create Manager Form */}
            <form onSubmit={handleCreate} className="space-y-4 mb-8 p-4 bg-purple-50 rounded-xl">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <Plus className="w-4 h-4" />
                יצירת מנהל חדש
              </h3>
              <input
                type="text"
                placeholder="שם מלא"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
              />
              <input
                type="email"
                placeholder="אימייל"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
              />
              <input
                type="password"
                placeholder="סיסמה (6+ תווים)"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
              />
              <button
                type="submit"
                disabled={creating}
                className="w-full bg-purple-600 text-white py-2 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors text-sm"
              >
                {creating ? 'יוצר...' : 'צור מנהל'}
              </button>
            </form>

            {/* Managers List */}
            <div>
              <h3 className="font-semibold text-gray-800 mb-3">מנהלים קיימים ({managers.length})</h3>
              {managers.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">אין מנהלים עדיין</p>
              ) : (
                <div className="space-y-2">
                  {managers.map(m => (
                    <div key={m.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-sm">
                        {m.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                        <p className="text-xs text-gray-500 truncate">{m.email}</p>
                      </div>
                      <span className="text-xs text-gray-400">
                        {new Date(m.createdAt).toLocaleDateString('he-IL')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

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
