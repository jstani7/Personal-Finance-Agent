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
  ShieldCheck,
  Cpu,
  Database,
  BarChart3,
  Layers,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

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
  const [activeTab, setActiveTab] = useState<'overview' | 'dashboard'>('overview');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchSummary();
    fetchTransactions();
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

  const handleLoadSample = async () => {
    setUploadLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/sample', { method: 'POST' });
      if (res.ok) {
        const data: ImportSummary = await res.json();
        setSummary(data);
        fetchTransactions();
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

  return (
    <div className="flex flex-col h-screen bg-[#f8fafc] text-slate-900 overflow-hidden font-sans">
      {/* Top Universal Navbar */}
      <nav className="h-14 bg-white border-b border-slate-200/80 px-6 flex items-center justify-between flex-shrink-0 z-10 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
            <Wallet className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-sm tracking-tight text-slate-900">Personal Finance Agent</span>
          <span className="hidden sm:inline-block text-[10px] font-mono font-medium text-indigo-700 bg-indigo-50 border border-indigo-200/60 px-2 py-0.5 rounded-full">
            v0.1 Rust
          </span>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 text-xs font-medium shadow-2xs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3.5 py-1.5 rounded-lg transition-all ${
              activeTab === 'overview'
                ? 'bg-white text-indigo-700 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Landing Page
          </button>
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'dashboard'
                ? 'bg-white text-indigo-700 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>App Dashboard</span>
            {transactions.length > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'overview' && (
            <button
              onClick={() => setActiveTab('dashboard')}
              className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-1.5 px-3 rounded-lg transition shadow-2xs flex items-center gap-1"
            >
              <span>Launch Dashboard</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </nav>

      {/* Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Landing Page View */}
        {activeTab === 'overview' ? (
          <div className="flex-1 overflow-y-auto bg-gradient-to-b from-white via-slate-50/50 to-slate-100/50">
            {/* Hero Section */}
            <div className="max-w-4xl mx-auto px-6 pt-16 pb-12 text-center">
              <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200/70 px-3 py-1 rounded-full text-indigo-700 text-xs font-semibold mb-6 shadow-2xs">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Local-First Financial Intelligence</span>
              </div>

              <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 mb-5 leading-tight">
                Understand Every Dollar with an <br className="hidden sm:inline" />
                <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                  Autonomous AI Copilot
                </span>
              </h1>

              <p className="text-base text-slate-600 max-w-2xl mx-auto mb-8 leading-relaxed">
                Ingest bank statements, automatically classify spending into intelligent buckets, and query your transaction history using natural language powered by embedded SQLite and native Rust.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={handleLoadSample}
                  disabled={uploadLoading}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm px-5 py-2.5 rounded-xl shadow-xs transition flex items-center gap-2 active:scale-[0.99]"
                >
                  {uploadLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span>Explore Demo Transactions</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab('dashboard');
                    setTimeout(() => fileInputRef.current?.click(), 100);
                  }}
                  className="bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm px-5 py-2.5 rounded-xl border border-slate-200/80 shadow-2xs transition flex items-center gap-2 active:scale-[0.99]"
                >
                  <Upload className="w-4 h-4 text-slate-500" />
                  <span>Upload Statement</span>
                </button>
              </div>

              {/* Status Pill if loaded */}
              {summary && summary.rows_imported > 0 && (
                <div className="mt-4 inline-flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-200/70 text-xs px-3 py-1 rounded-full">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{summary.rows_imported} transactions currently loaded in local SQLite</span>
                </div>
              )}
            </div>

            {/* Core Feature Pillars */}
            <div className="max-w-5xl mx-auto px-6 py-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-xs transition">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-4">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-base mb-2">100% Local & Private</h3>
                  <p className="text-xs leading-relaxed text-slate-600">
                    Your financial transactions reside exclusively inside your local SQLite database (<code className="text-[11px] bg-slate-100 px-1 py-0.5 rounded">finance.db</code>). Zero bank credentials or transaction rows are stored on remote servers.
                  </p>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-xs transition">
                  <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600 mb-4">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-base mb-2">Native Rust Engine</h3>
                  <p className="text-xs leading-relaxed text-slate-600">
                    Built entirely on Axum and Rusqlite. Sub-second startup times, instant SQL executions, and single compiled binary packaging with zero runtime Python dependencies.
                  </p>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-xs transition">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mb-4">
                    <Bot className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-base mb-2">Safe Tool-Calling AI</h3>
                  <p className="text-xs leading-relaxed text-slate-600">
                    An autonomous agent loop armed with strictly read-only SQL validation, weekly budget calculators, and discretionary spending analyzers that cite exact numbers.
                  </p>
                </div>
              </div>
            </div>

            {/* Architecture Highlights Section */}
            <div className="max-w-5xl mx-auto px-6 py-12">
              <div className="bg-white rounded-2xl border border-slate-200/80 p-8 shadow-xs">
                <div className="flex items-center gap-2 text-indigo-600 text-xs font-bold uppercase tracking-wider mb-2">
                  <Layers className="w-4 h-4" />
                  <span>Pipeline Architecture</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-6">How Your Data Flows</h2>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="text-xs font-mono font-bold text-slate-400 mb-1">01 / INGEST</div>
                    <div className="font-semibold text-slate-900 text-sm mb-1">CSV & PDF Parser</div>
                    <p className="text-xs text-slate-500">Normalizes date, memo, debit, and credit columns automatically.</p>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="text-xs font-mono font-bold text-slate-400 mb-1">02 / CLASSIFY</div>
                    <div className="font-semibold text-slate-900 text-sm mb-1">Keyword Matcher</div>
                    <p className="text-xs text-slate-500">Categorizes records across 7 standard financial buckets.</p>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="text-xs font-mono font-bold text-slate-400 mb-1">03 / PERSIST</div>
                    <div className="font-semibold text-slate-900 text-sm mb-1">Embedded SQLite</div>
                    <p className="text-xs text-slate-500">High-speed local storage optimized for instant analytical querying.</p>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="text-xs font-mono font-bold text-slate-400 mb-1">04 / REASON</div>
                    <div className="font-semibold text-slate-900 text-sm mb-1">Tool-Calling Agent</div>
                    <p className="text-xs text-slate-500">Answers queries, runs read-only SQL, and suggests budget plans.</p>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
                  <div className="text-xs text-slate-500">
                    Compatible with Orq.ai, OpenAI GPT-4o, Groq, and local Ollama models.
                  </div>
                  <button
                    onClick={() => setActiveTab('dashboard')}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition"
                  >
                    <span>Open Dashboard</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Dashboard Workspace View */
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
                        {Object.entries(summary.category_breakdown).map(([cat, val]) => (
                          <div key={cat} className="flex justify-between items-center py-1 px-1.5 rounded hover:bg-slate-50 transition">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: CATEGORY_COLORS[cat] || '#64748b' }}
                              ></span>
                              <span className="font-semibold text-slate-700">{cat}:</span>
                            </div>
                            <span className="font-mono font-medium text-slate-900">
                              ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Recharts Bar Chart */}
                      {chartData.length > 0 && (
                        <div className="h-44 bg-slate-50/50 p-2.5 rounded-xl border border-slate-200/80">
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
                    </div>
                  </div>
                )}
              </div>

              {/* Clear Data Button */}
              <div className="pt-4 border-t border-slate-200">
                <button
                  onClick={handleClearData}
                  className="w-full text-rose-600 hover:bg-rose-50 hover:border-rose-200 font-medium text-xs py-2 px-3 rounded-lg border border-transparent transition flex items-center justify-center gap-1.5"
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
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white flex items-center justify-center shadow-xs">
                    <Wallet className="w-5 h-5 text-white" />
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
                      <div className="max-h-60 overflow-y-auto border-t border-slate-200 text-xs">
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
                            {transactions.map((tx, idx) => (
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
                      <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                        <Bot className="w-4 h-4" />
                      </div>
                    )}
                    <div
                      className={`max-w-2xl rounded-2xl p-4 text-xs leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-sm rounded-tr-xs'
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
                      <div className="w-8 h-8 rounded-lg bg-slate-800 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                        <User className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                ))}

                {loading && (
                  <div className="flex gap-3 items-center text-slate-500 text-xs">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                      <Bot className="w-4 h-4" />
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
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-xs font-semibold transition shadow-xs flex items-center gap-1.5 active:scale-[0.98]"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </button>
                </form>
              </div>
            </main>
          </div>
        )}
      </div>
    </div>
  );
}
