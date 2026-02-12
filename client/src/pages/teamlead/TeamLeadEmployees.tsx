import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';
import { Search, User, Tag, Clock, Brain, Plus, X, AlertTriangle, Lightbulb, ThumbsUp, GripVertical } from 'lucide-react';

interface Employee {
  id: string;
  name: string;
  seniority: number;
  swapPoints: number;
  tags: { id: string; tag: string; category: string }[];
  lifeEvents: LifeEvent[];
  ratings: { category: string; score: number }[];
  assignments: any[];
  constraints: any[];
}

interface LifeEvent {
  id: string;
  type: string;
  title: string;
  startDate: string;
  endDate?: string;
  notes?: string;
  availabilityImpact: string;
}

interface Insight {
  type: 'warning' | 'suggestion' | 'positive';
  text: string;
  action?: string;
}

const TAG_OPTIONS = {
  functional: [
    { tag: 'closer', label: 'הסוגר' },
    { tag: 'opener', label: 'הפותח' },
    { tag: 'mentor', label: 'החונך' },
    { tag: 'dynamic', label: 'דינמי' },
    { tag: 'anchor', label: 'העוגן' },
    { tag: 'specialist', label: 'מומחה' },
  ],
  social: [
    { tag: 'morale_booster', label: 'מרים מורל' },
    { tag: 'team_player', label: 'שחקן צוות' },
    { tag: 'solo', label: 'עובד לבד' },
    { tag: 'leader', label: 'מוביל טבעי' },
  ],
  availability: [
    { tag: 'flexible', label: 'גמיש' },
    { tag: 'nights_ok', label: 'מוכן ללילות' },
    { tag: 'weekends_ok', label: 'מוכן לסופ"שים' },
    { tag: 'limited', label: 'זמינות מוגבלת' },
  ],
};

const TAG_LABELS: Record<string, string> = {};
Object.values(TAG_OPTIONS).flat().forEach(t => { TAG_LABELS[t.tag] = t.label; });

const EVENT_TYPES: Record<string, string> = {
  military: 'מילואים',
  studies: 'לימודים',
  pregnancy: 'הריון/חופשת לידה',
  family: 'אירוע משפחתי',
  health: 'בעיה בריאותית',
  other: 'אחר',
};

const IMPACT_LABELS: Record<string, string> = {
  unavailable: 'לא זמין כלל',
  partial: 'זמינות חלקית',
  consider: 'לקחת בחשבון',
};

