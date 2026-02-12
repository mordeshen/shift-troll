import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';
import { Send, Check, Trash2, ChevronDown, Star } from 'lucide-react';

interface Constraint {
  date: string;
  type: 'hard' | 'soft';
  availability: string;
  reason: string;
  original_text: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const availabilityLabels: Record<string, string> = {
  unavailable: 'לא זמין',
  morning_only: 'בוקר בלבד',
  evening_only: 'ערב בלבד',
  night_only: 'לילה בלבד',
  available: 'זמין',
  available_extra: 'זמין גם (נוסף)',
};

const availabilityColors: Record<string, string> = {
  unavailable: 'bg-red-50 border-red-200',
  morning_only: 'bg-yellow-50 border-yellow-200',
  evening_only: 'bg-orange-50 border-orange-200',
  night_only: 'bg-purple-50 border-purple-200',
  available: 'bg-green-50 border-green-200',
  available_extra: 'bg-blue-50 border-blue-200',
};

function getNextSunday(): string {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
  const nextSunday = new Date(today);
  nextSunday.setDate(today.getDate() + daysUntilSunday);
  return nextSunday.toISOString().split('T')[0];
}

function getWeekDays(sundayStr: string) {
  const sunday = new Date(sundayStr);
  const days = [];
  const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(d.getDate() + i);
    days.push({
      date: d.toISOString().split('T')[0],
      name: dayNames[i],
      display: `${dayNames[i]} ${d.getDate()}/${d.getMonth() + 1}`,
    });
  }
  return days;
}

export default function EmployeeChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [displayMessages, setDisplayMessages] = useState<{ role: string; text: string }[]>([]);
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const weekStart = getNextSunday();
  const weekDays = getWeekDays(weekStart);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setDisplayMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setLoading(true);
    setConfirmed(false);

    try {
      const res = await api.post('/constraints/chat', {
        messages: newMessages,
        weekStart,
      });

      const { message, constraints: newConstraints } = res.data;

      setMessages(prev => [...prev, { role: 'assistant', content: JSON.stringify(res.data) }]);
      setDisplayMessages(prev => [...prev, { role: 'assistant', text: message }]);
      setConstraints(newConstraints || []);
    } catch (err: any) {
      setDisplayMessages(prev => [...prev, {
        role: 'assistant',
        text: 'מצטער, יש שגיאה. נסה שוב.',
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (constraints.length === 0) return;
    setLoading(true);

    try {
      await api.post('/constraints/confirm', {
        constraints,
        weekStart,
      });
      setSubmitted(true);
    } catch (err) {
      alert('שגיאה בשליחה. נסה שוב.');
    } finally {
      setLoading(false);
    }
  };

  const updateConstraint = (index: number, field: string, value: string) => {
    setConstraints(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
    setConfirmed(false);
  };

  const removeConstraint = (index: number) => {
    setConstraints(prev => prev.filter((_, i) => i !== index));
    setConfirmed(false);
  };

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6">
          <Check className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">האילוצים נשלחו בהצלחה!</h2>
        <p className="text-gray-500 mb-6">האילוצים שלך נשמרו והועברו לסידור העבודה.</p>
        <button
          onClick={() => { setSubmitted(false); setMessages([]); setDisplayMessages([]); setConstraints([]); setConfirmed(false); }}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          שלח שוב לשבוע אחר
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Swap Points Badge */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">דיווח זמינות — שבוע {weekDays[0].display} עד {weekDays[6].display}</h2>
        <div className="relative group">
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-full px-4 py-2">
            <Star className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-medium text-amber-700">{user?.swapPoints || 0} נקודות חילוף</span>
          </div>
          <div className="absolute left-0 top-full mt-2 w-64 bg-gray-900 text-white text-xs p-3 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
            הנקודות מזכות אותך בעדיפות כשתצטרך החלפה
          </div>
        </div>
      </div>

      {/* Chat Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-medium text-gray-700">ספר לי על הזמינות שלך השבוע</h3>
        </div>

        <div className="h-80 overflow-y-auto p-4 space-y-3">
          {displayMessages.length === 0 && (
            <div className="text-center text-gray-400 py-10">
              <p className="text-lg mb-2">כתוב בשפה חופשית את הזמינות שלך</p>
              <p className="text-sm">למשל: "ביום שני אני במילואים, יום שלישי רק ערב, וחמישי עדיף שלא"</p>
            </div>
          )}
          {displayMessages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-md'
                  : 'bg-gray-100 text-gray-800 rounded-bl-md'
              }`}>
                {msg.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-end">
              <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
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

        <div className="p-4 border-t border-gray-100">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="כתוב את הזמינות שלך..."
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Constraints Cards */}
      {(constraints.length > 0 || displayMessages.length > 0) && (
        <div className="mb-6">
          <h3 className="font-bold text-lg mb-4">אילוצים לשבוע</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {weekDays.map(day => {
              const constraint = constraints.find(c => c.date === day.date);
              const isConstrained = !!constraint;

              return (
                <div
                  key={day.date}
                  className={`rounded-xl border p-4 transition-all ${
                    isConstrained
                      ? availabilityColors[constraint.availability] || 'bg-gray-50 border-gray-200'
                      : 'bg-green-50 border-green-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{day.display}</span>
                    {isConstrained && (
                      <button
                        onClick={() => removeConstraint(constraints.indexOf(constraint))}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {isConstrained ? (
                    <>
                      <div className="space-y-2">
                        <select
                          value={constraint.availability}
                          onChange={(e) => updateConstraint(constraints.indexOf(constraint), 'availability', e.target.value)}
                          className="w-full text-xs p-1.5 border border-gray-200 rounded bg-white"
                        >
                          {Object.entries(availabilityLabels).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                        <select
                          value={constraint.type}
                          onChange={(e) => updateConstraint(constraints.indexOf(constraint), 'type', e.target.value)}
                          className="w-full text-xs p-1.5 border border-gray-200 rounded bg-white"
                        >
                          <option value="hard">קשיח (חייב)</option>
                          <option value="soft">רך (העדפה)</option>
                        </select>
                        {constraint.reason && (
                          <p className="text-xs text-gray-500">{constraint.reason}</p>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-green-700 font-medium">זמין</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Confirm & Submit */}
      {constraints.length > 0 && (
        <div className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="text-sm text-gray-700">אישרתי שהאילוצים נכונים</span>
          </label>
          <button
            onClick={handleConfirm}
            disabled={!confirmed || loading}
            className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            שלח לסידור
          </button>
        </div>
      )}
    </div>
  );
}
