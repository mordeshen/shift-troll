import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { RefreshCw, Check, X, Clock, AlertCircle, Loader2 } from 'lucide-react';

interface SwapRequest {
  id: string;
  requesterId: string;
  requester: { id: string; name: string; teamId: string };
  assignmentId: string;
  covererId?: string;
  coverer?: { id: string; name: string };
  status: string;
  createdAt: string;
  resolvedAt?: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: 'ממתין למחליף', color: 'bg-yellow-100 text-yellow-800' },
  covered: { label: 'ממתין לאישור', color: 'bg-blue-100 text-blue-800' },
  approved: { label: 'אושר', color: 'bg-green-100 text-green-800' },
  rejected: { label: 'נדחה', color: 'bg-red-100 text-red-800' },
  cancelled: { label: 'בוטל', color: 'bg-gray-100 text-gray-800' },
};

export default function ManagerSwaps() {
  const [swaps, setSwaps] = useState<SwapRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadSwaps();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const loadSwaps = async () => {
    setLoading(true);
    try {
      const res = await api.get('/swaps');
      setSwaps(res.data);
    } catch {
      setSwaps([]);
    } finally {
      setLoading(false);
    }
  };

  const approveSwap = async (id: string) => {
    try {
      await api.post(`/swaps/${id}/approve`);
      loadSwaps();
    } catch (err: any) {
      setToast({ message: err.response?.data?.error || 'שגיאה באישור', type: 'error' });
    }
  };

  const rejectSwap = async (id: string) => {
    try {
      await api.post(`/swaps/${id}/reject`);
      loadSwaps();
    } catch (err: any) {
      setToast({ message: err.response?.data?.error || 'שגיאה בדחייה', type: 'error' });
    }
  };

  const filteredSwaps = filter === 'all' ? swaps : swaps.filter(s => s.status === filter);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">לוח החלפות</h2>
        <div className="flex items-center gap-2">
          {['all', 'open', 'covered', 'approved', 'rejected'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f === 'all' ? 'הכל' : STATUS_LABELS[f]?.label || f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400">
          <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin opacity-50" />
          <p>טוען בקשות...</p>
        </div>
      ) : filteredSwaps.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <RefreshCw className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>אין בקשות החלפה</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSwaps.map(swap => {
            const status = STATUS_LABELS[swap.status] || { label: swap.status, color: 'bg-gray-100 text-gray-800' };
            return (
              <div key={swap.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                        {swap.requester.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{swap.requester.name}</p>
                        <p className="text-xs text-gray-400">מבקש</p>
                      </div>
                    </div>

                    <RefreshCw className="w-4 h-4 text-gray-400" />

                    {swap.coverer ? (
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-sm">
                          {swap.coverer.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{swap.coverer.name}</p>
                          <p className="text-xs text-gray-400">מחליף</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-gray-400">
                        <Clock className="w-4 h-4" />
                        <span className="text-sm">ממתין למחליף</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${status.color}`}>
                      {status.label}
                    </span>

                    {swap.status === 'covered' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => approveSwap(swap.id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                        >
                          <Check className="w-4 h-4" />
                          אשר
                        </button>
                        <button
                          onClick={() => rejectSwap(swap.id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
                        >
                          <X className="w-4 h-4" />
                          דחה
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-xs text-gray-400 mt-2">
                  {new Date(swap.createdAt).toLocaleDateString('he-IL')} {new Date(swap.createdAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            );
          })}
        </div>
      )}
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg text-sm text-white z-50 ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}
    </div>
  );
}
