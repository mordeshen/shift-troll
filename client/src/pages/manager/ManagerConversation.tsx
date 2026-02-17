import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../utils/api';
import {
  Send, Check, AlertCircle, Loader2, MessageSquare,
  ChevronRight, ChevronLeft, ArrowLeft, CheckCircle2,
  Shield, Lightbulb, Users, Flame
} from 'lucide-react';

interface ConversationConstraint {
  id: string;
  type: 'hard' | 'soft' | 'opportunity';
  category: string;
  description: string;
  affectedEmployees: string[];
  affectedEmployeeNames?: string[];
  parameters: any;
  reasoning: string;
  priority: number;
  approved: boolean;
}

interface Conversation {
  id: string;
  managerId: string;
  teamId: string;
  weekStart: string;
  type: string;
  messages: { role: string; content: string }[];
  status: string;
  constraints: ConversationConstraint[];
  extractedInsights: any;
}

const categoryLabels: Record<string, string> = {
  separation: 'הפרדה',
  workload: 'עומס עבודה',
  development: 'פיתוח',
  pairing: 'שיבוץ משותף',
  utilization: 'ניצול מוטיבציה',
  burnout: 'שחיקה',
};

const categoryIcons: Record<string, typeof Shield> = {
  separation: Users,
  workload: Flame,
  development: Lightbulb,
  pairing: Users,
  utilization: Lightbulb,
  burnout: Flame,
};

const typeColors: Record<string, string> = {
  hard: 'bg-red-50 border-red-200 text-red-800',
  soft: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  opportunity: 'bg-green-50 border-green-200 text-green-800',
};

const typeLabels: Record<string, string> = {
  hard: 'חובה',
  soft: 'עדיפות',
  opportunity: 'הזדמנות',
};

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function getWeekStart(offset: number): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day + offset * 7);
  return d.toISOString().split('T')[0];
}