export default function TeamLeadEmployees() {
  const { user } = useAuth();
  const [teams, setTeams] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [activeTab, setActiveTab] = useState<'tags' | 'timeline' | 'ai'>('tags');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [customTag, setCustomTag] = useState('');

  // Event form state
  const [eventForm, setEventForm] = useState({
    type: 'military',
    title: '',
    startDate: '',
    endDate: '',
    notes: '',
    availabilityImpact: 'unavailable',
  });

  useEffect(() => {
    api.get('/team').then(res => {
      setTeams(res.data);
      if (res.data.length > 0) {
        loadEmployees(res.data[0].id);
      }
    });
  }, []);

  const loadEmployees = async (teamId: string) => {
    setLoading(true);
    try {
      const res = await api.get(`/team/${teamId}/employees`);
      setEmployees(res.data);
    } catch {
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  };

  const addTag = async (empId: string, tag: string, category: string) => {
    try {
      const teamId = teams[0]?.id;
      await api.post(`/team/${teamId}/employees/${empId}/tags`, { tag, category });
      loadEmployees(teamId);
      if (selectedEmployee?.id === empId) {
        const res = await api.get(`/team/${teamId}/employees`);
        setSelectedEmployee(res.data.find((e: Employee) => e.id === empId) || null);
        setEmployees(res.data);
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'שגיאה בהוספת תג');
    }
  };

  const removeTag = async (empId: string, tag: string) => {
    try {
      const teamId = teams[0]?.id;
      await api.delete(`/team/${teamId}/employees/${empId}/tags/${tag}`);
      loadEmployees(teamId);
      if (selectedEmployee?.id === empId) {
        const res = await api.get(`/team/${teamId}/employees`);
        setSelectedEmployee(res.data.find((e: Employee) => e.id === empId) || null);
        setEmployees(res.data);
      }
    } catch {
      alert('שגיאה בהסרת תג');
    }
  };

  const addLifeEvent = async () => {
    if (!selectedEmployee || !eventForm.title || !eventForm.startDate) return;
    try {
      const teamId = teams[0]?.id;
      await api.post(`/team/${teamId}/employees/${selectedEmployee.id}/life-events`, eventForm);
      setShowEventForm(false);
      setEventForm({ type: 'military', title: '', startDate: '', endDate: '', notes: '', availabilityImpact: 'unavailable' });
      loadEmployees(teamId);
      const res = await api.get(`/team/${teamId}/employees`);
      setSelectedEmployee(res.data.find((e: Employee) => e.id === selectedEmployee.id) || null);
      setEmployees(res.data);
    } catch {
      alert('שגיאה בהוספת אירוע');
    }
  };

  const deleteLifeEvent = async (eventId: string) => {
    if (!selectedEmployee) return;
    try {
      const teamId = teams[0]?.id;
      await api.delete(`/team/${teamId}/employees/${selectedEmployee.id}/life-events/${eventId}`);
      loadEmployees(teamId);
      const res = await api.get(`/team/${teamId}/employees`);
      setSelectedEmployee(res.data.find((e: Employee) => e.id === selectedEmployee.id) || null);
      setEmployees(res.data);
    } catch {
      alert('שגיאה במחיקת אירוע');
    }
  };

  const requestInsights = async () => {
    if (!selectedEmployee) return;
    setInsightsLoading(true);
    try {
      const teamId = teams[0]?.id;
      const res = await api.post(`/team/${teamId}/employees/${selectedEmployee.id}/ai-insights`);
      setInsights(res.data.insights || []);
    } catch {
      setInsights([{ type: 'warning', text: 'שגיאה בקבלת תובנות' }]);
    } finally {
      setInsightsLoading(false);
    }
  };

  const getEmployeeStatus = (emp: Employee) => {
    if (emp.lifeEvents.some(e => !e.endDate || new Date(e.endDate) >= new Date())) return 'orange';
    const monthlyShifts = emp.assignments.length;
    if (monthlyShifts > 20) return 'red';
    return 'green';
  };

  const filteredEmployees = employees.filter(e =>
    e.name.includes(searchQuery) ||
    e.tags.some(t => t.tag.includes(searchQuery) || (TAG_LABELS[t.tag] || '').includes(searchQuery))
  );

  return (
    <div className="flex gap-6 h-[calc(100vh-120px)]">
      {/* Employees List - Right Side */}
      <div className="w-80 shrink-0">
        <div className="bg-white rounded-xl border border-gray-200 h-full flex flex-col">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-bold text-lg mb-3">עובדי הצוות</h3>
            <div className="relative">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="חיפוש..."
                className="w-full pr-9 pl-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="text-center py-10 text-gray-400 text-sm">טוען...</div>
            ) : (
              filteredEmployees.map(emp => {
                const status = getEmployeeStatus(emp);
                const isSelected = selectedEmployee?.id === emp.id;
                return (
                  <button
                    key={emp.id}
                    onClick={() => { setSelectedEmployee(emp); setInsights([]); }}
                    className={`w-full text-right p-3 rounded-lg mb-1 transition-colors ${
                      isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                        status === 'green' ? 'bg-green-500' : status === 'orange' ? 'bg-orange-500' : 'bg-red-500'
                      }`}>
                        {emp.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{emp.name}</p>
                        <p className="text-xs text-gray-400">ותק: {emp.seniority} חודשים</p>
                      </div>
                    </div>
                    {emp.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {emp.tags.slice(0, 3).map(t => (
                          <span key={t.id} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                            {TAG_LABELS[t.tag] || t.tag}
                          </span>
                        ))}
                        {emp.tags.length > 3 && (
                          <span className="text-xs text-gray-400">+{emp.tags.length - 3}</span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Employee Profile - Center */}
      <div className="flex-1 min-w-0">
        {!selectedEmployee ? (
          <div className="h-full flex items-center justify-center text-gray-400">
            <div className="text-center">
              <User className="w-16 h-16 mx-auto mb-3 opacity-30" />
              <p>בחר עובד מהרשימה</p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 h-full flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg ${
                  getEmployeeStatus(selectedEmployee) === 'green' ? 'bg-green-500' :
                  getEmployeeStatus(selectedEmployee) === 'orange' ? 'bg-orange-500' : 'bg-red-500'
                }`}>
                  {selectedEmployee.name.charAt(0)}
                </div>
                <div>
                  <h2 className="text-xl font-bold">{selectedEmployee.name}</h2>
                  <p className="text-sm text-gray-500">ותק: {selectedEmployee.seniority} חודשים | נקודות חילוף: {selectedEmployee.swapPoints}</p>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-100">
              {[
                { key: 'tags' as const, label: 'תיוג אופי', icon: Tag },
                { key: 'timeline' as const, label: 'ציר זמן', icon: Clock },
                { key: 'ai' as const, label: 'תובנות AI', icon: Brain },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'tags' && (
                <div className="space-y-6">
                  {/* Current Tags */}
                  <div>
                    <h4 className="font-medium text-sm text-gray-500 mb-3">תגיות פעילות</h4>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {selectedEmployee.tags.map(t => (
                        <span key={t.id} className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-sm">
                          {TAG_LABELS[t.tag] || t.tag}
                          <button onClick={() => removeTag(selectedEmployee.id, t.tag)} className="hover:text-red-500">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      {selectedEmployee.tags.length === 0 && (
                        <span className="text-sm text-gray-400">אין תגיות עדיין</span>
                      )}
                    </div>
                  </div>

                  {/* Available Tags by Category */}
                  {Object.entries(TAG_OPTIONS).map(([category, tags]) => (
                    <div key={category}>
                      <h4 className="font-medium text-sm text-gray-500 mb-2">
                        {category === 'functional' ? 'תפקודי' : category === 'social' ? 'חברתי' : 'זמינות'}
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {tags.map(t => {
                          const hasTag = selectedEmployee.tags.some(et => et.tag === t.tag);
                          return (
                            <button
                              key={t.tag}
                              onClick={() => !hasTag && addTag(selectedEmployee.id, t.tag, category)}
                              disabled={hasTag}
                              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                                hasTag
                                  ? 'bg-blue-50 text-blue-700 border-blue-200 cursor-default'
                                  : 'bg-white text-gray-600 border-gray-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 cursor-pointer'
                              }`}
                            >
                              {t.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* Custom Tag */}
                  <div>
                    <h4 className="font-medium text-sm text-gray-500 mb-2">תגית מותאמת</h4>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customTag}
                        onChange={(e) => setCustomTag(e.target.value)}
                        placeholder="הקלד תגית חדשה..."
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                      <button
                        onClick={() => {
                          if (customTag.trim()) {
                            addTag(selectedEmployee.id, customTag.trim(), 'custom');
                            setCustomTag('');
                          }
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'timeline' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-medium">אירועי חיים</h4>
                    <button
                      onClick={() => setShowEventForm(true)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                    >
                      <Plus className="w-4 h-4" />
                      הוסף אירוע
                    </button>
                  </div>

                  {/* Event Form */}
                  {showEventForm && (
                    <div className="bg-gray-50 rounded-xl p-4 mb-6 border border-gray-200">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-gray-500">סוג</label>
                          <select
                            value={eventForm.type}
                            onChange={(e) => setEventForm(f => ({ ...f, type: e.target.value }))}
                            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          >
                            {Object.entries(EVENT_TYPES).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">כותרת</label>
                          <input
                            type="text"
                            value={eventForm.title}
                            onChange={(e) => setEventForm(f => ({ ...f, title: e.target.value }))}
                            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">תאריך התחלה</label>
                          <input
                            type="date"
                            value={eventForm.startDate}
                            onChange={(e) => setEventForm(f => ({ ...f, startDate: e.target.value }))}
                            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500">תאריך סיום</label>
                          <input
                            type="date"
                            value={eventForm.endDate}
                            onChange={(e) => setEventForm(f => ({ ...f, endDate: e.target.value }))}
                            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs font-medium text-gray-500">השפעה על זמינות</label>
                          <select
                            value={eventForm.availabilityImpact}
                            onChange={(e) => setEventForm(f => ({ ...f, availabilityImpact: e.target.value }))}
                            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                          >
                            {Object.entries(IMPACT_LABELS).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs font-medium text-gray-500">הערות</label>
                          <textarea
                            value={eventForm.notes}
                            onChange={(e) => setEventForm(f => ({ ...f, notes: e.target.value }))}
                            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                            rows={2}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button onClick={addLifeEvent} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">שמור</button>
                        <button onClick={() => setShowEventForm(false)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300">ביטול</button>
                      </div>
                    </div>
                  )}

                  {/* Timeline */}
                  <div className="relative">
                    {selectedEmployee.lifeEvents.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-6">אין אירועי חיים</p>
                    ) : (
                      <div className="space-y-4">
                        {selectedEmployee.lifeEvents
                          .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
                          .map(event => (
                            <div key={event.id} className="relative pr-8 border-r-2 border-blue-200">
                              <div className="absolute right-[-7px] top-2 w-3 h-3 rounded-full bg-blue-500" />
                              <div className="bg-white border border-gray-200 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                                      event.availabilityImpact === 'unavailable' ? 'bg-red-100 text-red-700' :
                                      event.availabilityImpact === 'partial' ? 'bg-orange-100 text-orange-700' :
                                      'bg-yellow-100 text-yellow-700'
                                    }`}>
                                      {IMPACT_LABELS[event.availabilityImpact]}
                                    </span>
                                    <span className="text-xs text-gray-400">{EVENT_TYPES[event.type]}</span>
                                  </div>
                                  <button onClick={() => deleteLifeEvent(event.id)} className="text-gray-400 hover:text-red-500">
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                                <h5 className="font-medium text-sm">{event.title}</h5>
                                <p className="text-xs text-gray-500 mt-1">
                                  {new Date(event.startDate).toLocaleDateString('he-IL')}
                                  {event.endDate && ` — ${new Date(event.endDate).toLocaleDateString('he-IL')}`}
                                </p>
                                {event.notes && <p className="text-xs text-gray-400 mt-1">{event.notes}</p>}
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'ai' && (
                <div>
                  <button
                    onClick={requestInsights}
                    disabled={insightsLoading}
                    className="w-full px-4 py-3 bg-gradient-to-l from-purple-600 to-blue-600 text-white rounded-xl font-medium hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 transition-all mb-6"
                  >
                    {insightsLoading ? 'מנתח...' : 'בקש תובנות מ-AI'}
                  </button>

                  {insights.length > 0 && (
                    <div className="space-y-3">
                      {insights.map((insight, i) => (
                        <div key={i} className={`p-4 rounded-xl border ${
                          insight.type === 'warning' ? 'bg-red-50 border-red-200' :
                          insight.type === 'positive' ? 'bg-green-50 border-green-200' :
                          'bg-blue-50 border-blue-200'
                        }`}>
                          <div className="flex items-start gap-3">
                            {insight.type === 'warning' ? (
                              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                            ) : insight.type === 'positive' ? (
                              <ThumbsUp className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                            ) : (
                              <Lightbulb className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                            )}
                            <div>
                              <p className="text-sm font-medium">{insight.text}</p>
                              {insight.action && (
                                <p className="text-xs text-gray-500 mt-1">{insight.action}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
