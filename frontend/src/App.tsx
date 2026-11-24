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
  AlertTriangle,
  Sparkles,
  Bot,
  User,
  ArrowUpRight,
  ArrowRight,
  Search,
  X,
  Plus,
  Calendar,
  Repeat,
  MessageSquare,
  BookOpen,
  Check,
  LayoutDashboard,
  Sliders,
  Filter,
  AlertOctagon,
  Printer,
  FileText,
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

import heroImage from './assets/hero.webp';

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

interface CategoryBudget {
  category: string;
  monthly_limit: f64;
  current_spent: f64;
  percentage: f64;
  status: 'ok' | 'warning' | 'exceeded';
}

interface SpendingAnomaly {
  id: number;
  date: string;
  description: string;
  amount: number;
  category: string;
  category_avg: number;
  z_score: number;
  reason: string;
}

type f64 = number;

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
  Food: 'bg-emerald-950/50 text-emerald-300 border-emerald-800/60',
  Transport: 'bg-amber-950/50 text-amber-300 border-amber-800/60',
  Entertainment: 'bg-purple-950/50 text-purple-300 border-purple-800/60',
  Utilities: 'bg-blue-950/50 text-blue-300 border-blue-800/60',
  Shopping: 'bg-pink-950/50 text-pink-300 border-pink-800/60',
  Health: 'bg-teal-950/50 text-teal-300 border-teal-800/60',
  Other: 'bg-slate-800 text-slate-300 border-slate-700',
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

