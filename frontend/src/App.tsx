import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Upload,
  Download,
  Trash2,
  Send,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  Sparkles,
  Bot,
  User,
  ArrowUpRight,
  Wallet,
  ArrowRight,
  ArrowLeft,
  Database,
  Search,
  X,
  Plus,
  Calendar,
  Repeat,
  MessageSquare,
  BookOpen,
  Check,
  TrendingDown,
  DollarSign,
  Tag,
  Clock,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

import heroImage from './assets/hero.jpeg';

interface Transaction {
  id?: number;
  date: string;
  description: string;
  amount: number;
  category: string;
  is_income: number;
}

interface ImportSummary {
  rows_imported: number;
  total_spending: number;
  category_breakdown: Record<string, number>;
  date_range: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface SubscriptionItem {
  merchant: string;
  category: string;
  amount: number;
  frequency: string;
  last_date: string;
  occurrences: number;
}

const SAMPLE_QUESTIONS = [
  "How much did I spend on food last month?",
  "What's my biggest unnecessary expense?",
  "Break down my spending by category.",
  "Suggest a weekly budget plan based on my habits.",
  "What recurring subscriptions do I have?",
];

const CATEGORY_COLORS: Record<string, string> = {
  Food: '#10b981',
  Transport: '#f59e0b',
  Entertainment: '#8b5cf6',
  Utilities: '#3b82f6',
  Shopping: '#ec4899',
  Health: '#14b8a6',
  Other: '#64748b',
};

const CATEGORY_BADGES: Record<string, string> = {
  Food: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
  Transport: 'bg-amber-50 text-amber-700 border-amber-200/60',
  Entertainment: 'bg-purple-50 text-purple-700 border-purple-200/60',
  Utilities: 'bg-blue-50 text-blue-700 border-blue-200/60',
  Shopping: 'bg-pink-50 text-pink-700 border-pink-200/60',
  Health: 'bg-teal-50 text-teal-700 border-teal-200/60',
  Other: 'bg-slate-50 text-slate-700 border-slate-200/60',
};

function formatJournalDate(dateStr: string): string {
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const dt = new Date(y, m, d);
      return dt.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'landing' | 'dashboard'>('landing');
  const [dashboardView, setDashboardView] = useState<'journal' | 'chat' | 'subscriptions'>('journal');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [trends, setTrends] = useState<{ date: string; daily: number; cumulative: number }[]>([]);
  const [chartView, setChartView] = useState<'category' | 'velocity'>('category');
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([]);

  // Add Expense Modal state
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [newDate, setNewDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [newDesc, setNewDesc] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchSummary();
    fetchTransactions();
    fetchTrends();
    fetchSubscriptions();
  }, []);

  useEffect(() => {
    if (dashboardView === 'chat') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, dashboardView]);

