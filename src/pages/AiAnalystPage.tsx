import { useState } from 'react';
import { api } from '../services/api.ts';
import { TradingAccount } from '../types.ts';
import { Sparkles, Send, ShieldAlert, Bot, User, Clock } from 'lucide-react';

interface AiAnalystPageProps {
  activeAccount: TradingAccount | null;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  time: string;
}

export function AiAnalystPage({ activeAccount }: AiAnalystPageProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Welcome to **TradePilot AI Performance Mentor**. I review your logged trade executions, setups, emotional tags, and risk discipline to identify behavioral leaks and statistical edges.\n\nAsk questions about your performance, mistake patterns, or strategy expectancy.`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const quickPrompts = [
    'Diagnose my biggest mistakes and loss clusters',
    'Which currency pair yields my highest statistical edge?',
    'Evaluate my execution discipline and emotional tags',
    'How can I optimize my Risk-to-Reward ratio delivery?',
  ];

  const handleSend = async (queryToSend?: string) => {
    const text = queryToSend || inputQuery;
    if (!text.trim() || loading) return;

    const userMsg: Message = {
      role: 'user',
      content: text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setLoading(true);

    try {
      const res = await api.askAI(text, activeAccount?.id);
      const aiMsg: Message = {
        role: 'assistant',
        content: res.response,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      const errorMsg: Message = {
        role: 'assistant',
        content: `Error: ${err.message || 'Failed to communicate with AI analyst service.'}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto flex flex-col h-[calc(100vh-6rem)]">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl sm:text-2xl font-extrabold text-zinc-100 tracking-tight">AI Performance Mentor</h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-mono border border-emerald-500/20">
              Gemini 2.5 Flash
            </span>
          </div>
          <p className="text-xs text-zinc-400">Grounded exclusively in your actual account statistics and documented trades.</p>
        </div>
      </div>

      {/* Advisory Bar */}
      <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 text-[11px] text-zinc-400 flex items-center gap-2.5 shrink-0">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
        <span>
          <strong>Decision Support Notice:</strong> The mentor offers analytical reflections on your historical behavior.
          It does not generate financial advice or guaranteed market predictions.
        </span>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 sm:p-6 overflow-y-auto space-y-4 shadow-xl">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex items-start gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {m.role === 'assistant' && (
              <div className="w-8 h-8 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 text-emerald-400">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div
              className={`max-w-[85%] sm:max-w-[75%] p-4 rounded-2xl space-y-1.5 text-xs leading-relaxed ${
                m.role === 'user'
                  ? 'bg-emerald-500 text-zinc-950 font-medium rounded-tr-sm'
                  : 'bg-zinc-950/80 border border-zinc-800 text-zinc-200 rounded-tl-sm font-sans'
              }`}
            >
              <div className="whitespace-pre-wrap">{m.content}</div>
              <div
                className={`text-[9px] font-mono ${
                  m.role === 'user' ? 'text-zinc-800 text-right' : 'text-zinc-500'
                }`}
              >
                {m.time}
              </div>
            </div>

            {m.role === 'user' && (
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0 text-emerald-400">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-emerald-400">
              <Bot className="w-4 h-4" />
            </div>
            <div className="p-3.5 rounded-2xl bg-zinc-950/80 border border-zinc-800 text-xs text-zinc-400 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>Analyzing trade dataset and cross-referencing statistics...</span>
            </div>
          </div>
        )}
      </div>

      {/* Suggested Quick Prompts */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 shrink-0">
        {quickPrompts.map((p, i) => (
          <button
            key={i}
            disabled={loading}
            onClick={() => handleSend(p)}
            className="text-[11px] px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-emerald-500/50 text-zinc-300 hover:text-emerald-400 transition whitespace-nowrap cursor-pointer shrink-0"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Input box */}
      <div className="relative shrink-0">
        <textarea
          rows={2}
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Ask AI Analyst about your trades, setups, or emotional tags..."
          className="w-full pl-4 pr-24 py-3 rounded-2xl bg-zinc-900 border border-zinc-800 focus:border-emerald-500 text-xs text-zinc-100 outline-none resize-none shadow-2xl"
        />

        <button
          onClick={() => handleSend()}
          disabled={loading || !inputQuery.trim()}
          className="absolute right-3 top-1/2 -translate-y-1/2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs transition disabled:opacity-30 cursor-pointer flex items-center gap-1.5 shadow-md shadow-emerald-500/10"
        >
          <span>Send</span>
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