function formatMonthLabel(monthStr: string): string {
  try {
    const parts = monthStr.split('-');
    if (parts.length === 2) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const dt = new Date(y, m, 1);
      return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    return monthStr;
  } catch {
    return monthStr;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'landing' | 'dashboard'>('landing');
  const [dashboardView, setDashboardView] = useState<'dashboard' | 'journal' | 'chat' | 'subscriptions'>('dashboard');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [trends, setTrends] = useState<{ date: string; daily: number; cumulative: number }[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([]);
  const [budgets, setBudgets] = useState<CategoryBudget[]>([]);
  const [anomalies, setAnomalies] = useState<SpendingAnomaly[]>([]);
  const [isStatementOpen, setIsStatementOpen] = useState(false);

  // Date Range Filter state
  const [dateFilter, setDateFilter] = useState<string>('all');

  // Budget Edit Modal state
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [targetBudgetCategory, setTargetBudgetCategory] = useState('Food');
  const [targetBudgetLimit, setTargetBudgetLimit] = useState('');
  const [budgetSaving, setBudgetSaving] = useState(false);

  // Add Expense Modal state
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [newDate, setNewDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [newDesc, setNewDesc] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Derive distinct month keys (e.g. ['2026-03', '2026-02', '2026-01']) from all transactions
  const availableMonths = React.useMemo(() => {
    const set = new Set<string>();
    for (const t of allTransactions) {
      if (t.date && t.date.length >= 7) {
        set.add(t.date.substring(0, 7));
      }
    }
    return Array.from(set).sort().reverse();
  }, [allTransactions]);

  const getDateQuery = (filterVal: string) => {
    if (filterVal === 'all') {
      return '';
    }
    if (filterVal === 'last_30_days') {
      const now = new Date();
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const start = past.toISOString().split('T')[0];
      const end = now.toISOString().split('T')[0];
      return `?start_date=${start}&end_date=${end}`;
    }
    // Specific month e.g. "2026-01"
    const [yStr, mStr] = filterVal.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const lastDay = new Date(y, m, 0).getDate();
    const start = `${filterVal}-01`;
    const end = `${filterVal}-${lastDay < 10 ? '0' : ''}${lastDay}`;
    return `?start_date=${start}&end_date=${end}`;
  };

  useEffect(() => {
    fetchInitial();
  }, []);

  useEffect(() => {
    fetchFilteredData(dateFilter);
  }, [dateFilter]);

  useEffect(() => {
    if (dashboardView === 'chat') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, dashboardView]);

  const fetchInitial = async () => {
    try {
      const txRes = await fetch('/api/transactions');
      if (txRes.ok) {
        const txData = await txRes.json();
        setAllTransactions(txData);
        setTransactions(txData);
      }
      fetchFilteredData('all');
      fetchSubscriptions();
    } catch (err) {
      console.error(err);
    }
  };

  const fetchFilteredData = async (filterVal: string) => {
    const query = getDateQuery(filterVal);
    try {
      const [sumRes, txRes, trRes, budRes, anomRes] = await Promise.all([
        fetch(`/api/summary${query}`),
        fetch(`/api/transactions${query}`),
        fetch(`/api/trends${query}`),
        fetch(`/api/budgets${query}`),
        fetch(`/api/anomalies${query}`),
      ]);

      if (sumRes.ok) setSummary(await sumRes.json());
      if (txRes.ok) setTransactions(await txRes.json());
      if (trRes.ok) setTrends(await trRes.json());
      if (budRes.ok) setBudgets(await budRes.json());
      if (anomRes.ok) setAnomalies(await anomRes.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSubscriptions = async () => {
    try {
      const res = await fetch('/api/subscriptions');
      if (res.ok) {
        setSubscriptions(await res.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSetBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    const limit = parseFloat(targetBudgetLimit);
    if (!targetBudgetCategory || isNaN(limit) || limit <= 0) return;

    setBudgetSaving(true);
    try {
      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: targetBudgetCategory, monthly_limit: limit }),
      });

      if (res.ok) {
        await fetchFilteredData(dateFilter);
        setIsBudgetModalOpen(false);
        setTargetBudgetLimit('');
        setStatusMessage(`Updated monthly budget for ${targetBudgetCategory} to $${limit.toFixed(2)}.`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBudgetSaving(false);
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
        // Refetch all transactions to update month list, then filtered data
        const allRes = await fetch('/api/transactions');
        if (allRes.ok) setAllTransactions(await allRes.json());
        await fetchFilteredData(dateFilter);
        await fetchSubscriptions();

        setNewDesc('');
        setNewAmount('');
        setNewCategory('');
        setIsAddExpenseOpen(false);
        setStatusMessage(`Logged $${parsedAmt.toFixed(2)} for "${newDesc.trim()}".`);
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
        const allRes = await fetch('/api/transactions');
        if (allRes.ok) setAllTransactions(await allRes.json());
        await fetchFilteredData('all');
        setDateFilter('all');
        await fetchSubscriptions();
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
        const allRes = await fetch('/api/transactions');
        if (allRes.ok) setAllTransactions(await allRes.json());
        await fetchFilteredData('all');
        setDateFilter('all');
        await fetchSubscriptions();
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
        setAllTransactions([]);
        setTrends([]);
        setSubscriptions([]);
        setBudgets([]);
        setAnomalies([]);
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

  const totalIncome = React.useMemo(() => {
    return transactions
      .filter((tx) => tx.amount > 0)
      .reduce((acc, tx) => acc + tx.amount, 0);
  }, [transactions]);

  const averageDailySpend = React.useMemo(() => {
    if (journalGroups.length === 0) return 0;
    const total = journalGroups.reduce((acc, [, item]) => acc + item.totalDailySpend, 0);
    return total / journalGroups.length;
  }, [journalGroups]);

  const topCategory = React.useMemo(() => {
    if (!summary?.category_breakdown) return null;
    let topCat = '';
    let topVal = 0;
    for (const [cat, val] of Object.entries(summary.category_breakdown)) {
      if (val > topVal) {
        topVal = val;
        topCat = cat;
      }
    }
    return topCat ? { name: topCat, amount: topVal } : null;
  }, [summary]);

  const overBudgetCategories = React.useMemo(() => {
    return budgets.filter((b) => b.status === 'exceeded');
  }, [budgets]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#090d16] text-slate-100 font-sans antialiased">
      {/* View 1: Minimalist No-Scroll Landing Page */}
      {activeTab === 'landing' ? (
        <div
          className="h-screen w-screen overflow-hidden flex flex-col relative bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${heroImage})` }}
        >
          <main className="relative z-10 px-6 max-w-3xl mx-auto flex flex-col items-center text-center pt-24 sm:pt-32">
            <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-[1.18] mb-4">
              Manage Finance Like Never Before with Agent
            </h1>

            <p className="text-base sm:text-lg text-slate-700 font-normal leading-relaxed mb-8 max-w-xl">
              Track daily expenses, set category budgets, and get actionable answers to every personal finance question.
            </p>

            <button
              onClick={() => setActiveTab('dashboard')}
              className="bg-slate-900 hover:bg-black text-white font-medium text-sm sm:text-base px-8 py-3 rounded-xl shadow-card hover:shadow-card-hover transition-all flex items-center gap-2 cursor-pointer"
            >
              <span>Get Started</span>
              <ArrowRight className="w-4 h-4 text-slate-300" />
            </button>
          </main>
        </div>
      ) : (
        /* View 2: Money Management Dashboard & Daily Journal (Dark Mode) */
        <div className="flex flex-col h-screen overflow-hidden">
          {/* Dark Dashboard Header Bar */}
          <nav className="h-14 bg-[#0f172a] border-b border-slate-800 px-6 flex items-center justify-between flex-shrink-0 z-10 shadow-subtle">
            {/* Left: Clicking brand text goes to landing page */}
            <button
              onClick={() => setActiveTab('landing')}
              className="font-bold text-sm tracking-tight text-white hover:text-indigo-400 transition-colors cursor-pointer"
            >
              Personal Finance Agent
            </button>

            {/* Right: Date Range Filter & Transaction Status */}
            <div className="flex items-center gap-3">
              {/* Date Filter Dropdown */}
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs">
                <Filter className="w-3.5 h-3.5 text-indigo-400" />
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="bg-transparent text-slate-200 text-xs font-medium focus:outline-none cursor-pointer"
                >
                  <option value="all" className="bg-slate-900 text-white">All Time</option>
                  <option value="last_30_days" className="bg-slate-900 text-white">Last 30 Days</option>
                  {availableMonths.map((m) => (
                    <option key={m} value={m} className="bg-slate-900 text-white">
                      {formatMonthLabel(m)}
                    </option>
                  ))}
                </select>
              </div>

              {summary && (
                <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 font-medium bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/60">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span className="font-mono">{summary.rows_imported} txs active</span>
                </div>
              )}
            </div>
          </nav>

          {/* Main Dashboard Layout */}
          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            <aside className="w-72 bg-[#0d1424] border-r border-slate-800 p-5 flex flex-col justify-between overflow-y-auto shadow-subtle flex-shrink-0">
              <div className="space-y-6">
                {/* The ONLY Log Daily Expense Button */}
                <button
                  onClick={() => setIsAddExpenseOpen(true)}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs py-2.5 px-4 rounded-xl shadow-card transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                >
                  <Plus className="w-4 h-4 text-white" />
                  <span>Log Daily Expense</span>
                </button>

                {/* Navigation Menu */}
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block px-2 mb-2">
                    Workspaces
                  </span>

                  <button
                    onClick={() => setDashboardView('dashboard')}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer ${
                      dashboardView === 'dashboard'
                        ? 'bg-slate-800 text-white shadow-card font-semibold border border-slate-700/70'
                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                    }`}
                  >
                    <LayoutDashboard className={`w-4 h-4 ${dashboardView === 'dashboard' ? 'text-amber-300' : 'text-slate-400'}`} />
                    <span>Dashboard</span>
                  </button>

                  <button
                    onClick={() => setDashboardView('journal')}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer ${
                      dashboardView === 'journal'
                        ? 'bg-slate-800 text-white shadow-card font-semibold border border-slate-700/70'
                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                    }`}
                  >
                    <BookOpen className={`w-4 h-4 ${dashboardView === 'journal' ? 'text-amber-300' : 'text-slate-400'}`} />
                    <span>Daily Journal</span>
                    {journalGroups.length > 0 && (
                      <span className={`ml-auto text-xs font-mono font-medium px-2 py-0.5 rounded-full ${
                        dashboardView === 'journal' ? 'bg-slate-900 text-slate-300 border border-slate-700' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {journalGroups.length}d
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setDashboardView('chat')}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer ${
                      dashboardView === 'chat'
                        ? 'bg-slate-800 text-white shadow-card font-semibold border border-slate-700/70'
                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                    }`}
                  >
                    <MessageSquare className={`w-4 h-4 ${dashboardView === 'chat' ? 'text-amber-300' : 'text-slate-400'}`} />
                    <span>Chat Copilot</span>
                    {messages.length > 0 && (
                      <span className={`ml-auto text-xs font-mono font-medium px-2 py-0.5 rounded-full ${
                        dashboardView === 'chat' ? 'bg-slate-900 text-slate-300 border border-slate-700' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {messages.length}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setDashboardView('subscriptions')}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer ${
                      dashboardView === 'subscriptions'
                        ? 'bg-slate-800 text-white shadow-card font-semibold border border-slate-700/70'
                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                    }`}
                  >
                    <Repeat className={`w-4 h-4 ${dashboardView === 'subscriptions' ? 'text-amber-300' : 'text-slate-400'}`} />
                    <span>Subscriptions</span>
                    {subscriptions.length > 0 && (
                      <span className={`ml-auto text-xs font-mono font-bold px-2 py-0.5 rounded-full ${
                        dashboardView === 'subscriptions' ? 'bg-indigo-600 text-white' : 'bg-indigo-950/60 text-indigo-300 border border-indigo-800/50'
                      }`}>
                        {subscriptions.length}
                      </span>
                    )}
                  </button>
                </div>

                <div className="h-[1px] bg-slate-800" />

                {/* Data Ingestion Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block px-1">
                      Statement Ingestion
                    </span>
                    <span className="text-xs font-medium text-slate-400 bg-slate-800 px-2 py-0.5 rounded font-mono border border-slate-700/60">
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
                    className={`border border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                      isDragOver
                        ? 'border-indigo-500 bg-indigo-950/40'
                        : 'border-slate-700 hover:border-indigo-500 hover:bg-slate-800/40 bg-slate-900/40'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-800 shadow-subtle border border-slate-700 flex items-center justify-center mx-auto mb-2 text-indigo-400">
                      <Upload className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-semibold text-slate-200 block">
                      {uploadLoading ? 'Processing file...' : 'Import Statement (CSV/PDF)'}
                    </span>
                    <span className="text-xs text-slate-400 block mt-1">Stored private & local</span>
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
                    className="w-full bg-slate-800/80 hover:bg-slate-800 text-slate-200 font-medium text-xs py-2.5 px-3 rounded-lg border border-slate-700 shadow-subtle transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {uploadLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    )}
                    <span>Load sample transactions.csv</span>
                  </button>

                  {statusMessage && (
                    <div className="bg-emerald-950/50 text-emerald-300 text-xs p-3 rounded-lg border border-emerald-800/60 flex items-start gap-2 shadow-subtle">
                      <span className="leading-snug">{statusMessage}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Export and Clear Data Footer */}
              <div className="pt-4 border-t border-slate-800 space-y-2">
                {summary && summary.rows_imported > 0 && (
                  <div className="flex gap-2">
                    <a
                      href={`/api/export/csv${getDateQuery(dateFilter)}`}
                      download="transactions_export.csv"
                      className="flex-1 bg-slate-800/80 hover:bg-slate-800 text-slate-200 font-medium text-xs py-2 px-2 rounded-lg border border-slate-700 transition flex items-center justify-center gap-1 shadow-subtle"
                      title="Download CSV for selected period"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-400" />
                      <span>CSV</span>
                    </a>
                    <button
                      onClick={() => setIsStatementOpen(true)}
                      className="flex-1 bg-slate-800/80 hover:bg-slate-800 text-slate-200 font-medium text-xs py-2 px-2 rounded-lg border border-slate-700 transition flex items-center justify-center gap-1 shadow-subtle cursor-pointer"
                      title="Print or Save as PDF"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-400" />
                      <span>PDF</span>
                    </button>
                    <a
                      href={`/api/export/json${getDateQuery(dateFilter)}`}
                      download="financial_audit.json"
                      className="flex-1 bg-slate-800/80 hover:bg-slate-800 text-slate-200 font-medium text-xs py-2 px-2 rounded-lg border border-slate-700 transition flex items-center justify-center gap-1 shadow-subtle"
                      title="Download JSON audit"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-400" />
                      <span>JSON</span>
                    </a>
                  </div>
                )}
                <button
                  onClick={handleClearData}
                  className="w-full text-rose-400 hover:bg-rose-950/40 hover:border-rose-900/50 font-medium text-xs py-2 px-3 rounded-lg border border-transparent transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Stored Data</span>
                </button>
              </div>
            </aside>

            {/* Main Content Area: View Switcher */}
            <main className="flex-1 flex flex-col h-full bg-[#090d16] overflow-hidden">
              {/* VIEW 1: Dedicated Full Dashboard Section with Budgets and Charts */}
              {dashboardView === 'dashboard' && (
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                  <header className="p-6 bg-[#0d1424] border-b border-slate-800 flex-shrink-0 shadow-subtle">
                    <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <h1 className="text-xl font-bold tracking-tight text-white">Spending Overview & Analytics</h1>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Visual spending velocity, category distribution bars, and budget health for {dateFilter === 'all' ? 'All Time' : formatMonthLabel(dateFilter)}.
                        </p>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <button
                          onClick={() => setIsBudgetModalOpen(true)}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition cursor-pointer shadow-subtle"
                        >
                          <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Set Budgets</span>
                        </button>

                        {summary && (
                          <div className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-lg text-xs font-mono font-medium text-slate-300 border border-slate-700/60">
                            <span>{summary.date_range}</span>
                            <span className="text-slate-500">•</span>
                            <span>{summary.rows_imported} txs</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </header>

                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="max-w-6xl mx-auto space-y-6">
                      {/* Over-budget Warning Alerts */}
                      {overBudgetCategories.length > 0 && (
                        <div className="p-4 bg-rose-950/40 border border-rose-800/80 rounded-2xl flex items-center justify-between gap-3 shadow-card animate-in fade-in duration-200">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-rose-900/60 border border-rose-700/60 flex items-center justify-center text-rose-400 flex-shrink-0">
                              <AlertTriangle className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-rose-300 uppercase tracking-wider">
                                Over-Budget Alert
                              </h4>
                              <p className="text-xs text-rose-200/90 mt-0.5">
                                {overBudgetCategories.map((b) => `${b.category} (${b.percentage.toFixed(0)}%)`).join(', ')} exceeded monthly spending limits!
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => setIsBudgetModalOpen(true)}
                            className="bg-rose-900/60 hover:bg-rose-850 text-rose-200 border border-rose-700 text-xs font-medium py-1.5 px-3 rounded-lg transition cursor-pointer"
                          >
                            Adjust Targets
                          </button>
                        </div>
                      )}

                      {/* Spending Anomalies Alert Banner */}
                      {anomalies.length > 0 && (
                        <div className="p-4 bg-amber-950/40 border border-amber-800/80 rounded-2xl flex items-center justify-between gap-3 shadow-card animate-in fade-in duration-200">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-amber-900/60 border border-amber-700/60 flex items-center justify-center text-amber-400 flex-shrink-0">
                              <AlertOctagon className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                                Unusual Spending Spike Alert ({anomalies.length} Detected)
                              </h4>
                              <p className="text-xs text-amber-200/90 mt-0.5">
                                {anomalies.slice(0, 2).map((a) => `${a.description} ($${a.amount.toFixed(2)})`).join(', ')}
                                {anomalies.length > 2 && ` and ${anomalies.length - 2} other unusual transactions`}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setDashboardView('journal');
                              setSearchQuery(anomalies[0].description);
                            }}
                            className="bg-amber-900/60 hover:bg-amber-850 text-amber-200 border border-amber-700 text-xs font-medium py-1.5 px-3 rounded-lg transition cursor-pointer flex-shrink-0"
                          >
                            Inspect Journal
                          </button>
                        </div>
                      )}

                      {/* Top KPI Metrics Row */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="p-5 bg-[#11192e] rounded-2xl border border-slate-800 shadow-card">
                          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">
                            Total Outflow / Spending
                          </span>
                          <span className="text-2xl font-bold font-mono text-white mt-1 block">
                            ${summary ? summary.total_spending.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                          </span>
                          <span className="text-xs text-slate-500 block mt-1">
                            {summary?.rows_imported || 0} debit transactions
                          </span>
                        </div>

                        <div className="p-5 bg-[#11192e] rounded-2xl border border-slate-800 shadow-card">
                          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">
                            Total Inflow / Income
                          </span>
                          <span className="text-2xl font-bold font-mono text-emerald-400 mt-1 block">
                            ${totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-xs text-slate-500 block mt-1">Salary & deposits</span>
                        </div>

                        <div className="p-5 bg-[#11192e] rounded-2xl border border-slate-800 shadow-card">
                          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">
                            Average Daily Spending
                          </span>
                          <span className="text-2xl font-bold font-mono text-white mt-1 block">
                            ${averageDailySpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-xs text-slate-500 block mt-1">Across {journalGroups.length} logged days</span>
                        </div>

                        <div className="p-5 bg-[#11192e] rounded-2xl border border-slate-800 shadow-card">
                          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">
                            Top Spending Category
                          </span>
                          <span className="text-2xl font-bold font-mono text-indigo-400 mt-1 block">
                            {topCategory ? topCategory.name : 'None'}
                          </span>
                          <span className="text-xs text-slate-500 block mt-1 font-mono">
                            {topCategory ? `$${topCategory.amount.toFixed(2)} total` : 'No data'}
                          </span>
                        </div>
                      </div>

                      {/* Monthly Category Budgets Section */}
                      <div className="p-6 bg-[#11192e] rounded-2xl border border-slate-800 shadow-card">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                              <span>Monthly Category Budgets</span>
                              {overBudgetCategories.length > 0 && (
                                <span className="bg-rose-950 text-rose-300 border border-rose-800/80 text-[11px] font-mono px-2 py-0.5 rounded-full">
                                  {overBudgetCategories.length} Exceeded
                                </span>
                              )}
                            </h3>
                            <p className="text-xs text-slate-400">Track real-time spending caps against monthly targets.</p>
                          </div>
                          <button
                            onClick={() => setIsBudgetModalOpen(true)}
                            className="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition cursor-pointer"
                          >
                            <Sliders className="w-3.5 h-3.5" />
                            <span>Edit Targets</span>
                          </button>
                        </div>

                        {budgets.length === 0 ? (
                          <div className="text-center py-6 text-xs text-slate-500">
                            No budget data available. Import statement transactions or click "Edit Targets" to set limits.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {budgets.map((b) => {
                              const remaining = b.monthly_limit - b.current_spent;
                              return (
                                <div
                                  key={b.category}
                                  className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl space-y-2.5 hover:border-slate-700 transition"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span
                                        className="w-2.5 h-2.5 rounded-full"
                                        style={{ backgroundColor: CATEGORY_COLORS[b.category] || '#64748b' }}
                                      />
                                      <span className="text-xs font-semibold text-slate-200">{b.category}</span>
                                    </div>
                                    <span
                                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full font-mono border ${
                                        b.status === 'exceeded'
                                          ? 'bg-rose-950/70 text-rose-300 border-rose-800/80'
                                          : b.status === 'warning'
                                          ? 'bg-amber-950/70 text-amber-300 border-amber-800/80'
                                          : 'bg-emerald-950/70 text-emerald-300 border-emerald-800/80'
                                      }`}
                                    >
                                      {b.percentage.toFixed(0)}%
                                    </span>
                                  </div>

                                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all duration-300 ${
                                        b.status === 'exceeded'
                                          ? 'bg-rose-500'
                                          : b.status === 'warning'
                                          ? 'bg-amber-500'
                                          : 'bg-emerald-500'
                                      }`}
                                      style={{ width: `${Math.min(b.percentage, 100)}%` }}
                                    />
                                  </div>

                                  <div className="flex items-center justify-between text-xs font-mono">
                                    <span className="text-slate-400">
                                      ${b.current_spent.toFixed(0)} / ${b.monthly_limit.toFixed(0)}
                                    </span>
                                    <span
                                      className={
                                        remaining >= 0 ? 'text-slate-400' : 'text-rose-400 font-semibold'
                                      }
                                    >
                                      {remaining >= 0
                                        ? `$${remaining.toFixed(0)} left`
                                        : `$${Math.abs(remaining).toFixed(0)} over`}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Charts Grid: Bar Chart & Spending Velocity Area Chart */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Chart 1: Category Distribution Bar Chart */}
                        <div className="p-6 bg-[#11192e] rounded-2xl border border-slate-800 shadow-card flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between mb-4">
                              <div>
                                <h3 className="text-sm font-bold text-white">Category Spending Distribution</h3>
                                <p className="text-xs text-slate-400">Expenditure broken down across expense types.</p>
                              </div>
                              <span className="text-xs font-mono font-medium text-slate-300 bg-slate-800 px-2.5 py-1 rounded-md border border-slate-700/60">
                                Bar Chart
                              </span>
                            </div>

                            {chartData.length > 0 ? (
                              <div className="h-64 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                                    <XAxis
                                      dataKey="name"
                                      angle={-25}
                                      textAnchor="end"
                                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                                      interval={0}
                                    />
                                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                    <Tooltip
                                      contentStyle={{
                                        backgroundColor: '#020617',
                                        borderRadius: '8px',
                                        border: '1px solid #334155',
                                        color: '#f8fafc',
                                        fontSize: '11px',
                                      }}
                                      formatter={(val: number) => [`$${val.toFixed(2)}`, 'Spend']}
                                    />
                                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
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
                            ) : (
                              <div className="h-64 flex items-center justify-center text-xs text-slate-500">
                                No category data for this time period.
                              </div>
                            )}
                          </div>

                          {summary && summary.category_breakdown && (
                            <div className="pt-4 border-t border-slate-800 grid grid-cols-2 gap-3 text-xs">
                              {Object.entries(summary.category_breakdown).slice(0, 6).map(([cat, val]) => {
                                const pct = summary.total_spending > 0 ? (val / summary.total_spending) * 100 : 0;
                                return (
                                  <div key={cat} className="space-y-1">
                                    <div className="flex justify-between items-center text-xs">
                                      <span className="font-medium text-slate-300">{cat}</span>
                                      <span className="font-mono text-slate-400 font-semibold">${val.toFixed(0)}</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                      <div
                                        className="h-full rounded-full"
                                        style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: CATEGORY_COLORS[cat] || '#64748b' }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Chart 2: Cumulative Spending Velocity Area Chart */}
                        <div className="p-6 bg-[#11192e] rounded-2xl border border-slate-800 shadow-card flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between mb-4">
                              <div>
                                <h3 className="text-sm font-bold text-white">Cumulative Spending Velocity</h3>
                                <p className="text-xs text-slate-400">Day-over-day expenditure acceleration and cumulative burn.</p>
                              </div>
                              <span className="text-xs font-mono font-medium text-slate-300 bg-slate-800 px-2.5 py-1 rounded-md border border-slate-700/60">
                                Area Trend
                              </span>
                            </div>

                            {trends.length > 0 ? (
                              <div className="h-64 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                  <AreaChart data={trends} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                                    <defs>
                                      <linearGradient id="dashboardVelocityGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.45} />
                                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                                      </linearGradient>
                                    </defs>
                                    <XAxis
                                      dataKey="date"
                                      angle={-25}
                                      textAnchor="end"
                                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                                      interval={Math.ceil(trends.length / 5)}
                                    />
                                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                    <Tooltip
                                      contentStyle={{
                                        backgroundColor: '#020617',
                                        borderRadius: '8px',
                                        border: '1px solid #334155',
                                        color: '#f8fafc',
                                        fontSize: '11px',
                                      }}
                                      formatter={(val: number) => [`$${val.toFixed(2)}`, 'Cumulative']}
                                    />
                                    <Area
                                      type="monotone"
                                      dataKey="cumulative"
                                      stroke="#6366f1"
                                      strokeWidth={2}
                                      fillOpacity={1}
                                      fill="url(#dashboardVelocityGrad)"
                                    />
                                  </AreaChart>
                                </ResponsiveContainer>
                              </div>
                            ) : (
                              <div className="h-64 flex items-center justify-center text-xs text-slate-500">
                                No trend data for this time period.
                              </div>
                            )}
                          </div>

                          <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                            <span>Tracked across {trends.length} chronological points</span>
                            <span className="font-mono font-semibold text-slate-200">
                              Peak Cumulative: ${trends.length > 0 ? trends[trends.length - 1].cumulative.toFixed(2) : '0.00'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* VIEW 2: Daily Spending Journal */}
              {dashboardView === 'journal' && (
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                  <header className="p-6 bg-[#0d1424] border-b border-slate-800 flex-shrink-0 shadow-subtle">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 max-w-4xl mx-auto">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-800 text-white flex items-center justify-center shadow-subtle border border-slate-700">
                          <BookOpen className="w-5 h-5 text-amber-300" />
                        </div>
                        <div>
                          <h1 className="text-xl font-bold tracking-tight text-white">Daily Expense Journal</h1>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Day-by-day record of personal expenditures ({dateFilter === 'all' ? 'All Time' : formatMonthLabel(dateFilter)}).
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <div className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 border border-slate-700/60">
                          <span className="font-mono font-bold text-white">
                            {journalGroups.length} Days
                          </span>
                          <span className="text-slate-500">•</span>
                          <span className="text-slate-400 font-mono">
                            {transactions.length} Entries
                          </span>
                        </div>
                      </div>
                    </div>
                  </header>

                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {journalGroups.length === 0 ? (
                      <div className="max-w-md mx-auto my-12 text-center p-8 bg-[#11192e] border border-slate-800 rounded-2xl shadow-card">
                        <div className="w-12 h-12 rounded-full bg-indigo-950/60 text-indigo-400 border border-indigo-800/60 flex items-center justify-center mx-auto mb-3">
                          <BookOpen className="w-6 h-6" />
                        </div>
                        <h3 className="text-sm font-bold text-white mb-1">No Entries For This Filter</h3>
                        <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                          No transactions recorded in the selected date range. Try switching to "All Time" or log an expense.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
                          <button
                            onClick={() => setIsAddExpenseOpen(true)}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-2.5 px-4 rounded-xl transition shadow-subtle flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5 text-white" />
                            <span>Log Today's Expense</span>
                          </button>
                          <button
                            onClick={() => setDateFilter('all')}
                            className="bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-medium py-2.5 px-4 rounded-xl border border-slate-700 transition shadow-subtle flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <span>Show All Time</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="max-w-4xl mx-auto space-y-5">
                        {journalGroups.map(([dateStr, { transactions: dayTxs, totalDailySpend }]) => (
                          <div
                            key={dateStr}
                            className="bg-[#11192e] border border-slate-800 rounded-2xl overflow-hidden shadow-card hover:border-slate-700 transition-all duration-200"
                          >
                            <div className="px-5 py-3.5 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-slate-400" />
                                <span className="font-semibold text-xs text-slate-200">
                                  {formatJournalDate(dateStr)}
                                </span>
                                <span className="text-xs text-slate-500 font-mono">
                                  ({dayTxs.length} {dayTxs.length === 1 ? 'item' : 'items'})
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-slate-800 text-slate-200 border border-slate-700/80 shadow-subtle">
                                  ${totalDailySpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} spent
                                </span>
                              </div>
                            </div>

                            <div className="divide-y divide-slate-800/60">
                              {dayTxs.map((tx, idx) => (
                                <div
                                  key={idx}
                                  className="px-5 py-3.5 flex items-center justify-between hover:bg-slate-800/40 transition-colors"
                                >
                                  <div className="flex items-center gap-3">
                                    <div
                                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: CATEGORY_COLORS[tx.category] || '#64748b' }}
                                    />
                                    <div>
                                      <p className="text-sm font-medium text-slate-200 leading-snug">
                                        {tx.description}
                                      </p>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <span
                                          className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                                            CATEGORY_BADGES[tx.category] || 'bg-slate-800 text-slate-300 border-slate-700'
                                          }`}
                                        >
                                          {tx.category}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="text-right">
                                    <span
                                      className={`font-mono font-semibold text-sm ${
                                        tx.amount < 0 ? 'text-slate-100' : 'text-emerald-400'
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

              {/* VIEW 3: Recurring Subscriptions & Bills */}
              {dashboardView === 'subscriptions' && (
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                  <header className="p-6 bg-[#0d1424] border-b border-slate-800 flex-shrink-0 shadow-subtle">
                    <div className="max-w-5xl mx-auto">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-800 text-white flex items-center justify-center shadow-subtle border border-slate-700">
                          <Repeat className="w-5 h-5 text-amber-300" />
                        </div>
                        <div>
                          <h1 className="text-xl font-bold tracking-tight text-white">Recurring Subscriptions & Bills</h1>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Autonomous pattern detection analyzes billing frequencies to highlight regular commitments and monthly burn.
                          </p>
                        </div>
                      </div>

                      {/* Subscription KPI Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-5">
                        <div className="p-4 bg-[#11192e] rounded-xl border border-slate-800 shadow-subtle">
                          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">
                            Fixed Monthly Burn
                          </span>
                          <span className="text-2xl font-bold font-mono text-white mt-1 block">
                            ${totalMonthlySubscriptions.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-xs text-slate-500 block mt-1">Per billing month</span>
                        </div>

                        <div className="p-4 bg-[#11192e] rounded-xl border border-slate-800 shadow-subtle">
                          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">
                            Projected Annual Cost
                          </span>
                          <span className="text-2xl font-bold font-mono text-indigo-400 mt-1 block">
                            ${(totalMonthlySubscriptions * 12).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-xs text-slate-500 block mt-1">Annual recurring commitments</span>
                        </div>

                        <div className="p-4 bg-[#11192e] rounded-xl border border-slate-800 shadow-subtle">
                          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">
                            Detected Services
                          </span>
                          <span className="text-2xl font-bold font-mono text-white mt-1 block">
                            {subscriptions.length} Services
                          </span>
                          <span className="text-xs text-slate-500 block mt-1">Repeating cadence identified</span>
                        </div>
                      </div>
                    </div>
                  </header>

                  <div className="flex-1 overflow-y-auto p-6">
                    {subscriptions.length === 0 ? (
                      <div className="max-w-md mx-auto my-12 text-center p-8 bg-[#11192e] border border-slate-800 rounded-2xl shadow-card">
                        <div className="w-12 h-12 rounded-full bg-indigo-950/60 text-indigo-400 border border-indigo-800/60 flex items-center justify-center mx-auto mb-3">
                          <Repeat className="w-6 h-6" />
                        </div>
                        <h3 className="text-sm font-bold text-white mb-1">No Subscriptions Detected</h3>
                        <p className="text-xs text-slate-400 mb-5 leading-relaxed">
                          Subscriptions and repeating bills are automatically recognized when the same merchant and charge appear across 2 or more cycles.
                        </p>
                        <button
                          onClick={handleLoadSample}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium py-2.5 px-4 rounded-xl transition shadow-subtle inline-flex items-center gap-2 cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-white" />
                          <span>Load Sample Statements with Subscriptions</span>
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
                        {subscriptions.map((sub, idx) => (
                          <div
                            key={idx}
                            className="bg-[#11192e] border border-slate-800 rounded-2xl p-5 shadow-card hover:border-slate-700 transition-all duration-200 flex flex-col justify-between"
                          >
                            <div>
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <h3 className="text-sm font-bold text-white leading-snug">
                                  {sub.merchant}
                                </h3>
                                <span
                                  className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${
                                    CATEGORY_BADGES[sub.category] || 'bg-slate-800 text-slate-300 border-slate-700'
                                  }`}
                                >
                                  {sub.category}
                                </span>
                              </div>

                              <div className="my-3">
                                <div className="flex items-baseline gap-1">
                                  <span className="text-2xl font-extrabold font-mono text-white">
                                    ${sub.amount.toFixed(2)}
                                  </span>
                                  <span className="text-xs text-slate-400 font-medium">/ month</span>
                                </div>
                                <span className="text-xs text-slate-400 block mt-1">
                                  ~ ${(sub.amount * 12).toFixed(2)} / year
                                </span>
                              </div>
                            </div>

                            <div className="pt-3.5 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
                              <span>Billed {sub.occurrences} times</span>
                              <span>Last: {sub.last_date}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* VIEW 4: Chat Copilot Workspace */}
              {dashboardView === 'chat' && (
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                  <header className="p-6 bg-[#0d1424] border-b border-slate-800 flex-shrink-0 shadow-subtle">
                    <div className="max-w-4xl mx-auto">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-800 text-white flex items-center justify-center shadow-subtle border border-slate-700">
                          <Bot className="w-5 h-5 text-amber-300" />
                        </div>
                        <div>
                          <h1 className="text-xl font-bold tracking-tight text-white">Financial Intelligence Copilot</h1>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Ask natural language questions about your spending, budget suggestions, and expense patterns.
                          </p>
                        </div>
                      </div>

                      {/* Transaction Preview Accordion */}
                      {transactions.length > 0 && (
                        <div className="mt-4 border border-slate-800 rounded-xl overflow-hidden bg-[#11192e] shadow-subtle">
                          <button
                            onClick={() => setPreviewOpen(!previewOpen)}
                            className="w-full flex items-center justify-between p-3 bg-slate-900/80 hover:bg-slate-800 text-xs font-semibold text-slate-200 transition cursor-pointer"
                          >
                            <span className="flex items-center gap-2">
                              <span>Transaction preview</span>
                              <span className="bg-indigo-950 text-indigo-300 font-mono text-xs px-2 py-0.5 rounded-full border border-indigo-800/60">
                                {transactions.length} rows
                              </span>
                            </span>
                            {previewOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                          </button>
                          {previewOpen && (
                            <div className="border-t border-slate-800">
                              <div className="p-3 bg-slate-900/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                                <div className="relative flex-1 min-w-[200px]">
                                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                  <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search merchant or date (e.g. Starbucks, 2026-01)..."
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-subtle"
                                  />
                                  {searchQuery && (
                                    <button
                                      onClick={() => setSearchQuery('')}
                                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5">
                                  {['All', 'Food', 'Transport', 'Entertainment', 'Utilities', 'Shopping', 'Health', 'Other'].map((cat) => (
                                    <button
                                      key={cat}
                                      onClick={() => setSelectedCategory(cat)}
                                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition cursor-pointer ${
                                        selectedCategory === cat
                                          ? 'bg-indigo-600 text-white font-semibold'
                                          : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-700'
                                      }`}
                                    >
                                      {cat}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div className="max-h-56 overflow-y-auto text-xs">
                                {filteredTransactions.length === 0 ? (
                                  <div className="p-6 text-center text-slate-500">
                                    No transactions match the selected filter.
                                  </div>
                                ) : (
                                  <table className="w-full text-left">
                                    <thead className="bg-slate-900 sticky top-0 border-b border-slate-800 text-slate-400 uppercase text-xs tracking-wider font-semibold">
                                      <tr>
                                        <th className="p-2.5 pl-4">Date</th>
                                        <th className="p-2.5">Description</th>
                                        <th className="p-2.5">Category</th>
                                        <th className="p-2.5 pr-4 text-right">Amount</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800">
                                      {filteredTransactions.map((tx, idx) => (
                                        <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                                          <td className="p-2.5 pl-4 whitespace-nowrap text-slate-400 font-mono text-xs">{tx.date}</td>
                                          <td className="p-2.5 font-medium text-slate-200">{tx.description}</td>
                                          <td className="p-2.5">
                                            <span
                                              className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${
                                                CATEGORY_BADGES[tx.category] || 'bg-slate-800 text-slate-300 border-slate-700'
                                              }`}
                                            >
                                              {tx.category}
                                            </span>
                                          </td>
                                          <td className={`p-2.5 pr-4 text-right font-mono font-semibold ${tx.amount < 0 ? 'text-slate-100' : 'text-emerald-400'}`}>
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

                      {transactions.length === 0 && (
                        <div className="mt-4 bg-indigo-950/40 text-indigo-300 border border-indigo-800/60 p-3.5 rounded-xl text-xs flex items-center gap-2.5 shadow-subtle">
                          <AlertCircle className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                          <span>No transactions loaded yet. Upload a statement in the sidebar or click <strong>Load sample transactions.csv</strong> to test.</span>
                        </div>
                      )}

                      <div className="mt-4 flex flex-wrap gap-2">
                        {SAMPLE_QUESTIONS.map((q) => (
                          <button
                            key={q}
                            onClick={() => handleSendMessage(q)}
                            className="text-xs bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white hover:border-indigo-500 py-1.5 px-3 rounded-full border border-slate-700 transition-all flex items-center gap-1.5 shadow-subtle cursor-pointer group"
                          >
                            <span>{q}</span>
                            <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </header>

                  <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    <div className="max-w-4xl mx-auto space-y-5">
                      {messages.map((msg, index) => (
                        <div
                          key={index}
                          className={`flex gap-3.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          {msg.role === 'assistant' && (
                            <div className="w-8 h-8 rounded-lg bg-slate-800 text-white flex items-center justify-center flex-shrink-0 shadow-subtle border border-slate-700">
                              <Bot className="w-4 h-4 text-amber-300" />
                            </div>
                          )}
                          <div
                            className={`max-w-2xl rounded-2xl p-4 text-xs leading-relaxed ${
                              msg.role === 'user'
                                ? 'bg-indigo-600 text-white shadow-card'
                                : 'bg-[#11192e] text-slate-200 border border-slate-800 shadow-card'
                            }`}
                          >
                            <div className={`prose ${msg.role === 'user' ? 'text-white prose-invert' : 'text-slate-200 prose-invert'}`}>
                              <ReactMarkdown>{msg.content}</ReactMarkdown>
                            </div>

                            {msg.role === 'assistant' && index === messages.length - 1 && (
                              <div className="mt-3.5 pt-2.5 border-t border-slate-800 flex justify-end">
                                <button
                                  onClick={handleDownloadHistory}
                                  className="text-xs font-medium text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition cursor-pointer"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>Download chat log</span>
                                </button>
                              </div>
                            )}
                          </div>
                          {msg.role === 'user' && (
                            <div className="w-8 h-8 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 flex items-center justify-center flex-shrink-0 shadow-subtle">
                              <User className="w-4 h-4" />
                            </div>
                          )}
                        </div>
                      ))}

                      {loading && (
                        <div className="flex gap-3.5 items-center text-slate-400 text-xs">
                          <div className="w-8 h-8 rounded-lg bg-slate-800 text-white flex items-center justify-center flex-shrink-0 shadow-subtle border border-slate-700">
                            <Bot className="w-4 h-4 text-amber-300" />
                          </div>
                          <div className="flex items-center gap-2.5 bg-[#11192e] p-3.5 rounded-2xl border border-slate-800 shadow-card">
                            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                            <span className="font-medium text-slate-300 text-xs">Analyzing financial database...</span>
                          </div>
                        </div>
                      )}

                      <div ref={chatBottomRef} />
                    </div>
                  </div>

                  <div className="p-4 border-t border-slate-800 bg-[#0d1424] shadow-subtle">
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
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition shadow-subtle"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={loading || !inputPrompt.trim()}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-5 py-3 rounded-xl text-xs font-semibold transition shadow-subtle flex items-center gap-2 cursor-pointer"
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

          {/* Modal: Set Monthly Category Budget */}
          {isBudgetModalOpen && (
            <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
              <div
                className="bg-[#11192e] rounded-2xl border border-slate-700 shadow-2xl max-w-md w-full overflow-hidden text-white animate-in fade-in duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-950/70 border border-indigo-800/60 text-indigo-400 flex items-center justify-center shadow-subtle">
                      <Sliders className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Set Category Budget</h3>
                      <p className="text-xs text-slate-400">Configure monthly expenditure ceiling.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsBudgetModalOpen(false)}
                    className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleSetBudget} className="p-6 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                      Category
                    </label>
                    <select
                      value={targetBudgetCategory}
                      onChange={(e) => setTargetBudgetCategory(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 shadow-subtle cursor-pointer"
                    >
                      {['Food', 'Transport', 'Entertainment', 'Utilities', 'Shopping', 'Health', 'Other'].map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                      Monthly Limit ($)
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      required
                      placeholder="e.g. 500"
                      value={targetBudgetLimit}
                      onChange={(e) => setTargetBudgetLimit(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 shadow-subtle"
                    />
                  </div>

                  <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setIsBudgetModalOpen(false)}
                      className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={budgetSaving || !targetBudgetLimit}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs py-2.5 px-4 rounded-xl shadow-subtle transition flex items-center gap-1.5 cursor-pointer"
                    >
                      {budgetSaving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>Save Budget Limit</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal: Log Daily Expense */}
          {isAddExpenseOpen && (
            <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
              <div
                className="bg-[#11192e] rounded-2xl border border-slate-700 shadow-2xl max-w-md w-full overflow-hidden text-white animate-in fade-in duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-950/70 border border-indigo-800/60 text-indigo-400 flex items-center justify-center shadow-subtle">
                      <Plus className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Log Daily Expense</h3>
                      <p className="text-xs text-slate-400">Record a personal purchase into your journal.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsAddExpenseOpen(false)}
                    className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleCreateExpense} className="p-6 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                      Date
                    </label>
                    <input
                      type="date"
                      required
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 font-mono shadow-subtle"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                      Description / Merchant
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Philz Coffee, Groceries at Trader Joe's"
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 shadow-subtle"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
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
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 shadow-subtle"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                        Category
                      </label>
                      <select
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 shadow-subtle cursor-pointer"
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

                  <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setIsAddExpenseOpen(false)}
                      className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={addLoading || !newDesc.trim() || !newAmount}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs py-2.5 px-4 rounded-xl shadow-subtle transition flex items-center gap-1.5 cursor-pointer"
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

          {/* Modal: Financial Statement / PDF Export */}
          {isStatementOpen && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
              <div
                className="bg-[#11192e] rounded-2xl border border-slate-700 shadow-2xl max-w-2xl w-full overflow-hidden text-white animate-in fade-in duration-150 my-8"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between no-print">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-950/70 border border-indigo-800/60 text-indigo-400 flex items-center justify-center shadow-subtle">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Financial Statement</h3>
                      <p className="text-xs text-slate-400">Print or export document as PDF.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => window.print()}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2 px-3 rounded-lg shadow-subtle transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print / Save as PDF</span>
                    </button>
                    <button
                      onClick={() => setIsStatementOpen(false)}
                      className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Printable Statement Container */}
                <div id="printable-statement" className="p-6 md:p-8 space-y-6 max-h-[80vh] overflow-y-auto">
                  <div className="border-b border-slate-700/80 pb-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h2 className="text-xl font-bold tracking-tight text-white">Personal Finance Statement</h2>
                        <p className="text-xs text-slate-400 mt-1">
                          Period: <span className="font-semibold text-slate-200">{dateFilter === 'all' ? 'All Time' : dateFilter}</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-slate-400 block">Generated On</span>
                        <span className="text-xs font-mono font-medium text-slate-300">
                          {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Summary Metric Strip */}
                  <div className="grid grid-cols-3 gap-3 p-4 bg-slate-900/60 rounded-xl border border-slate-800">
                    <div>
                      <span className="text-xs text-slate-400 block uppercase tracking-wider">Total Outflow</span>
                      <span className="text-lg font-bold font-mono text-rose-400">
                        ${summary ? summary.total_spending.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-slate-400 block uppercase tracking-wider">Transactions</span>
                      <span className="text-lg font-bold font-mono text-white">
                        {transactions.length}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-slate-400 block uppercase tracking-wider">Avg Expense</span>
                      <span className="text-lg font-bold font-mono text-indigo-300">
                        ${transactions.length > 0 && summary ? (summary.total_spending / Math.max(1, transactions.filter(t => t.amount < 0).length)).toFixed(2) : '0.00'}
                      </span>
                    </div>
                  </div>

                  {/* Category Breakdown */}
                  {summary && Object.keys(summary.category_breakdown).length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Category Spending</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {Object.entries(summary.category_breakdown).map(([cat, amt]) => (
                          <div key={cat} className="p-2.5 rounded-lg bg-slate-900/40 border border-slate-800 flex justify-between items-center text-xs">
                            <span className="text-slate-300">{cat}</span>
                            <span className="font-mono font-bold text-white">${amt.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Itemized Transactions Table */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Itemized Records</h4>
                    <div className="overflow-x-auto border border-slate-800 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800">
                          <tr>
                            <th className="py-2 px-3 font-semibold">Date</th>
                            <th className="py-2 px-3 font-semibold">Description</th>
                            <th className="py-2 px-3 font-semibold">Category</th>
                            <th className="py-2 px-3 font-semibold text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {transactions.slice(0, 50).map((t, idx) => (
                            <tr key={idx} className="hover:bg-slate-900/30">
                              <td className="py-2 px-3 text-slate-400 whitespace-nowrap">{t.date}</td>
                              <td className="py-2 px-3 text-slate-200 font-sans">{t.description}</td>
                              <td className="py-2 px-3 text-slate-300 font-sans">{t.category}</td>
                              <td className={`py-2 px-3 text-right font-bold ${t.amount < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                {t.amount < 0 ? `-$${Math.abs(t.amount).toFixed(2)}` : `+$${t.amount.toFixed(2)}`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {transactions.length > 50 && (
                      <p className="text-xs text-slate-500 mt-2 text-center no-print">
                        Showing first 50 transactions. Use CSV export for full records.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