  const fetchSummary = async () => {
    try {
      const res = await fetch('/api/summary');
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTransactions = async () => {
    try {
      const res = await fetch('/api/transactions');
      if (res.ok) {
        const data = await res.json();
        setTransactions(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTrends = async () => {
    try {
      const res = await fetch('/api/trends');
      if (res.ok) {
        const data = await res.json();
        setTrends(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSubscriptions = async () => {
    try {
      const res = await fetch('/api/subscriptions');
      if (res.ok) {
        const data = await res.json();
        setSubscriptions(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmt = parseFloat(newAmount);
    if (!newDesc.trim() || isNaN(parsedAmt) || parsedAmt <= 0) return;

    setAddLoading(true);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: newDate,
          description: newDesc.trim(),
          amount: -Math.abs(parsedAmt),
          category: newCategory.trim() || undefined,
        }),
      });

      if (res.ok) {
        await Promise.all([fetchTransactions(), fetchSummary(), fetchTrends(), fetchSubscriptions()]);
        setNewDesc('');
        setNewAmount('');
        setNewCategory('');
        setIsAddExpenseOpen(false);
        setStatusMessage(`Logged $${parsedAmt.toFixed(2)} expense for "${newDesc.trim()}".`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAddLoading(false);
    }
  };

  const handleLoadSample = async () => {
    setUploadLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/sample', { method: 'POST' });
      if (res.ok) {
        const data: ImportSummary = await res.json();
        setSummary(data);
        await Promise.all([fetchTransactions(), fetchTrends(), fetchSubscriptions()]);
        setStatusMessage(`Loaded ${data.rows_imported} sample transactions.`);
        setActiveTab('dashboard');
      }
    } catch (err) {
      setStatusMessage('Error loading sample transactions.');
    } finally {
      setUploadLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const processFile = async (file: File) => {
    setUploadLoading(true);
    setStatusMessage(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data: ImportSummary = await res.json();
        setSummary(data);
        await Promise.all([fetchTransactions(), fetchTrends(), fetchSubscriptions()]);
        setStatusMessage(`Imported ${data.rows_imported} transactions (${data.date_range}).`);
        setActiveTab('dashboard');
      } else {
        const errText = await res.text();
        setStatusMessage(`Could not parse file: ${errText}`);
      }
    } catch (err: any) {
      setStatusMessage(`Upload failed: ${err.message}`);
    } finally {
      setUploadLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleClearData = async () => {
    try {
      const res = await fetch('/api/clear', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
        setTransactions([]);
        setTrends([]);
        setSubscriptions([]);
        setMessages([]);
        setStatusMessage(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    setActiveTab('dashboard');
    setDashboardView('chat');
    const userMessage: Message = { role: 'user', content: text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputPrompt('');
    setLoading(true);

    const history: [string, string][] = [];
    for (let i = 0; i < messages.length - 1; i += 2) {
      if (messages[i].role === 'user' && messages[i + 1]?.role === 'assistant') {
        history.push([messages[i].content, messages[i + 1].content]);
      }
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, chat_history: history }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages([...updatedMessages, { role: 'assistant', content: data.answer }]);
      } else {
        const err = await res.text();
        setMessages([
          ...updatedMessages,
          { role: 'assistant', content: `Error: ${err}` },
        ]);
      }
    } catch (err: any) {
      setMessages([
        ...updatedMessages,
        { role: 'assistant', content: `Connection error: ${err.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadHistory = () => {
    const textContent = messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');
    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chat_history.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const chartData = summary?.category_breakdown
    ? Object.entries(summary.category_breakdown).map(([name, value]) => ({
        name,
        value,
      }))
    : [];

  const filteredTransactions = transactions.filter((tx) => {
    const matchesSearch =
      tx.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.date.includes(searchQuery);
    const matchesCat =
      selectedCategory === 'All' || tx.category.toLowerCase() === selectedCategory.toLowerCase();
    return matchesSearch && matchesCat;
  });

  const journalGroups = React.useMemo(() => {
    const map = new Map<string, { transactions: Transaction[]; totalDailySpend: number }>();
    const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));

    for (const tx of sorted) {
      if (!map.has(tx.date)) {
        map.set(tx.date, { transactions: [], totalDailySpend: 0 });
      }
      const entry = map.get(tx.date)!;
      entry.transactions.push(tx);
      if (tx.amount < 0) {
        entry.totalDailySpend += Math.abs(tx.amount);
      }
    }
    return Array.from(map.entries());
  }, [transactions]);

  const totalMonthlySubscriptions = React.useMemo(() => {
    return subscriptions.reduce((acc, s) => acc + s.amount, 0);
  }, [subscriptions]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#fdfbf7] text-slate-900 font-sans">
      {/* View 1: Minimalist No-Scroll Landing Page */}
      {activeTab === 'landing' ? (
        <div
          className="h-screen w-screen overflow-hidden flex flex-col relative bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${heroImage})` }}
        >
          {/* Main Hero Content (clean solid typography, comfortable top spacing) */}
          <main className="relative z-10 px-6 max-w-3xl mx-auto flex flex-col items-center text-center pt-24 sm:pt-32">
            <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-extrabold text-slate-900 tracking-tight leading-[1.15] mb-4">
              Manage Finance Like Never Before with Agent
            </h1>

            <p className="text-base sm:text-lg text-slate-600 font-normal leading-relaxed mb-8 max-w-xl">
              Track daily expenses, identify recurring subscriptions, and get actionable answers to every personal finance question.
            </p>

            <button
              onClick={() => setActiveTab('dashboard')}
              className="bg-slate-900 hover:bg-black text-white font-medium text-sm sm:text-base px-8 py-3.5 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center gap-2 cursor-pointer"
            >
              <span>Get Started</span>
              <ArrowRight className="w-4 h-4 text-slate-300" />
            </button>
          </main>
        </div>
      ) : (
        /* View 2: Money Management Dashboard & Daily Journal */
        <div className="flex flex-col h-screen overflow-hidden">
          {/* Dashboard Header Bar */}
          <nav className="h-13 bg-white border-b border-slate-200/80 px-6 flex items-center justify-between flex-shrink-0 z-10 shadow-2xs">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveTab('landing')}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 transition py-1 px-2.5 rounded-lg hover:bg-slate-100"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Landing Page</span>
              </button>
              <div className="h-4 w-[1px] bg-slate-200" />
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-slate-900 text-white flex items-center justify-center shadow-xs">
                  <Wallet className="w-3.5 h-3.5 text-amber-300" />
                </div>
                <span className="font-bold text-xs tracking-tight text-slate-900">Personal Finance Agent</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {summary && summary.rows_imported > 0 && (
                <div className="hidden sm:flex items-center gap-2 text-xs text-slate-600">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>{summary.rows_imported} transactions active</span>
                </div>
              )}
              <button
                onClick={() => setIsAddExpenseOpen(true)}
                className="bg-slate-900 hover:bg-black text-white text-xs font-medium py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition shadow-2xs cursor-pointer active:scale-[0.98]"
              >
                <Plus className="w-3.5 h-3.5 text-indigo-400" />
                <span>Log Expense</span>
              </button>
            </div>
          </nav>

          {/* Main Dashboard Layout */}
          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            <aside className="w-80 bg-white border-r border-slate-200/80 p-4 flex flex-col justify-between overflow-y-auto shadow-[1px_0_4px_rgba(0,0,0,0.02)] flex-shrink-0">
              <div className="space-y-5">
                {/* Primary Action Button */}
                <button
                  onClick={() => setIsAddExpenseOpen(true)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs py-2.5 px-3 rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 group cursor-pointer active:scale-[0.99]"
                >
                  <Plus className="w-4 h-4 text-white group-hover:rotate-90 transition-transform duration-200" />
                  <span>Log Daily Expense</span>
                </button>

                {/* Navigation Menu */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block px-2 mb-1">
                    Workspaces
                  </span>
                  <button
                    onClick={() => setDashboardView('journal')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                      dashboardView === 'journal'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                    }`}
                  >
                    <BookOpen className={`w-4 h-4 ${dashboardView === 'journal' ? 'text-amber-300' : 'text-slate-400'}`} />
                    <span>Daily Journal</span>
                    {journalGroups.length > 0 && (
                      <span className={`ml-auto text-[10px] font-mono font-medium px-1.5 py-0.2 rounded-full ${
                        dashboardView === 'journal' ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {journalGroups.length}d
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setDashboardView('chat')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                      dashboardView === 'chat'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                    }`}
                  >
                    <MessageSquare className={`w-4 h-4 ${dashboardView === 'chat' ? 'text-amber-300' : 'text-slate-400'}`} />
                    <span>Chat Copilot</span>
                    {messages.length > 0 && (
                      <span className={`ml-auto text-[10px] font-mono font-medium px-1.5 py-0.2 rounded-full ${
                        dashboardView === 'chat' ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {messages.length}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setDashboardView('subscriptions')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                      dashboardView === 'subscriptions'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                    }`}
                  >
                    <Repeat className={`w-4 h-4 ${dashboardView === 'subscriptions' ? 'text-amber-300' : 'text-slate-400'}`} />
                    <span>Subscriptions</span>
                    {subscriptions.length > 0 && (
                      <span className={`ml-auto text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full ${
                        dashboardView === 'subscriptions' ? 'bg-indigo-500 text-white' : 'bg-indigo-50 text-indigo-700'
                      }`}>
                        {subscriptions.length}
                      </span>
                    )}
                  </button>
                </div>

                <div className="h-[1px] bg-slate-100" />

                {/* Data Ingestion Section */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block px-1">
                      Statement Ingestion
                    </span>
                    <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                      SQLite
                    </span>
                  </div>

                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOver(true);
                    }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOver(false);
                      if (e.dataTransfer.files?.[0]) {
                        processFile(e.dataTransfer.files[0]);
                      }
                    }}
                    className={`border border-dashed rounded-xl p-3 text-center cursor-pointer transition-all duration-200 ${
                      isDragOver
                        ? 'border-indigo-500 bg-indigo-50/50 scale-[0.99]'
                        : 'border-slate-200 hover:border-indigo-400 hover:bg-slate-50/60 bg-slate-50/30'
                    }`}
                  >
                    <div className="w-7 h-7 rounded-full bg-white shadow-xs border border-slate-200/80 flex items-center justify-center mx-auto mb-1.5 text-indigo-600">
                      <Upload className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-[11px] font-semibold text-slate-700 block">
                      {uploadLoading ? 'Processing file...' : 'Import Statement (CSV/PDF)'}
                    </span>
                    <span className="text-[9px] text-slate-400 block mt-0.5">Auto-categorized & stored locally</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.pdf"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </div>

                  <button
                    onClick={handleLoadSample}
                    disabled={uploadLoading}
                    className="w-full bg-white hover:bg-slate-50 text-slate-700 font-medium text-[11px] py-2 px-3 rounded-lg border border-slate-200 shadow-2xs hover:border-slate-300 transition-all flex items-center justify-center gap-1.5 group active:scale-[0.99]"
                  >
                    {uploadLoading ? (
                      <Loader2 className="w-3 h-3 animate-spin text-indigo-600" />
                    ) : (
                      <Sparkles className="w-3 h-3 text-indigo-600 transition-transform group-hover:scale-110" />
                    )}
                    <span>Load sample transactions.csv</span>
                  </button>

                  {statusMessage && (
                    <div className="bg-emerald-50/80 text-emerald-800 text-[11px] p-2.5 rounded-lg border border-emerald-200 flex items-start gap-1.5 shadow-2xs">
                      <span className="leading-tight">{statusMessage}</span>
                    </div>
                  )}
                </div>

                {/* Summary KPIs & Chart */}
                {summary && summary.rows_imported > 0 && (
                  <div className="space-y-3.5 pt-1">
                    <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-3.5 rounded-xl text-white shadow-sm border border-slate-800">
                      <span className="text-[10px] font-medium text-slate-300 uppercase tracking-wider block mb-0.5">
                        Total spending
                      </span>
                      <span className="text-xl font-bold tracking-tight text-white font-mono">
                        ${summary.total_spending.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-1">
                        Across {summary.rows_imported} transactions
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Categories
                        </span>
                        <div className="flex bg-slate-100 p-0.5 rounded-md text-[9px]">
                          <button
                            onClick={() => setChartView('category')}
                            className={`px-1.5 py-0.5 rounded transition ${
                              chartView === 'category' ? 'bg-white text-slate-900 font-semibold shadow-2xs' : 'text-slate-500'
                            }`}
                          >
                            Bar
                          </button>
                          <button
                            onClick={() => setChartView('velocity')}
                            className={`px-1.5 py-0.5 rounded transition ${
                              chartView === 'velocity' ? 'bg-white text-slate-900 font-semibold shadow-2xs' : 'text-slate-500'
                            }`}
                          >
                            Velocity
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1 text-xs mb-3">
                        {Object.entries(summary.category_breakdown).slice(0, 5).map(([cat, val]) => {
                          const pct = summary.total_spending > 0 ? (val / summary.total_spending) * 100 : 0;
                          return (
                            <div key={cat} className="p-1 rounded-md hover:bg-slate-50 transition">
                              <div className="flex justify-between items-center mb-0.5 text-[11px]">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className="w-1.5 h-1.5 rounded-full"
                                    style={{ backgroundColor: CATEGORY_COLORS[cat] || '#64748b' }}
                                  ></span>
                                  <span className="font-medium text-slate-700">{cat}</span>
                                </div>
                                <div className="flex items-center gap-1.5 font-mono text-[10px]">
                                  <span className="text-slate-400">{pct.toFixed(0)}%</span>
                                  <span className="font-medium text-slate-900">
                                    ${val.toFixed(0)}
                                  </span>
                                </div>
                              </div>
                              <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-300"
                                  style={{
                                    width: `${Math.min(pct, 100)}%`,
                                    backgroundColor: CATEGORY_COLORS[cat] || '#64748b',
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Mini Recharts view */}
                      <div className="bg-slate-50/60 p-2 rounded-xl border border-slate-200/80">
                        {chartView === 'category' && chartData.length > 0 && (
                          <div className="h-28">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 16 }}>
                                <XAxis
                                  dataKey="name"
                                  angle={-35}
                                  textAnchor="end"
                                  tick={{ fontSize: 8, fill: '#64748b' }}
                                  interval={0}
                                />
                                <YAxis tick={{ fontSize: 8, fill: '#64748b' }} />
                                <Tooltip
                                  contentStyle={{
                                    backgroundColor: '#0f172a',
                                    borderRadius: '6px',
                                    border: 'none',
                                    color: '#fff',
                                    fontSize: '10px',
                                  }}
                                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'Spend']}
                                />
                                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                                  {chartData.map((entry, index) => (
                                    <Cell
                                      key={`cell-${index}`}
                                      fill={CATEGORY_COLORS[entry.name] || '#64748b'}
                                    />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}

                        {chartView === 'velocity' && trends.length > 0 && (
                          <div className="h-28">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={trends} margin={{ top: 4, right: 4, left: -28, bottom: 16 }}>
                                <defs>
                                  <linearGradient id="velocityGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.4} />
                                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <XAxis
                                  dataKey="date"
                                  angle={-35}
                                  textAnchor="end"
                                  tick={{ fontSize: 8, fill: '#64748b' }}
                                  interval={Math.ceil(trends.length / 4)}
                                />
                                <YAxis tick={{ fontSize: 8, fill: '#64748b' }} />
                                <Tooltip
                                  contentStyle={{
                                    backgroundColor: '#0f172a',
                                    borderRadius: '6px',
                                    border: 'none',
                                    color: '#fff',
                                    fontSize: '10px',
                                  }}
                                  formatter={(val: number) => [`$${val.toFixed(2)}`, 'Cumulative']}
                                />
                                <Area
                                  type="monotone"
                                  dataKey="cumulative"
                                  stroke="#4f46e5"
                                  strokeWidth={1.5}
                                  fillOpacity={1}
                                  fill="url(#velocityGrad)"
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Export and Clear Data Footer */}
              <div className="pt-3 border-t border-slate-200 space-y-1.5">
                {summary && summary.rows_imported > 0 && (
                  <div className="flex gap-1.5">
                    <a
                      href="/api/export/csv"
                      download="transactions_export.csv"
                      className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium text-[11px] py-1 px-2 rounded-lg border border-slate-200/80 transition flex items-center justify-center gap-1 shadow-2xs"
                    >
                      <Download className="w-3 h-3 text-slate-500" />
                      <span>CSV</span>
                    </a>
                    <a
                      href="/api/export/json"
                      download="financial_audit.json"
                      className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium text-[11px] py-1 px-2 rounded-lg border border-slate-200/80 transition flex items-center justify-center gap-1 shadow-2xs"
                    >
                      <Download className="w-3 h-3 text-slate-500" />
                      <span>Audit JSON</span>
                    </a>
                  </div>
                )}
                <button
                  onClick={handleClearData}
                  className="w-full text-rose-600 hover:bg-rose-50 hover:border-rose-200 font-medium text-[11px] py-1.5 px-2 rounded-lg border border-transparent transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear Stored Data</span>
                </button>
              </div>
            </aside>

            {/* Main Content Area: View Switcher */}
            <main className="flex-1 flex flex-col h-full bg-[#f8fafc] overflow-hidden">
              {/* VIEW A: Daily Spending Journal */}
              {dashboardView === 'journal' && (
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                  {/* Journal Top Header */}
                  <header className="p-5 bg-white border-b border-slate-200/80 flex-shrink-0 shadow-2xs">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
                          <BookOpen className="w-5 h-5 text-amber-300" />
                        </div>
                        <div>
                          <h1 className="text-lg font-bold tracking-tight text-slate-900">Daily Expense Journal</h1>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Day-by-day record of personal expenditures. Log daily spend or track imported statement timeline.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg text-xs font-medium text-slate-700">
                          <span className="px-2 py-0.5 bg-white rounded-md shadow-2xs font-mono font-bold text-slate-900">
                            {journalGroups.length} Days
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className="px-1 text-slate-600 font-mono">
                            {transactions.length} Entries
                          </span>
                        </div>
                        <button
                          onClick={() => setIsAddExpenseOpen(true)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition shadow-2xs cursor-pointer active:scale-[0.98]"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Expense</span>
                        </button>
                      </div>
                    </div>
                  </header>

                  {/* Journal Timeline Feed */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {journalGroups.length === 0 ? (
                      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white border border-slate-200 rounded-2xl shadow-xs">
                        <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3">
                          <BookOpen className="w-6 h-6" />
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 mb-1">Your Journal is Empty</h3>
                        <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                          Start logging your day-to-day purchases like coffee, groceries, or dinner, or import bank transactions to populate your journal.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2 justify-center">
                          <button
                            onClick={() => setIsAddExpenseOpen(true)}
                            className="bg-slate-900 hover:bg-black text-white text-xs font-semibold py-2 px-4 rounded-xl transition shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Log Today's Expense</span>
                          </button>
                          <button
                            onClick={handleLoadSample}
                            className="bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium py-2 px-4 rounded-xl border border-slate-200 transition shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Load Demo Journal</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="max-w-3xl mx-auto space-y-5">
                        {journalGroups.map(([dateStr, { transactions: dayTxs, totalDailySpend }]) => (
                          <div
                            key={dateStr}
                            className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs hover:shadow-sm transition-shadow duration-200"
                          >
                            {/* Day Header */}
                            <div className="px-4 py-3 bg-slate-50/70 border-b border-slate-200/80 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                <span className="font-semibold text-xs text-slate-900">
                                  {formatJournalDate(dateStr)}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  ({dayTxs.length} {dayTxs.length === 1 ? 'item' : 'items'})
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-900 text-white shadow-2xs">
                                  ${totalDailySpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} spent
                                </span>
                              </div>
                            </div>

                            {/* Day Transactions List */}
                            <div className="divide-y divide-slate-100">
                              {dayTxs.map((tx, idx) => (
                                <div
                                  key={idx}
                                  className="px-4 py-3 flex items-center justify-between hover:bg-slate-50/60 transition-colors"
                                >
                                  <div className="flex items-center gap-3">
                                    <div
                                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: CATEGORY_COLORS[tx.category] || '#64748b' }}
                                    />
                                    <div>
                                      <p className="text-xs font-semibold text-slate-800 leading-tight">
                                        {tx.description}
                                      </p>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <span
                                          className={`text-[9px] font-semibold px-1.5 py-0.2 rounded border ${
                                            CATEGORY_BADGES[tx.category] || 'bg-slate-50 text-slate-700 border-slate-200'
                                          }`}
                                        >
                                          {tx.category}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="text-right">
                                    <span
                                      className={`font-mono font-bold text-xs ${
                                        tx.amount < 0 ? 'text-slate-900' : 'text-emerald-600'
                                      }`}
                                    >
                                      {tx.amount < 0 ? '-' : '+'}$
                                      {Math.abs(tx.amount).toLocaleString('en-US', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* VIEW B: Recurring Subscriptions & Bills */}
              {dashboardView === 'subscriptions' && (
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                  {/* Subscriptions Top Header */}
                  <header className="p-5 bg-white border-b border-slate-200/80 flex-shrink-0 shadow-2xs">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
                        <Repeat className="w-5 h-5 text-amber-300" />
                      </div>
                      <div>
                        <h1 className="text-lg font-bold tracking-tight text-slate-900">Recurring Subscriptions & Bills</h1>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Autonomous pattern detection analyzes billing frequencies to highlight regular commitments and monthly burn.
                        </p>
                      </div>
                    </div>

                    {/* Subscription KPI Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                          Fixed Monthly Burn
                        </span>
                        <span className="text-xl font-bold font-mono text-slate-900 mt-0.5 block">
                          ${totalMonthlySubscriptions.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">Per billing month</span>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                          Projected Annual Cost
                        </span>
                        <span className="text-xl font-bold font-mono text-indigo-700 mt-0.5 block">
                          ${(totalMonthlySubscriptions * 12).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">Annual recurring commitments</span>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                          Detected Services
                        </span>
                        <span className="text-xl font-bold font-mono text-slate-900 mt-0.5 block">
                          {subscriptions.length} Services
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">Repeating cadence identified</span>
                      </div>
                    </div>
                  </header>

                  {/* Subscriptions Grid Feed */}
                  <div className="flex-1 overflow-y-auto p-6">
                    {subscriptions.length === 0 ? (
                      <div className="max-w-md mx-auto my-12 text-center p-8 bg-white border border-slate-200 rounded-2xl shadow-xs">
                        <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3">
                          <Repeat className="w-6 h-6" />
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 mb-1">No Subscriptions Detected</h3>
                        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                          Subscriptions and repeating bills are automatically recognized when the same merchant and charge appear across 2 or more cycles.
                        </p>
                        <button
                          onClick={handleLoadSample}
                          className="bg-slate-900 hover:bg-black text-white text-xs font-medium py-2 px-4 rounded-xl transition shadow-2xs inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Load Sample Statements with Subscriptions</span>
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
                        {subscriptions.map((sub, idx) => (
                          <div
                            key={idx}
                            className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between"
                          >
                            <div>
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <h3 className="text-sm font-bold text-slate-900 leading-tight">
                                  {sub.merchant}
                                </h3>
                                <span
                                  className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${
                                    CATEGORY_BADGES[sub.category] || 'bg-slate-50 text-slate-700 border-slate-200'
                                  }`}
                                >
                                  {sub.category}
                                </span>
                              </div>

                              <div className="my-3">
                                <div className="flex items-baseline gap-1">
                                  <span className="text-2xl font-extrabold font-mono text-slate-900">
                                    ${sub.amount.toFixed(2)}
                                  </span>
                                  <span className="text-xs text-slate-400 font-medium">/ month</span>
                                </div>
                                <span className="text-[11px] text-slate-500 block mt-0.5">
                                  ~ ${(sub.amount * 12).toFixed(2)} / year
                                </span>
                              </div>
                            </div>

                            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                              <span>Billed {sub.occurrences} times</span>
                              <span className="font-mono">Last: {sub.last_date}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* VIEW C: Chat Copilot Workspace */}
              {dashboardView === 'chat' && (
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                  {/* Top Header */}
                  <header className="p-5 bg-white border-b border-slate-200/80 flex-shrink-0 shadow-2xs">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
                        <Bot className="w-5 h-5 text-amber-300" />
                      </div>
                      <div>
                        <h1 className="text-lg font-bold tracking-tight text-slate-900">Financial Intelligence Copilot</h1>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Ask natural language questions about your spending, budget suggestions, and expense patterns.
                        </p>
                      </div>
                    </div>

                    {/* Transaction Preview Accordion */}
                    {transactions.length > 0 && (
                      <div className="mt-4 border border-slate-200/80 rounded-xl overflow-hidden bg-white shadow-2xs">
                        <button
                          onClick={() => setPreviewOpen(!previewOpen)}
                          className="w-full flex items-center justify-between p-2.5 bg-slate-50/70 hover:bg-slate-100/70 text-xs font-semibold text-slate-700 transition"
                        >
                          <span className="flex items-center gap-2">
                            <span>Transaction preview</span>
                            <span className="bg-indigo-50 text-indigo-700 font-mono text-[10px] px-2 py-0.5 rounded-full border border-indigo-200/50">
                              {transactions.length} rows
                            </span>
                          </span>
                          {previewOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                        </button>
                        {previewOpen && (
                          <div className="border-t border-slate-200">
                            {/* Search and Category Filter Toolbar */}
                            <div className="p-2.5 bg-slate-50/60 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2.5 text-xs">
                              <div className="relative flex-1 min-w-[200px]">
                                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                <input
                                  type="text"
                                  value={searchQuery}
                                  onChange={(e) => setSearchQuery(e.target.value)}
                                  placeholder="Search merchant or date (e.g. Starbucks, 2026-01)..."
                                  className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-2xs"
                                />
                                {searchQuery && (
                                  <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </div>

                              {/* Category Filter Pills */}
                              <div className="flex flex-wrap items-center gap-1">
                                {['All', 'Food', 'Transport', 'Entertainment', 'Utilities', 'Shopping', 'Health', 'Other'].map((cat) => (
                                  <button
                                    key={cat}
                                    onClick={() => setSelectedCategory(cat)}
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition cursor-pointer ${
                                      selectedCategory === cat
                                        ? 'bg-slate-900 text-white font-semibold'
                                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
                                    }`}
                                  >
                                    {cat}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Table */}
                            <div className="max-h-56 overflow-y-auto text-xs">
                              {filteredTransactions.length === 0 ? (
                                <div className="p-6 text-center text-slate-400">
                                  No transactions match the selected filter.
                                </div>
                              ) : (
                                <table className="w-full text-left">
                                  <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-slate-500 uppercase text-[9px] tracking-wider font-semibold">
                                    <tr>
                                      <th className="p-2 pl-4">Date</th>
                                      <th className="p-2">Description</th>
                                      <th className="p-2">Category</th>
                                      <th className="p-2 pr-4 text-right">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {filteredTransactions.map((tx, idx) => (
                                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                                        <td className="p-2 pl-4 whitespace-nowrap text-slate-500 font-mono text-[10px]">{tx.date}</td>
                                        <td className="p-2 font-medium text-slate-800">{tx.description}</td>
                                        <td className="p-2">
                                          <span
                                            className={`inline-block px-1.5 py-0.2 rounded-full text-[9px] font-semibold border ${
                                              CATEGORY_BADGES[tx.category] || 'bg-slate-50 text-slate-700 border-slate-200'
                                            }`}
                                          >
                                            {tx.category}
                                          </span>
                                        </td>
                                        <td className={`p-2 pr-4 text-right font-mono font-semibold ${tx.amount < 0 ? 'text-slate-900' : 'text-emerald-600'}`}>
                                          ${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Empty state info banner */}
                    {transactions.length === 0 && (
                      <div className="mt-3 bg-indigo-50/70 text-indigo-900 border border-indigo-200/70 p-3 rounded-xl text-xs flex items-center gap-2.5 shadow-2xs">
                        <AlertCircle className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                        <span>No transactions loaded yet. Upload a statement in the sidebar or click <strong>Load sample transactions.csv</strong> to test.</span>
                      </div>
                    )}

                    {/* Sample Prompts */}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {SAMPLE_QUESTIONS.map((q) => (
                        <button
                          key={q}
                          onClick={() => handleSendMessage(q)}
                          className="text-[11px] bg-white hover:bg-indigo-50/50 hover:text-indigo-600 hover:border-indigo-300 text-slate-700 py-1 px-2.5 rounded-full border border-slate-200/90 transition-all duration-150 flex items-center gap-1 shadow-2xs group"
                        >
                          <span>{q}</span>
                          <ArrowUpRight className="w-3 h-3 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                        </button>
                      ))}
                    </div>
                  </header>

                  {/* Chat Messages Feed */}
                  <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {messages.map((msg, index) => (
                      <div
                        key={index}
                        className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        {msg.role === 'assistant' && (
                          <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                            <Bot className="w-4 h-4 text-amber-300" />
                          </div>
                        )}
                        <div
                          className={`max-w-2xl rounded-2xl p-4 text-xs leading-relaxed ${
                            msg.role === 'user'
                              ? 'bg-slate-900 text-white shadow-sm rounded-tr-xs'
                              : 'bg-white text-slate-800 border border-slate-200/80 shadow-xs rounded-tl-xs'
                          }`}
                        >
                          <div className={`prose ${msg.role === 'user' ? 'text-white prose-invert' : 'text-slate-800'}`}>
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>

                          {msg.role === 'assistant' && index === messages.length - 1 && (
                            <div className="mt-3 pt-2 border-t border-slate-100 flex justify-end">
                              <button
                                onClick={handleDownloadHistory}
                                className="text-[10px] font-medium text-slate-400 hover:text-slate-700 flex items-center gap-1 transition"
                              >
                                <Download className="w-3 h-3" />
                                <span>Download chat log</span>
                              </button>
                            </div>
                          )}
                        </div>
                        {msg.role === 'user' && (
                          <div className="w-8 h-8 rounded-lg bg-slate-200 text-slate-800 flex items-center justify-center flex-shrink-0 shadow-xs">
                            <User className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                    ))}

                    {loading && (
                      <div className="flex gap-3 items-center text-slate-500 text-xs">
                        <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                          <Bot className="w-4 h-4 text-amber-300" />
                        </div>
                        <div className="flex items-center gap-2.5 bg-white p-3 rounded-2xl rounded-tl-xs border border-slate-200/80 shadow-xs">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                          <span className="font-medium text-slate-600 text-xs">Analyzing financial database...</span>
                        </div>
                      </div>
                    )}

                    <div ref={chatBottomRef} />
                  </div>

                  {/* Chat Input */}
                  <div className="p-3.5 border-t border-slate-200/80 bg-white shadow-[0_-1px_3px_rgba(0,0,0,0.02)]">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleSendMessage(inputPrompt);
                      }}
                      className="flex gap-2 max-w-4xl mx-auto items-center"
                    >
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={inputPrompt}
                          onChange={(e) => setInputPrompt(e.target.value)}
                          placeholder="Ask about expenses, categories, or budgeting..."
                          className="w-full bg-slate-50/80 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition shadow-2xs"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={loading || !inputPrompt.trim()}
                        className="bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl text-xs font-semibold transition shadow-xs flex items-center gap-1.5 active:scale-[0.98] cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Send</span>
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </main>
          </div>

          {/* Modal: Log Daily Expense */}
          {isAddExpenseOpen && (
            <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
              <div
                className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      <Plus className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Log Daily Expense</h3>
                      <p className="text-[11px] text-slate-400">Record a personal purchase into your journal.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsAddExpenseOpen(false)}
                    className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleCreateExpense} className="p-5 space-y-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Date
                    </label>
                    <div className="relative">
                      <input
                        type="date"
                        required
                        value={newDate}
                        onChange={(e) => setNewDate(e.target.value)}
                        className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono shadow-2xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Description / Merchant
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Philz Coffee, Groceries at Trader Joe's"
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-2xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Amount ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        placeholder="0.00"
                        value={newAmount}
                        onChange={(e) => setNewAmount(e.target.value)}
                        className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-2xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Category
                      </label>
                      <select
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-2xs"
                      >
                        <option value="">Auto-Detect</option>
                        <option value="Food">Food</option>
                        <option value="Transport">Transport</option>
                        <option value="Entertainment">Entertainment</option>
                        <option value="Utilities">Utilities</option>
                        <option value="Shopping">Shopping</option>
                        <option value="Health">Health</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setIsAddExpenseOpen(false)}
                      className="px-3 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={addLoading || !newDesc.trim() || !newAmount}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs py-2 px-4 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                    >
                      {addLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>Save Expense</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
