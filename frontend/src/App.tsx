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
  Filter,
  X,
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

const SAMPLE_QUESTIONS = [
  "How much did I spend on food last month?",
  "What's my biggest unnecessary expense?",
  "Break down my spending by category.",
  "Suggest a weekly budget plan based on my habits.",
  "How much did I spend on transport in the last 7 days?",
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

export default function App() {
  const [activeTab, setActiveTab] = useState<'landing' | 'dashboard'>('landing');
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchSummary();
    fetchTransactions();
    fetchTrends();
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

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

  const handleLoadSample = async () => {
    setUploadLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/sample', { method: 'POST' });
      if (res.ok) {
        const data: ImportSummary = await res.json();
        setSummary(data);
        fetchTransactions();
        fetchTrends();
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
        fetchTransactions();
        fetchTrends();
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
              Upload your bank statements, track spending habits, and get clear answers to every financial question.
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
        /* View 2: Copilot Dashboard */
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

            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('landing')}
                className="text-xs text-slate-500 hover:text-slate-800 transition"
              >
                Overview
              </button>
            </div>
          </nav>

          {/* Main Dashboard Layout */}
          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            <aside className="w-84 bg-white border-r border-slate-200/80 p-5 flex flex-col justify-between overflow-y-auto shadow-[1px_0_4px_rgba(0,0,0,0.02)] flex-shrink-0">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold tracking-tight text-slate-900 flex items-center gap-2">
                    <Database className="w-4 h-4 text-indigo-600" />
                    Data
                  </h2>
                  <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    SQLite
                  </span>
                </div>

                {/* File Upload */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Upload bank statement or transaction CSV/PDF
                  </label>
                  <p className="text-[11px] leading-relaxed text-slate-500 mb-2.5">
                    CSV should include date, description, and amount (or debit/credit columns). PDF bank statements are also supported.
                  </p>
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
                    className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all duration-200 ${
                      isDragOver
                        ? 'border-indigo-500 bg-indigo-50/50 scale-[0.99]'
                        : 'border-slate-200 hover:border-indigo-400 hover:bg-slate-50/60 bg-slate-50/30'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full bg-white shadow-xs border border-slate-200/80 flex items-center justify-center mx-auto mb-2 text-indigo-600">
                      <Upload className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-semibold text-slate-700 block">
                      {uploadLoading ? 'Processing file...' : 'Choose file or drag & drop'}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">CSV or PDF (Max 10MB)</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.pdf"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </div>
                </div>

                {/* Load Sample Button */}
                <button
                  onClick={handleLoadSample}
                  disabled={uploadLoading}
                  className="w-full bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs py-2.5 px-3 rounded-lg border border-slate-200 shadow-2xs hover:border-slate-300 transition-all flex items-center justify-center gap-2 group active:scale-[0.99]"
                >
                  {uploadLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600 transition-transform group-hover:scale-110" />
                  )}
                  Load sample transactions.csv
                </button>

                {/* Status Message */}
                {statusMessage && (
                  <div className="bg-emerald-50/80 text-emerald-800 text-xs p-3 rounded-lg border border-emerald-200 flex items-start gap-2 shadow-2xs">
                    <span className="leading-tight">{statusMessage}</span>
                  </div>
                )}

                {/* Summary KPIs & Chart */}
                {summary && summary.rows_imported > 0 && (
                  <div className="space-y-4 pt-1">
                    <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-4 rounded-xl text-white shadow-sm border border-slate-800">
                      <span className="text-[11px] font-medium text-slate-300 uppercase tracking-wider block mb-1">
                        Total spending
                      </span>
                      <span className="text-2xl font-bold tracking-tight text-white">
                        ${summary.total_spending.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-1">
                        Across {summary.rows_imported} transactions
                      </span>
                    </div>

                    <div>
                      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
                        Category totals
                      </h3>
                      <div className="space-y-1.5 text-xs mb-4">
                        {Object.entries(summary.category_breakdown).map(([cat, val]) => {
                          const pct = summary.total_spending > 0 ? (val / summary.total_spending) * 100 : 0;
                          return (
                            <div key={cat} className="p-1.5 rounded-lg hover:bg-slate-50 transition">
                              <div className="flex justify-between items-center mb-1">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: CATEGORY_COLORS[cat] || '#64748b' }}
                                  ></span>
                                  <span className="font-semibold text-slate-700">{cat}</span>
                                  {pct > 25 && (
                                    <span className="text-[9px] font-bold text-rose-600 bg-rose-50 border border-rose-200/80 px-1 rounded">
                                      High
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-slate-400 font-mono">{pct.toFixed(0)}%</span>
                                  <span className="font-mono font-medium text-slate-900">
                                    ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

                      {/* Recharts Bar or Velocity Area Chart */}
                      <div className="bg-slate-50/50 p-2.5 rounded-xl border border-slate-200/80">
                        <div className="flex items-center justify-between mb-2 px-1">
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                            {chartView === 'category' ? 'Category Breakdown' : 'Spending Velocity'}
                          </span>
                          <div className="flex bg-slate-200/70 p-0.5 rounded-md text-[10px]">
                            <button
                              onClick={() => setChartView('category')}
                              className={`px-1.5 py-0.5 rounded transition ${
                                chartView === 'category' ? 'bg-white text-slate-900 font-semibold shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                              }`}
                            >
                              Bar
                            </button>
                            <button
                              onClick={() => setChartView('velocity')}
                              className={`px-1.5 py-0.5 rounded transition ${
                                chartView === 'velocity' ? 'bg-white text-slate-900 font-semibold shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                              }`}
                            >
                              Trend
                            </button>
                          </div>
                        </div>

                        {chartView === 'category' && chartData.length > 0 && (
                          <div className="h-40">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -24, bottom: 20 }}>
                                <XAxis
                                  dataKey="name"
                                  angle={-35}
                                  textAnchor="end"
                                  tick={{ fontSize: 9, fill: '#64748b' }}
                                  interval={0}
                                />
                                <YAxis tick={{ fontSize: 9, fill: '#64748b' }} />
                                <Tooltip
                                  contentStyle={{
                                    backgroundColor: '#0f172a',
                                    borderRadius: '8px',
                                    border: 'none',
                                    color: '#fff',
                                    fontSize: '11px',
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                  }}
                                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'Spend']}
                                />
                                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
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
                          <div className="h-40">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={trends} margin={{ top: 8, right: 8, left: -24, bottom: 20 }}>
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
                                  tick={{ fontSize: 9, fill: '#64748b' }}
                                  interval={Math.ceil(trends.length / 5)}
                                />
                                <YAxis tick={{ fontSize: 9, fill: '#64748b' }} />
                                <Tooltip
                                  contentStyle={{
                                    backgroundColor: '#0f172a',
                                    borderRadius: '8px',
                                    border: 'none',
                                    color: '#fff',
                                    fontSize: '11px',
                                  }}
                                  formatter={(val: number) => [`$${val.toFixed(2)}`, 'Cumulative']}
                                />
                                <Area
                                  type="monotone"
                                  dataKey="cumulative"
                                  stroke="#4f46e5"
                                  strokeWidth={2}
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

              {/* Export and Clear Data */}
              <div className="pt-4 border-t border-slate-200 space-y-2">
                {summary && summary.rows_imported > 0 && (
                  <div className="flex gap-2">
                    <a
                      href="/api/export/csv"
                      download="transactions_export.csv"
                      className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium text-xs py-1.5 px-2 rounded-lg border border-slate-200/80 transition flex items-center justify-center gap-1 shadow-2xs"
                    >
                      <Download className="w-3 h-3 text-slate-500" />
                      <span>Export CSV</span>
                    </a>
                    <a
                      href="/api/export/json"
                      download="financial_audit.json"
                      className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium text-xs py-1.5 px-2 rounded-lg border border-slate-200/80 transition flex items-center justify-center gap-1 shadow-2xs"
                    >
                      <Download className="w-3 h-3 text-slate-500" />
                      <span>Audit JSON</span>
                    </a>
                  </div>
                )}
                <button
                  onClick={handleClearData}
                  className="w-full text-rose-600 hover:bg-rose-50 hover:border-rose-200 font-medium text-xs py-2 px-3 rounded-lg border border-transparent transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear Data
                </button>
              </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col h-full bg-[#f8fafc] overflow-hidden">
              {/* Top Header */}
              <header className="p-6 bg-white border-b border-slate-200/80 flex-shrink-0 shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
                    <Wallet className="w-5 h-5 text-amber-300" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-900">Personal Finance Agent</h1>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Upload a transaction CSV, then ask natural language questions about your spending. The agent categorizes transactions and answers using your SQLite-backed history.
                    </p>
                  </div>
                </div>

                {/* Transaction Preview Accordion */}
                {transactions.length > 0 && (
                  <div className="mt-4 border border-slate-200/80 rounded-xl overflow-hidden bg-white shadow-2xs">
                    <button
                      onClick={() => setPreviewOpen(!previewOpen)}
                      className="w-full flex items-center justify-between p-3 bg-slate-50/70 hover:bg-slate-100/70 text-xs font-semibold text-slate-700 transition"
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
                        <div className="p-3 bg-slate-50/60 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
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
                                className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition cursor-pointer ${
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
                        <div className="max-h-60 overflow-y-auto text-xs">
                          {filteredTransactions.length === 0 ? (
                            <div className="p-6 text-center text-slate-400">
                              No transactions match the selected filter.
                            </div>
                          ) : (
                            <table className="w-full text-left">
                              <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-slate-500 uppercase text-[10px] tracking-wider font-semibold">
                                <tr>
                                  <th className="p-2.5 pl-4">Date</th>
                                  <th className="p-2.5">Description</th>
                                  <th className="p-2.5">Category</th>
                                  <th className="p-2.5 pr-4 text-right">Amount</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {filteredTransactions.map((tx, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                                    <td className="p-2.5 pl-4 whitespace-nowrap text-slate-500 font-mono text-[11px]">{tx.date}</td>
                                    <td className="p-2.5 font-medium text-slate-800">{tx.description}</td>
                                    <td className="p-2.5">
                                      <span
                                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                          CATEGORY_BADGES[tx.category] || 'bg-slate-50 text-slate-700 border-slate-200'
                                        }`}
                                      >
                                        {tx.category}
                                      </span>
                                    </td>
                                    <td className={`p-2.5 pr-4 text-right font-mono font-semibold ${tx.amount < 0 ? 'text-slate-900' : 'text-emerald-600'}`}>
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
                  <div className="mt-4 bg-indigo-50/70 text-indigo-900 border border-indigo-200/70 p-3 rounded-xl text-xs flex items-center gap-2.5 shadow-2xs">
                    <AlertCircle className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                    <span>No transactions loaded yet. Upload a CSV in the sidebar or click <strong>Load sample transactions.csv</strong> to try the demo.</span>
                  </div>
                )}

                {/* Sample Prompts */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {SAMPLE_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => handleSendMessage(q)}
                      className="text-xs bg-white hover:bg-indigo-50/50 hover:text-indigo-600 hover:border-indigo-300 text-slate-700 py-1.5 px-3 rounded-full border border-slate-200/90 transition-all duration-150 flex items-center gap-1 shadow-2xs group"
                    >
                      <span>{q}</span>
                      <ArrowUpRight className="w-3 h-3 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                    </button>
                  ))}
                </div>
              </header>

              {/* Chat Messages Feed */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
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
                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex justify-end">
                          <button
                            onClick={handleDownloadHistory}
                            className="text-[11px] font-medium text-slate-400 hover:text-slate-700 flex items-center gap-1 transition"
                          >
                            <Download className="w-3 h-3" />
                            Download chat history
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
                    <div className="flex items-center gap-2.5 bg-white p-3.5 rounded-2xl rounded-tl-xs border border-slate-200/80 shadow-xs">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                      <span className="font-medium text-slate-600">Analyzing your finances...</span>
                    </div>
                  </div>
                )}

                <div ref={chatBottomRef} />
              </div>

              {/* Chat Input */}
              <div className="p-4 border-t border-slate-200/80 bg-white shadow-[0_-1px_3px_rgba(0,0,0,0.02)]">
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
                      placeholder="Ask about your finances..."
                      className="w-full bg-slate-50/80 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition shadow-2xs"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !inputPrompt.trim()}
                    className="bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl text-xs font-semibold transition shadow-xs flex items-center gap-1.5 active:scale-[0.98]"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </button>
                </form>
              </div>
            </main>
          </div>
        </div>
      )}
    </div>
  );
}
