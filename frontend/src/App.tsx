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
  FileText,
  AlertCircle,
  BarChart3,
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

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6b7280'];

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Fetch initial summary and transactions
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
    <div className="flex h-screen bg-[#f8f9fa] text-[#31333f] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-80 bg-[#f0f2f6] border-r border-gray-200 p-5 flex flex-col justify-between overflow-y-auto">
        <div className="space-y-6">
          <h2 className="text-xl font-bold tracking-tight text-gray-800">Data</h2>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Upload bank statement or transaction CSV/PDF
            </label>
            <p className="text-xs text-gray-500 mb-2">
              CSV should include date, description, and amount (or debit/credit columns). PDF bank statements are also supported.
            </p>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 hover:border-blue-500 rounded-lg p-4 text-center cursor-pointer transition bg-white"
            >
              <Upload className="mx-auto h-6 w-6 text-gray-400 mb-1" />
              <span className="text-xs font-medium text-gray-600">
                {uploadLoading ? 'Uploading...' : 'Browse files (CSV, PDF)'}
              </span>
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
            className="w-full bg-white hover:bg-gray-50 text-gray-700 font-medium text-sm py-2 px-3 rounded-md border border-gray-300 shadow-sm transition flex items-center justify-center gap-2"
          >
            {uploadLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Load sample transactions.csv
          </button>

          {/* Status Message */}
          {statusMessage && (
            <div className="bg-emerald-50 text-emerald-800 text-xs p-3 rounded-md border border-emerald-200 flex items-start gap-2">
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Summary KPIs & Chart */}
          {summary && summary.rows_imported > 0 && (
            <div className="space-y-4 pt-2">
              <div className="bg-white p-3 rounded-md border border-gray-200">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider block">
                  Total spending
                </span>
                <span className="text-2xl font-bold text-gray-900">
                  ${summary.total_spending.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Category totals
                </h3>
                <div className="space-y-1 text-sm mb-4">
                  {Object.entries(summary.category_breakdown).map(([cat, val]) => (
                    <div key={cat} className="flex justify-between py-0.5 border-b border-gray-100">
                      <span className="font-semibold text-gray-700">{cat}:</span>
                      <span className="text-gray-900">${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                </div>

                {/* Recharts Bar Chart */}
                {chartData.length > 0 && (
                  <div className="h-44 bg-white p-2 rounded-md border border-gray-200">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                        <XAxis dataKey="name" angle={-35} textAnchor="end" tick={{ fontSize: 10 }} interval={0} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, 'Spend']} />
                        <Bar dataKey="value">
                          {chartData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
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
        <div className="pt-4 border-t border-gray-200">
          <button
            onClick={handleClearData}
            className="w-full text-red-600 hover:bg-red-50 font-medium text-sm py-2 px-3 rounded-md border border-red-200 transition flex items-center justify-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Clear Data
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full bg-white">
        {/* Top Header */}
        <header className="p-6 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-3xl">💰</span>
            <h1 className="text-2xl font-bold text-gray-900">Personal Finance Agent</h1>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Upload a transaction CSV, then ask natural language questions about your spending. The agent categorizes transactions and answers using your SQLite-backed history.
          </p>

          {/* Transaction Preview Accordion */}
          {transactions.length > 0 && (
            <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setPreviewOpen(!previewOpen)}
                className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 text-sm font-semibold text-gray-700 transition"
              >
                <span>Transaction preview ({transactions.length} rows)</span>
                {previewOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
              {previewOpen && (
                <div className="max-h-60 overflow-y-auto border-t border-gray-200 text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-gray-100 sticky top-0 border-b border-gray-200 text-gray-600 uppercase">
                      <tr>
                        <th className="p-2">Date</th>
                        <th className="p-2">Description</th>
                        <th className="p-2">Category</th>
                        <th className="p-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {transactions.map((tx, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="p-2 whitespace-nowrap">{tx.date}</td>
                          <td className="p-2">{tx.description}</td>
                          <td className="p-2">
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-700">
                              {tx.category}
                            </span>
                          </td>
                          <td className={`p-2 text-right font-mono font-medium ${tx.amount < 0 ? 'text-gray-900' : 'text-emerald-600'}`}>
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
            <div className="mt-4 bg-blue-50 text-blue-900 border border-blue-200 p-3 rounded-lg text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
              <span>No transactions loaded yet. Upload a CSV in the sidebar or click <strong>Load sample transactions.csv</strong> to try the demo.</span>
            </div>
          )}

          {/* Sample Prompts */}
          <div className="mt-4 flex flex-wrap gap-2">
            {SAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => handleSendMessage(q)}
                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 py-1.5 px-3 rounded-full border border-gray-200 transition"
              >
                {q}
              </button>
            ))}
          </div>
        </header>

        {/* Chat Messages Feed */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                  AI
                </div>
              )}
              <div
                className={`max-w-2xl rounded-xl p-4 text-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-800 border border-gray-200'
                }`}
              >
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>

                {msg.role === 'assistant' && index === messages.length - 1 && (
                  <div className="mt-3 pt-2 border-t border-gray-200 flex justify-end">
                    <button
                      onClick={handleDownloadHistory}
                      className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1 transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download chat history
                    </button>
                  </div>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-gray-300 text-gray-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                  U
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-3 items-center text-gray-500 text-sm italic">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                AI
              </div>
              <div className="flex items-center gap-2 bg-gray-100 p-3 rounded-xl border border-gray-200">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span>Analyzing your finances...</span>
              </div>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Chat Input */}
        <div className="p-4 border-t border-gray-200 bg-white">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(inputPrompt);
            }}
            className="flex gap-2 max-w-4xl mx-auto"
          >
            <input
              type="text"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              placeholder="Ask about your finances..."
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition shadow-sm"
            />
            <button
              type="submit"
              disabled={loading || !inputPrompt.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition shadow-sm flex items-center gap-1.5"
            >
              <Send className="w-4 h-4" />
              Send
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
