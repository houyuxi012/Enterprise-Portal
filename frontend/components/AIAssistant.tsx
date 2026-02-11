import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, Send, X, Loader2, Bot, User, Trash2, Maximize2, Minimize2, ChevronDown, Paperclip, Image as ImageIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ApiClient from '../services/api';
import { AIModelOption } from '../types';

interface AIAssistantProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  initialPrompt?: string;
}

interface Message {
  role: 'user' | 'ai';
  text: string;
  imageUrl?: string;
}

const SUGGESTED_PROMPTS = [
  "如何申请年假？",
  "IT 部门的联系方式是什么？",
  "公司最新的差旅报销政策",
  "怎么预定会议室？"
];

const AIAssistant: React.FC<AIAssistantProps> = ({ isOpen, setIsOpen, initialPrompt }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', text: "你好！我是企业智能助手。有什么可以帮你的吗？" }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [aiConfig, setAiConfig] = useState<{ name: string; icon: string; enabled: boolean }>({
    name: 'ShiKu Assistant',
    icon: '',
    enabled: true
  });

  // Model Selection
  const [models, setModels] = useState<AIModelOption[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<number | undefined>(undefined);
  const [showModelSelector, setShowModelSelector] = useState(false);

  // Image Upload State
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        alert("图片大小不能超过 5MB");
        return;
      }
      setSelectedImage(file);
      setImagePreview(URL.createObjectURL(file));
      // Focus input back
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const extractApiErrorMessage = (error: unknown): string => {
    const data = (error as any)?.response?.data;
    const detail = data?.detail;

    if (typeof detail === 'string' && detail.trim()) {
      return detail;
    }

    if (Array.isArray(detail) && detail.length > 0) {
      const formatted = detail
        .map((item: any) => {
          if (!item) return '';
          if (typeof item === 'string') return item;
          const loc = Array.isArray(item.loc) ? item.loc.join('.') : '';
          const msg = typeof item.msg === 'string' ? item.msg : '';
          return loc && msg ? `${loc}: ${msg}` : msg;
        })
        .filter(Boolean)
        .join('；');
      if (formatted) return formatted;
    }

    if (typeof data?.message === 'string' && data.message.trim()) {
      return data.message;
    }

    const genericMessage = (error as any)?.message;
    if (typeof genericMessage === 'string' && genericMessage.trim()) {
      return genericMessage;
    }

    return "请求失败，请稍后重试。";
  };

  // Fetch AI Config and Models on mount
  useEffect(() => {
    const fetchConfigAndModels = async () => {
      try {
        const [config, modelList] = await Promise.all([
          ApiClient.getPublicSystemConfig(),
          ApiClient.getAIModels().catch(() => [])
        ]);

        setAiConfig({
          name: config.ai_name || 'ShiKu Assistant',
          icon: config.ai_icon || '',
          enabled: config.ai_enabled !== 'false'
        });

        setModels(modelList);

        // Determine default model
        let defaultModelId: number | undefined;
        if (config.default_ai_model) {
          const configId = Number(config.default_ai_model);
          if (modelList.find(m => m.id === configId)) {
            defaultModelId = configId;
          }
        }

        // Fallback to first available if not configured or invalid
        if (defaultModelId === undefined && modelList.length > 0) {
          defaultModelId = modelList[0].id;
        }

        if (defaultModelId !== undefined) {
          setSelectedModelId(defaultModelId);
        }

        // Update initial welcome message name if needed
        setMessages(prev => {
          if (prev.length === 1 && prev[0].role === 'ai') {
            return [{ role: 'ai', text: `你好！我是${config.ai_name || '企业智能助手'}。有什么可以帮你的吗？` }];
          }
          return prev;
        });

      } catch (error) {
        console.error("Failed to load AI config", error);
      }
    };
    fetchConfigAndModels();
  }, []);

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
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const handleSend = async (text: string) => {
    if ((!text.trim() && !selectedImage) || isLoading) return;

    const userMsg = text.trim();
    let imageUrl = '';

    // Upload image if selected
    if (selectedImage) {
      try {
        imageUrl = await ApiClient.uploadImage(selectedImage);
      } catch (e) {
        console.error("Upload failed", e);
        setMessages(prev => [...prev, { role: 'user', text: userMsg }, { role: 'ai', text: "❌ 图片上传失败，请重试。" }]);
        return;
      }
    }

    const userDisplayText = userMsg || (imageUrl ? "（图片）" : "");
    const newMessage: Message = { role: 'user', text: userDisplayText, imageUrl: imageUrl || undefined };

    setInput('');
    clearImage();
    setIsLoading(true);

    // Add user message
    setMessages(prev => [...prev, newMessage]);

    try {
      // Pass selectedModelId and imageUrl to API
      const response = await ApiClient.chatAI(userMsg, selectedModelId, imageUrl || undefined);
      setMessages(prev => [...prev, { role: 'ai', text: response }]);
    } catch (error) {
      const errorMessage = extractApiErrorMessage(error);
      setMessages(prev => [...prev, { role: 'ai', text: `请求失败：${errorMessage}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle deep-linked prompt
  useEffect(() => {
    if (isOpen && initialPrompt) {
      handleSend(initialPrompt);
    }
  }, [isOpen, initialPrompt]);

  const clearChat = () => {
    setMessages([{ role: 'ai', text: `对话已重置。有什么新问题吗？` }]);
  };

  // If AI is disabled globally, do not render anything
  if (!aiConfig.enabled) return null;

  const selectedModelName = models.find(m => m.id === selectedModelId)?.name || aiConfig.name;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 z-50 transition-all duration-500 hover:scale-110 active:scale-95 group ${isOpen ? 'scale-0 opacity-0' : 'scale-100 opacity-100'}`}
      >
        <div className="absolute inset-0 bg-blue-400 rounded-full animate-ping opacity-20 group-hover:opacity-40"></div>
        <div className="relative w-14 h-14 bg-gradient-to-br from-blue-600 to-blue-500 text-white rounded-full shadow-2xl shadow-blue-500/40 flex items-center justify-center border border-white/20 overflow-hidden">
          {aiConfig.icon ? (
            <img src={aiConfig.icon} alt="AI" className="w-full h-full object-cover" />
          ) : (
            <Sparkles size={24} className="animate-pulse" />
          )}
        </div>
      </button>

      {isOpen && (
        <div
          className={`fixed z-[100] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] flex flex-col overflow-hidden mica shadow-2xl ring-1 ring-white/20 dark:ring-white/5
            ${isExpanded
              ? 'inset-4 rounded-[2rem]'
              : 'bottom-6 right-6 w-[90vw] sm:w-[400px] h-[600px] max-h-[85vh] rounded-[2rem]'
            }`}
        >
          {/* Header */}
          <div className="relative z-10 px-5 py-4 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md border-b border-white/20 dark:border-white/5 flex justify-between items-center shrink-0">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 overflow-hidden">
                {aiConfig.icon ? (
                  <img src={aiConfig.icon} alt="AI" className="w-full h-full object-cover" />
                ) : (
                  <Bot size={18} />
                )}
              </div>
              <div>
                <h3 className="font-black text-sm text-slate-800 dark:text-white tracking-tight">{aiConfig.name}</h3>
                <div className="flex items-center space-x-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Online</span>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-1">
              <button onClick={clearChat} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-colors" title="清空对话">
                <Trash2 size={16} />
              </button>
              <button onClick={() => setIsExpanded(!isExpanded)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-colors hidden sm:block">
                {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button onClick={() => setIsOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Chat Area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-6 scroll-smooth bg-gradient-to-b from-transparent to-white/30 dark:to-black/30" onClick={() => setShowModelSelector(false)}>
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                <div className={`flex max-w-[85%] ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'} gap-3`}>

                  {/* Avatar */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border border-white/20 shadow-sm overflow-hidden ${m.role === 'user'
                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'
                    }`}>
                    {m.role === 'user' ? <User size={14} /> : (
                      aiConfig.icon ? <img src={aiConfig.icon} className="w-full h-full object-cover" /> : <Sparkles size={14} />
                    )}
                  </div>

                  {/* Bubble */}
                  <div className={`p-4 rounded-2xl shadow-sm text-sm leading-relaxed relative group ${m.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-sm'
                    : 'bg-white dark:bg-slate-800 border border-white/50 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-tl-sm'
                    }`}>
                    {m.imageUrl && (
                      <div className="mb-2">
                        <img
                          src={m.imageUrl}
                          alt="User Upload"
                          className="max-w-full rounded-lg max-h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => window.open(m.imageUrl, '_blank')}
                        />
                      </div>
                    )}
                    {m.role === 'ai' ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                      </div>
                    ) : (
                      m.text
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Quick Prompts - Show only if messages length is small */}
            {messages.length < 2 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-8 animate-in fade-in zoom-in-95 delay-200 duration-500">
                {SUGGESTED_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(prompt)}
                    className="text-left p-3 rounded-xl bg-white/50 dark:bg-slate-800/50 border border-white/40 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-200 dark:hover:border-blue-800 transition-all group"
                  >
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400">{prompt}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-4 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border-t border-white/20 dark:border-white/5 shrink-0">
            {/* Model Selector Pill */}
            {models.length > 0 && (
              <div className="relative mb-2">
                <button
                  onClick={() => setShowModelSelector(!showModelSelector)}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-white/80 dark:bg-slate-800/80 px-3 py-1.5 rounded-full shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-white hover:border-slate-300 dark:hover:bg-slate-700 transition-all group"
                >
                  <span className="max-w-[100px] truncate">{selectedModelName}</span>
                  <ChevronDown size={12} className={`text-slate-400 group-hover:text-blue-500 transition-transform duration-300 ${showModelSelector ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                {showModelSelector && (
                  <div className="absolute bottom-full left-0 mb-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl ring-1 ring-slate-100 dark:ring-slate-700 py-1 w-48 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-50 dark:border-slate-700/50 mb-1">Select Model</div>
                    {models.map(model => (
                      <button
                        key={model.id}
                        onClick={() => {
                          setSelectedModelId(model.id);
                          setShowModelSelector(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-between transition-colors ${selectedModelId === model.id
                          ? 'text-blue-600 bg-blue-50/50 dark:bg-blue-900/10'
                          : 'text-slate-600 dark:text-slate-300'
                          }`}
                      >
                        <span className="truncate pr-2">{model.name}</span>
                        {selectedModelId === model.id && <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0"></span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="relative flex items-center">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
                placeholder={`Ask ${selectedModelName}...`}
                disabled={isLoading}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-3.5 pl-10 pr-14 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none shadow-inner dark:text-white transition-all placeholder:text-slate-400"
              />

              {/* File Upload Button */}
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileSelect}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute left-2.5 p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-slate-700 rounded-lg transition-all"
                title="Upload Image"
              >
                <Paperclip size={18} />
              </button>

              {/* Image Preview Overlay */}
              {imagePreview && (
                <div className="absolute left-10 top-1/2 -translate-y-1/2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1 flex items-center gap-2 shadow-lg">
                  <div className="relative w-8 h-8 rounded overflow-hidden">
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                  <button onClick={clearImage} className="text-slate-400 hover:text-red-500 p-0.5"><X size={12} /></button>
                </div>
              )}

              <button
                onClick={() => handleSend(input)}
                disabled={(!input.trim() && !selectedImage) || isLoading}
                className="absolute right-2 p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 disabled:hover:bg-blue-600 shadow-lg shadow-blue-500/20 hover:scale-105 active:scale-95"
              >
                {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </div>
            <p className="text-[9px] text-center text-slate-400 mt-2 font-medium">
              AI 可能会犯错。重要信息请查阅公司官方文档。
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default AIAssistant;