export default function ManagerConversation() {
  useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const conversationType = searchParams.get('type') || 'preparation';

  const [teams, setTeams] = useState<any[]>([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [weekOffset, setWeekOffset] = useState(1);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const weekStart = getWeekStart(weekOffset);
  const days: { date: string; display: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    days.push({
      date: d.toISOString().split('T')[0],
      display: `${DAY_NAMES[i]} ${d.getDate()}/${d.getMonth() + 1}`,
    });
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    api.get('/team').then(res => {
      setTeams(res.data);
      if (res.data.length > 0) setSelectedTeam(res.data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedTeam) return;
    checkExistingConversation();
  }, [selectedTeam, weekStart, conversationType]);

  const checkExistingConversation = async () => {
    try {
      const res = await api.get(`/conversations/week/${weekStart}/${selectedTeam}?type=${conversationType}`);
      if (res.data) {
        setConversation(res.data);
        if (res.data.status === 'completed') {
          setShowSummary(true);
        }
      } else {
        setConversation(null);
        setShowSummary(false);
      }
    } catch {
      setConversation(null);
    }
  };

  const startConversation = async () => {
    setLoading(true);
    try {
      const res = await api.post('/conversations', {
        weekStart,
        teamId: selectedTeam,
        type: conversationType,
      });
      setConversation(res.data);
      setShowSummary(false);
    } catch (err: any) {
      setToast({ message: err.response?.data?.error || 'שגיאה בתחילת שיחה', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || sending || !conversation) return;

    const msg = input.trim();
    setInput('');
    setSending(true);

    try {
      const res = await api.post(`/conversations/${conversation.id}/message`, { message: msg });
      setConversation(res.data);
    } catch (err: any) {
      setToast({ message: err.response?.data?.error || 'שגיאה בשליחת הודעה', type: 'error' });
    } finally {
      setSending(false);
    }
  };

  const toggleConstraint = async (constraintId: string, approved: boolean) => {
    try {
      await api.put(`/conversations/constraints/${constraintId}`, { approved });
      // Update local state
      if (conversation) {
        setConversation({
          ...conversation,
          constraints: conversation.constraints.map(c =>
            c.id === constraintId ? { ...c, approved } : c
          ),
        });
      }
    } catch (err: any) {
      setToast({ message: 'שגיאה בעדכון שיקול', type: 'error' });
    }
  };

  const completeConversation = async () => {
    if (!conversation) return;
    setLoading(true);
    try {
      const res = await api.post(`/conversations/${conversation.id}/complete`);
      setConversation(res.data);
      setShowSummary(true);
      setToast({ message: 'השיחה הסתיימה! אפשר לייצר סידור.', type: 'success' });
    } catch (err: any) {
      setToast({ message: 'שגיאה בסיום השיחה', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const goToSchedule = () => {
    navigate('/manager/schedule');
  };

  const approvedCount = conversation?.constraints.filter(c => c.approved).length || 0;
  const totalConstraints = conversation?.constraints.length || 0;

  // No conversation started yet — welcome screen
  if (!conversation) {
    return (
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold">
              {conversationType === 'retrospective' ? 'סיכום שבועי' : 'שיחת הכנה'}
            </h2>
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
          <div className="flex items-center gap-2">
            <button onClick={() => setWeekOffset(w => w + 1)} className="p-2 hover:bg-gray-100 rounded-lg">
              <ChevronRight className="w-5 h-5" />
            </button>
            <span className="text-sm font-medium px-2">{days[0].display} — {days[6].display}</span>
            <button onClick={() => setWeekOffset(w => w - 1)} className="p-2 hover:bg-gray-100 rounded-lg">
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
            <MessageSquare className="w-8 h-8 text-blue-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">
            {conversationType === 'retrospective'
              ? 'בוא נסכם את השבוע'
              : 'בוא נתכונן לשבוע הבא'}
          </h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            {conversationType === 'retrospective'
              ? 'נדבר על מה שקרה השבוע — מה עבד, מה צריך שיפור, ומה נלמד לשבוע הבא.'
              : 'שיחה קצרה על הצוות שלך — מה קורה, מה צריך תשומת לב, ואיך לשבץ חכם יותר.'}
          </p>
          <button
            onClick={startConversation}
            disabled={loading || !selectedTeam}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                מתחיל...
              </span>
            ) : (
              'התחל שיחה'
            )}
          </button>
        </div>
      </div>
    );
  }

  // Summary view after completion
  if (showSummary && conversation.status === 'completed') {
    const approvedConstraints = conversation.constraints.filter(c => c.approved);
    const hard = approvedConstraints.filter(c => c.type === 'hard');
    const soft = approvedConstraints.filter(c => c.type === 'soft');
    const opportunities = approvedConstraints.filter(c => c.type === 'opportunity');

    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">סיכום שיחה</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowSummary(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              צפה בשיחה
            </button>
            <button
              onClick={goToSchedule}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
            >
              <ArrowLeft className="w-4 h-4" />
              לייצור סידור
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {hard.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <h3 className="font-bold text-red-800 mb-3 flex items-center gap-2">
                <Shield className="w-5 h-5" />
                חובה ({hard.length})
              </h3>
              <ul className="space-y-2">
                {hard.map(c => (
                  <li key={c.id} className="text-sm text-red-700">
                    <span className="font-medium">{c.description}</span>
                    {c.affectedEmployeeNames && (
                      <span className="text-red-500 mr-1">({c.affectedEmployeeNames.join(', ')})</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {soft.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <h3 className="font-bold text-yellow-800 mb-3 flex items-center gap-2">
                <Lightbulb className="w-5 h-5" />
                עדיפות ({soft.length})
              </h3>
              <ul className="space-y-2">
                {soft.map(c => (
                  <li key={c.id} className="text-sm text-yellow-700">
                    <span className="font-medium">{c.description}</span>
                    {c.affectedEmployeeNames && (
                      <span className="text-yellow-500 mr-1">({c.affectedEmployeeNames.join(', ')})</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {opportunities.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <h3 className="font-bold text-green-800 mb-3 flex items-center gap-2">
                <Lightbulb className="w-5 h-5" />
                הזדמנויות ({opportunities.length})
              </h3>
              <ul className="space-y-2">
                {opportunities.map(c => (
                  <li key={c.id} className="text-sm text-green-700">
                    <span className="font-medium">{c.description}</span>
                    {c.affectedEmployeeNames && (
                      <span className="text-green-500 mr-1">({c.affectedEmployeeNames.join(', ')})</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {approvedConstraints.length === 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center text-gray-500">
              לא אושרו שיקולים מהשיחה. הסידור ייווצר לפי האילוצים הרגילים.
            </div>
          )}
        </div>
      </div>
    );
  }

  // Active conversation
  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold">
            {conversationType === 'retrospective' ? 'סיכום שבועי' : 'שיחת הכנה'}
          </h2>
          <span className="text-sm text-gray-500">{days[0].display} — {days[6].display}</span>
        </div>
        <div className="flex items-center gap-2">
          {totalConstraints > 0 && (
            <span className="text-sm text-gray-500">
              {approvedCount}/{totalConstraints} שיקולים מאושרים
            </span>
          )}
          <button
            onClick={completeConversation}
            disabled={loading || conversation.status === 'completed'}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            {loading ? 'מסיים...' : 'סיים שיחה'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chat Panel */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col" style={{ height: '70vh' }}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {(conversation.messages || []).map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-bl-md'
                    : 'bg-gray-100 text-gray-800 rounded-br-md'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-2xl rounded-br-md px-4 py-3">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-100">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="כתוב הודעה..."
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                disabled={sending || conversation.status === 'completed'}
              />
              <button
                onClick={sendMessage}
                disabled={sending || !input.trim() || conversation.status === 'completed'}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Constraints Panel */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col" style={{ maxHeight: '70vh' }}>
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-bold text-gray-700">שיקולי שיבוץ</h3>
            <p className="text-xs text-gray-400 mt-1">אשר או דחה כל שיקול</p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {totalConstraints === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                <Lightbulb className="w-8 h-8 mx-auto mb-2 opacity-40" />
                שיקולים יופיעו כאן במהלך השיחה
              </div>
            ) : (
              conversation.constraints.map(c => {
                const Icon = categoryIcons[c.category] || Lightbulb;
                return (
                  <div
                    key={c.id}
                    className={`rounded-lg border p-3 transition-all ${
                      c.approved
                        ? typeColors[c.type]
                        : 'bg-gray-50 border-gray-200 text-gray-500'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="text-xs font-bold">
                          {typeLabels[c.type]} — {categoryLabels[c.category] || c.category}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => toggleConstraint(c.id, !c.approved)}
                          className={`p-1 rounded transition-colors ${
                            c.approved
                              ? 'bg-green-200 text-green-700 hover:bg-green-300'
                              : 'bg-gray-200 text-gray-500 hover:bg-green-100 hover:text-green-600'
                          }`}
                          title={c.approved ? 'מאושר' : 'אשר'}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs leading-relaxed">{c.description}</p>
                    {c.affectedEmployeeNames && c.affectedEmployeeNames.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {c.affectedEmployeeNames.map((name, i) => (
                          <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/60 border border-current/20">
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                    {c.reasoning && (
                      <p className="text-[10px] mt-1 opacity-70">{c.reasoning}</p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

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
