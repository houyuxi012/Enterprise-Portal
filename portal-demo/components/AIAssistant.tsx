import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Sparkles, Send, X, Loader2, Bot, User, Trash2, Maximize2, Minimize2, 
  Copy, Check, CornerDownLeft, Info, Mic, Volume2, Globe
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { streamAIResponse } from '../services/geminiService';
import { AppView } from '../types';

interface AIAssistantProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  initialPrompt?: string;
  currentView?: AppView;
}

interface Message {
  role: 'user' | 'ai';
  text: string;
  isStreaming?: boolean;
  timestamp: string;
}

const SUGGESTED_PROMPTS = [
  "如何申请年假？",
  "IT 部门的联系方式是什么？",
  "公司最新的差旅报销政策",
  "怎么预定5号会议室？"
];

const AIAssistant: React.FC<AIAssistantProps> = ({ isOpen, setIsOpen, initialPrompt, currentView }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: 'ai', 
      text: "你好！我是 ShiKu Assistant。我已经准备好在 **ShiKu Home** 协助你的日常工作了。有什么可以帮你的吗？",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, isOpen, isLoading]);

  // Focus input on open
  useEffect(() => {
    if (isOpen && inputRef.current && !isLoading) {
      setTimeout(() => inputRef.current?.focus(), 400);
    }
  }, [isOpen]);

  const handleSend = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;
    
    const userMsg = text.trim();
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setInput('');
    setIsLoading(true);
    
    // Add user message
    setMessages(prev => [...prev, { role: 'user', text: userMsg, timestamp }]);

    // Add placeholder for AI response
    setMessages(prev => [...prev, { role: 'ai', text: '', isStreaming: true, timestamp }]);

    let fullResponse = '';
    const viewContext = currentView ? `用户当前正在查看: ${currentView}` : undefined;

    await streamAIResponse(
      userMsg, 
      (chunk) => {
        fullResponse += chunk;
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMsg = newMessages[newMessages.length - 1];
          if (lastMsg.role === 'ai') {
            lastMsg.text = fullResponse;
          }
          return newMessages;
        });
      },
      () => {
        setIsLoading(false);
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMsg = newMessages[newMessages.length - 1];
          lastMsg.isStreaming = false;
          return newMessages;
        });
      },
      viewContext
    );
  }, [isLoading, currentView]);

  // Handle deep-linked prompt
  useEffect(() => {
    if (isOpen && initialPrompt) {
      handleSend(initialPrompt);
    }
  }, [isOpen, initialPrompt]);

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(index);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const clearChat = () => {
    if (confirm('确定要清空所有对话记录吗？')) {
      setMessages([{ 
        role: 'ai', 
        text: "对话已重置。有什么新问题吗？",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    }
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 z-50 transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-110 active:scale-90 group ${isOpen ? 'scale-0 rotate-90 opacity-0 pointer-events-none' : 'scale-100 rotate-0 opacity-100'}`}
      >
        <div className="absolute inset-0 bg-blue-400 rounded-full animate-ping opacity-20 group-hover:opacity-40"></div>
        <div className="relative w-16 h-16 bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 text-white rounded-[2rem] shadow-2xl shadow-blue-500/40 flex items-center justify-center border border-white/20 rim-glow">
          <Sparkles size={28} className="animate-pulse" />
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full"></div>
        </div>
      </button>

      {isOpen && (
        <div 
          className={`fixed z-[100] transition-all duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] flex flex-col overflow-hidden mica shadow-[0_32px_128px_-16px_rgba(0,0,0,0.3)] border border-white/40 dark:border-white/5
            ${isExpanded 
              ? 'inset-6 rounded-[3rem]' 
              : 'bottom-6 right-6 w-[92vw] sm:w-[440px] h-[720px] max-h-[88vh] rounded-[2.5rem]'
            }`}
        >
          {/* Header */}
          <div className="px-6 py-5 bg-white/40 dark:bg-slate-950/40 backdrop-blur-3xl border-b border-white/20 dark:border-white/5 flex justify-between items-center shrink-0">
            <div className="flex items-center space-x-4">
              <div className="relative">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-500 to-cyan-500 flex items-center justify-center text-white shadow-xl shadow-blue-500/20">
                  <Bot size={22} />
                </div>
                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full"></div>
              </div>
              <div>
                <h3 className="font-black text-base text-slate-900 dark:text-white tracking-tight uppercase">ShiKu Assistant</h3>
                <div className="flex items-center space-x-1.5">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Enterprise AI Agent</span>
                  <span className="text-slate-300">|</span>
                  <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">v4.5 PRO</span>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-1 bg-slate-100/50 dark:bg-white/5 p-1 rounded-2xl border border-white/50">
              <button onClick={clearChat} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-all" title="清空对话">
                <Trash2 size={16} />
              </button>
              <button onClick={() => setIsExpanded(!isExpanded)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all hidden sm:block">
                {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button onClick={() => setIsOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-all">
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Chat Area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-8 space-y-8 scroll-smooth no-scrollbar">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4 duration-500`}>
                <div className={`flex max-w-[90%] ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'} gap-4 group`}>
                  
                  {/* Avatar */}
                  <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 border border-white/20 shadow-sm transition-transform group-hover:scale-110 ${
                    m.role === 'user' 
                      ? 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300' 
                      : 'bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30 text-indigo-600'
                  }`}>
                    {m.role === 'user' ? <User size={16} /> : <Sparkles size={16} />}
                  </div>

                  {/* Bubble Container */}
                  <div className="space-y-1.5 flex flex-col">
                    <div className={`px-5 py-4 rounded-[1.75rem] shadow-sm text-sm leading-relaxed relative border group-hover:shadow-lg transition-all ${
                      m.role === 'user' 
                        ? 'bg-blue-600 text-white border-blue-500 rounded-tr-none' 
                        : 'bg-white dark:bg-slate-900 border-white/60 dark:border-white/5 text-slate-800 dark:text-slate-100 rounded-tl-none'
                    }`}>
                      {m.role === 'ai' ? (
                         <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-headings:my-2.5 prose-ul:my-2 prose-strong:font-black prose-a:text-indigo-600 dark:prose-a:text-indigo-400">
                           <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                           {m.isStreaming && (
                             <div className="flex space-x-1 mt-2">
                               <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                               <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                               <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                             </div>
                           )}
                         </div>
                      ) : (
                        <p className="font-medium">{m.text}</p>
                      )}
                      
                      {/* Actions */}
                      {m.role === 'ai' && !m.isStreaming && m.text && (
                        <div className="absolute top-2 right-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => copyToClipboard(m.text, i)} 
                            className="p-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-indigo-600 transition-all"
                            title="复制内容"
                          >
                            {copiedId === i ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                          </button>
                        </div>
                      )}
                    </div>
                    <span className={`text-[9px] font-bold text-slate-400 uppercase tracking-widest ${m.role === 'user' ? 'text-right mr-1' : 'ml-1'}`}>
                       {m.role === 'ai' ? 'ShiKu AI' : 'Me'} · {m.timestamp}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            
            {/* Quick Prompts */}
            {messages.length < 2 && (
              <div className="space-y-4 pt-4 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
                <div className="flex items-center space-x-2 px-2">
                   <Info size={14} className="text-blue-500" />
                   <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">常见工作场景建议</p>
                </div>
                <div className="grid grid-cols-1 gap-2.5">
                  {SUGGESTED_PROMPTS.map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(prompt)}
                      className="text-left p-4 rounded-2xl bg-white/40 dark:bg-white/5 border border-white/60 dark:border-white/5 hover:bg-white dark:hover:bg-slate-800 hover:border-blue-200 dark:hover:border-blue-900 transition-all group flex items-center justify-between shadow-sm"
                    >
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 leading-tight">{prompt}</span>
                      <CornerDownLeft size={14} className="text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-6 bg-white/70 dark:bg-slate-950/70 backdrop-blur-3xl border-t border-white/20 dark:border-white/5 shrink-0">
            <div className="relative flex items-center group">
              <input 
                ref={inputRef}
                type="text" 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
                placeholder="询问 ShiKu 助手任何事情..."
                disabled={isLoading}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-[1.75rem] py-4.5 pl-6 pr-24 text-sm font-medium focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none shadow-sm dark:text-white transition-all placeholder:text-slate-400"
              />
              <div className="absolute right-2.5 flex items-center space-x-1">
                 <button className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-all">
                    <Mic size={18} />
                 </button>
                 <button 
                  onClick={() => handleSend(input)}
                  disabled={!input.trim() || isLoading}
                  className="p-2.5 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-all disabled:opacity-50 disabled:hover:bg-blue-600 shadow-xl shadow-blue-500/25 hover:scale-105 active:scale-90"
                >
                  {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between mt-4 px-2">
               <div className="flex items-center space-x-1.5">
                  {/* Fixed: Globe icon added to lucide-react imports */}
                  <Globe size={10} className="text-slate-300" />
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Connected to ShiKu Knowledge Base</span>
               </div>
               <div className="flex items-center space-x-2">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Model: Gemini 3 Flash</span>
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
               </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AIAssistant;