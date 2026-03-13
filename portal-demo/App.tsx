
import React, { useState, useMemo, useEffect } from 'react';
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import AdminDashboard from './components/AdminDashboard';
import AIAssistant from './components/AIAssistant';
import Login from './components/Login';
import { AppView, Employee, NewsItem, TodoTask } from './types';
import { MOCK_EMPLOYEES, MOCK_NEWS, QUICK_TOOLS, CAROUSEL_ITEMS, MOCK_TASKS } from './constants';
import { getAIResponse } from './services/geminiService';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mail, Filter, Search, User, Monitor, Moon, Sun, Laptop, ArrowLeft,
  ChevronRight, ChevronLeft, Share2, Edit3, Camera, Briefcase, Clock, Award, Phone, 
  MapPin, MessageSquare, CalendarDays, Sparkles, Globe, SearchCode, 
  Loader2, ExternalLink, Zap, X, CheckCircle2, CircleDashed, RotateCcw, 
  LayoutGrid, FileText, Folder, Download, Star, ShieldCheck, MoreVertical, 
  Lock, Grid, List, Hash, Heart, Bookmark, Command, Info, UserPlus,
  Target, Rocket, HeartHandshake, History, Flag, Users2, Building2,
  CalendarCheck, ClipboardCheck, Timer, PlaneTakeoff, Info as InfoIcon,
  Code2, Component, Braces, Scale, Copyright, ListTodo, Plus, Trash2, CheckCircle,
  Tag, Calendar as CalendarIcon, AlertTriangle
} from 'lucide-react';

type ThemeMode = 'light' | 'dark' | 'system';

const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [globalSearch, setGlobalSearch] = useState('');
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [assistantInitialPrompt, setAssistantInitialPrompt] = useState('');
  const [isAdmin, setIsAdmin] = useState(true);
  
  // Tasks State
  const [tasks, setTasks] = useState<TodoTask[]>(MOCK_TASKS);
  const [activeCategory, setActiveCategory] = useState('全部');
  const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    priority: 'medium' as TodoTask['priority'],
    category: '工作',
    dueDate: new Date().toISOString().split('T')[0]
  });
  const [isAiPolishing, setIsAiPolishing] = useState(false);

  // Filtered Tasks
  const filteredTasks = useMemo(() => {
    if (activeCategory === '全部') return tasks;
    return tasks.filter(t => t.category === activeCategory);
  }, [tasks, activeCategory]);

  const categories = ['全部', '工作', '个人', '会议', '财务', '学习'];

  // States for Detail Views
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [directoryView, setDirectoryView] = useState<'grid' | 'list'>('grid');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  // Search Results AI State
  const [searchAiSummary, setSearchAiSummary] = useState<string | null>(null);
  const [isAiSearching, setIsAiSearching] = useState(false);

  // Leave Request State
  const [leaveData, setLeaveData] = useState({ type: '年假', start: '', end: '', reason: '' });
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);
  const [leaveAiCheck, setLeaveAiCheck] = useState<string | null>(null);
  const [newsCarouselIndex, setNewsCarouselIndex] = useState(0);
  const [newsViewMode, setNewsViewMode] = useState<'grid' | 'list'>('grid');
  const [showHolidayDetail, setShowHolidayDetail] = useState(false);

  useEffect(() => {
    if (currentView === AppView.NEWS) {
      const timer = setInterval(() => {
        setNewsCarouselIndex((prev) => (prev + 1) % CAROUSEL_ITEMS.length);
      }, 5000);
      return () => clearInterval(timer);
    }
  }, [currentView]);

  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme-mode') as ThemeMode;
      return saved || 'system';
    }
    return 'system';
  });

  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = (mode: ThemeMode) => {
      let actualTheme = mode;
      if (mode === 'system') {
        actualTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      if (actualTheme === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };
    applyTheme(themeMode);
    localStorage.setItem('theme-mode', themeMode);
  }, [themeMode]);

  const handleLogin = (credentials: { email: string }) => {
    setCurrentUser({
      name: 'Alex Johnson',
      email: credentials.email,
      role: 'Product Design Lead'
    });
    setIsLoggedIn(true);
  };

  const handleGlobalSearch = async (query: string) => {
    setGlobalSearch(query);
    if (!query.trim()) return;
    setCurrentView(AppView.SEARCH_RESULTS);
    setIsAiSearching(true);
    const summary = await getAIResponse(`根据关键词"${query}"，简要概括可能在公司内网找到的相关资源类型（如：同事、文档、政策等）。`, `Search Results for ${query}`);
    setSearchAiSummary(summary);
    setIsAiSearching(false);
  };

  const handleOpenAssistantWithPrompt = (prompt: string) => {
    setAssistantInitialPrompt(prompt);
    setIsAssistantOpen(true);
  };

  const toggleTask = (id: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title.trim()) return;
    
    const task: TodoTask = {
      id: Math.random().toString(36).substr(2, 9),
      ...newTask,
      completed: false
    };
    
    setTasks([task, ...tasks]);
    setIsAddTaskModalOpen(false);
    setNewTask({
      title: '',
      priority: 'medium',
      category: activeCategory !== '全部' ? activeCategory : '工作',
      dueDate: new Date().toISOString().split('T')[0]
    });
  };

  const handleAiPolish = async () => {
    if (!newTask.title) return;
    setIsAiPolishing(true);
    const polished = await getAIResponse(`请帮我润色这个待办任务标题，使其更专业、清晰：'${newTask.title}'。只返回润色后的文字，不需要任何解释。`, '新建待办任务');
    setNewTask({ ...newTask, title: polished.trim() });
    setIsAiPolishing(false);
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  const renderTodoView = () => {
    const completedCount = tasks.filter(t => t.completed).length;
    const totalCount = tasks.length;
    const progress = Math.round((completedCount / totalCount) * 100) || 0;

    return (
      <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700 relative pb-32">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
           <div>
              <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">待办管理</h1>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Smart Task Orchestrator</p>
           </div>
           
           <div className="mica p-4 lg:px-6 lg:py-3 rounded-3xl border border-white/50 flex items-center space-x-4 shadow-xl self-start md:self-center">
              <div className="text-right">
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">完成进度</p>
                 <p className="text-2xl font-black text-indigo-600 leading-none">{progress}%</p>
              </div>
              <div className="relative w-12 h-12 flex items-center justify-center bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl">
                 <svg className="w-10 h-10 -rotate-90">
                    <circle 
                       cx="20" cy="20" r="18" 
                       fill="transparent" 
                       stroke="currentColor" 
                       strokeWidth="3" 
                       className="text-slate-100 dark:text-slate-800"
                    />
                    <circle 
                       cx="20" cy="20" r="18" 
                       fill="transparent" 
                       stroke="currentColor" 
                       strokeWidth="3" 
                       className="text-indigo-600 transition-all duration-1000"
                       strokeDasharray={113}
                       strokeDashoffset={113 - (113 * progress) / 100}
                    />
                 </svg>
                 <CheckCircle size={14} className="absolute text-indigo-600" />
              </div>
           </div>
        </div>

        {/* Categories & Global Add Bar */}
        <div className="flex items-center justify-between gap-4 px-2">
          <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar py-1 flex-1">
             {categories.map(cat => {
               const count = cat === '全部' ? tasks.length : tasks.filter(t => t.category === cat).length;
               const isActive = activeCategory === cat;
               return (
                 <button 
                   key={cat} 
                   onClick={() => setActiveCategory(cat)}
                   className={`px-5 py-2.5 rounded-full border transition-all duration-300 flex items-center space-x-2 whitespace-nowrap text-[10px] font-black uppercase tracking-widest ${
                     isActive 
                       ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-600/20 translate-y-[-2px]' 
                       : 'mica border-white/50 text-slate-400 hover:text-slate-600 hover:bg-white'
                   }`}
                 >
                   <span>{cat}</span>
                   <span className={`px-1.5 py-0.5 rounded-md text-[8px] ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-400'}`}>
                     {count}
                   </span>
                 </button>
               );
             })}
          </div>
          
          <button 
            onClick={() => setIsAddTaskModalOpen(true)}
            className="hidden md:flex items-center space-x-2 px-6 py-2.5 bg-slate-900 text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl"
          >
            <Plus size={14} />
            <span>新建任务</span>
          </button>
        </div>

        {/* Task List container with padding bottom for safe FAB view */}
        <div className="space-y-4 min-h-[400px] px-2">
           {filteredTasks.length > 0 ? (
             filteredTasks.map((task) => (
                <div 
                  key={task.id} 
                  className={`mica p-5 rounded-[2rem] border border-white/50 flex items-center space-x-6 transition-all group animate-in fade-in slide-in-from-left-4 duration-500 ${task.completed ? 'opacity-60 grayscale' : 'hover:scale-[1.01] hover:shadow-2xl'}`}
                >
                   <button 
                      onClick={() => toggleTask(task.id)}
                      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${task.completed ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-500'}`}
                   >
                      {task.completed && <CheckCircle size={18} />}
                   </button>
                   <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className={`px-2 py-0.5 rounded-md text-[7px] font-black uppercase tracking-widest ${
                          task.category === '工作' ? 'bg-blue-100 text-blue-600' :
                          task.category === '会议' ? 'bg-purple-100 text-purple-600' :
                          task.category === '财务' ? 'bg-emerald-100 text-emerald-600' :
                          'bg-slate-100 text-slate-400'
                        }`}>
                          {task.category}
                        </span>
                        <p className={`text-sm font-black text-slate-900 dark:text-white leading-tight ${task.completed ? 'line-through text-slate-400' : ''}`}>{task.title}</p>
                      </div>
                      <div className="flex items-center space-x-3">
                         <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center">
                            <Clock size={10} className="mr-1" /> {task.dueDate}
                         </span>
                         <span className="text-slate-200">|</span>
                         <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${
                            task.priority === 'high' ? 'bg-rose-50 text-rose-600' : 
                            task.priority === 'medium' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                         }`}>
                            {task.priority} Priority
                         </span>
                      </div>
                   </div>
                   <button 
                      onClick={() => deleteTask(task.id)}
                      className="p-3 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                   >
                      <Trash2 size={18} />
                   </button>
                </div>
             ))
           ) : (
              <div className="text-center py-20 mica rounded-organic border border-dashed border-slate-200">
                 <ListTodo size={48} className="mx-auto text-slate-200 mb-4" />
                 <p className="text-sm font-black text-slate-400 uppercase tracking-widest">
                   {activeCategory === '全部' ? '目前没有待办任务' : `${activeCategory} 分类下暂无任务`}
                 </p>
              </div>
           )}
        </div>

        {/* Floating Action Button - Positioned fixed with high Z-index */}
        <button 
          onClick={() => {
            setNewTask({ ...newTask, category: activeCategory !== '全部' ? activeCategory : '工作' });
            setIsAddTaskModalOpen(true);
          }}
          className="fixed bottom-10 right-8 w-16 h-16 bg-indigo-600 text-white rounded-[2rem] shadow-2xl shadow-indigo-500/40 flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-[60] group border border-white/20"
        >
           <div className="absolute inset-0 bg-indigo-400 rounded-[2rem] animate-ping opacity-20"></div>
           <Plus size={32} className="relative group-hover:rotate-90 transition-transform duration-500" />
        </button>

        {/* New Task Modal */}
        {isAddTaskModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 animate-in fade-in duration-300">
             <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setIsAddTaskModalOpen(false)}></div>
             <div className="relative w-full max-w-lg mica p-10 rounded-organic border border-white/50 shadow-[0_32px_128px_-16px_rgba(0,0,0,0.3)] animate-in slide-in-from-bottom-12 duration-500">
                <div className="flex items-center justify-between mb-10">
                   <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/30">
                         <Edit3 size={24} />
                      </div>
                      <div>
                         <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">新建待办任务</h3>
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Orchestrate Your Workflow</p>
                      </div>
                   </div>
                   <button onClick={() => setIsAddTaskModalOpen(false)} className="p-2 text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors">
                      <X size={24} />
                   </button>
                </div>

                <form onSubmit={handleAddTask} className="space-y-6">
                   <div className="space-y-2">
                      <div className="flex justify-between items-center px-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">任务标题</label>
                        <button 
                          type="button"
                          onClick={handleAiPolish}
                          disabled={!newTask.title || isAiPolishing}
                          className="flex items-center space-x-1.5 text-[9px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-700 disabled:opacity-30 transition-all"
                        >
                           {isAiPolishing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                           <span>AI 润色</span>
                        </button>
                      </div>
                      <input 
                         type="text" 
                         autoFocus
                         required
                         value={newTask.title}
                         onChange={(e) => setNewTask({...newTask, title: e.target.value})}
                         placeholder="你需要完成什么？"
                         className="w-full bg-slate-50 dark:bg-white/5 border-none rounded-2xl py-5 px-6 outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-bold transition-all"
                      />
                   </div>

                   <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                         <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">优先级</label>
                         <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5">
                            {[
                              { id: 'low', label: '低' },
                              { id: 'medium', label: '中' },
                              { id: 'high', label: '高' },
                            ].map(p => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => setNewTask({...newTask, priority: p.id as TodoTask['priority']})}
                                className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                  newTask.priority === p.id 
                                    ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm' 
                                    : 'text-slate-400 hover:text-slate-600'
                                }`}
                              >
                                {p.label}
                              </button>
                            ))}
                         </div>
                      </div>
                      <div className="space-y-2">
                         <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">截止日期</label>
                         <div className="relative">
                            <CalendarIcon size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input 
                               type="date" 
                               value={newTask.dueDate}
                               onChange={(e) => setNewTask({...newTask, dueDate: e.target.value})}
                               className="w-full bg-slate-50 dark:bg-white/5 border-none rounded-2xl py-3.5 pl-11 pr-4 outline-none focus:ring-2 focus:ring-indigo-500/20 text-[10px] font-bold uppercase tracking-widest transition-all"
                            />
                         </div>
                      </div>
                   </div>

                   <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">任务分类</label>
                      <div className="flex flex-wrap gap-2">
                         {categories.filter(c => c !== '全部').map(cat => (
                           <button
                             key={cat}
                             type="button"
                             onClick={() => setNewTask({...newTask, category: cat})}
                             className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${
                               newTask.category === cat 
                                 ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 border-indigo-200 shadow-sm' 
                                 : 'bg-white dark:bg-white/5 text-slate-400 border-white/50 dark:border-white/5 hover:border-slate-200'
                             }`}
                           >
                              {cat}
                           </button>
                         ))}
                      </div>
                   </div>

                   <div className="pt-6">
                      <button 
                        type="submit"
                        disabled={!newTask.title.trim()}
                        className="w-full bg-indigo-600 text-white py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl shadow-indigo-500/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center space-x-3 disabled:opacity-50"
                      >
                         <CheckCircle2 size={18} />
                         <span>创建待办任务</span>
                      </button>
                   </div>
                </form>
             </div>
          </div>
        )}
      </div>
    );
  };

  const handleLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingLeave(true);
    const check = await getAIResponse(`我打算在 ${leaveData.start} 到 ${leaveData.end} 期间请 ${leaveData.type}，理由是：${leaveData.reason}。请以专业HR助手的身份，根据公司通常的日程（假设这段时间没有全员大会），给出一条简短的审批建议或提醒事项。`, 'Leave Request Page');
    setLeaveAiCheck(check);
    setIsSubmittingLeave(false);
  };

  const renderNewsDetail = (item: NewsItem) => (
    <div className="max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-12 duration-1000 pb-20">
      {/* Navigation & Actions */}
      <div className="flex items-center justify-between mb-8 px-4">
        <button onClick={() => setSelectedNews(null)} className="flex items-center space-x-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors">
          <ArrowLeft size={16} />
          <span>返回列表</span>
        </button>
        <div className="flex items-center space-x-4">
           <button className="p-2 mica border border-white/50 rounded-xl text-slate-400 hover:text-rose-500 transition-colors">
              <Heart size={18} />
           </button>
           <button className="p-2 mica border border-white/50 rounded-xl text-slate-400 hover:text-indigo-600 transition-colors">
              <Bookmark size={18} />
           </button>
           <button className="p-2 mica border border-white/50 rounded-xl text-slate-400 hover:text-indigo-600 transition-colors">
              <Share2 size={18} />
           </button>
        </div>
      </div>

      {/* Hero Section: Image and Title Integration */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 rounded-[3rem] overflow-hidden mica border border-white/50 shadow-2xl mb-12">
        <div className="lg:col-span-10 p-10 lg:p-14 flex flex-col justify-center space-y-6">
           <div className="flex items-center space-x-3">
              <span className="px-4 py-1.5 bg-indigo-600 text-white text-[9px] font-black rounded-full uppercase tracking-widest shadow-lg shadow-indigo-600/20">{item.category}</span>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{item.date}</span>
           </div>
           <h1 className="text-3xl lg:text-5xl font-black text-slate-900 dark:text-white tracking-tighter leading-[1.1]">
              {item.title}
           </h1>
           <p className="text-base font-medium text-slate-500 dark:text-slate-400 leading-relaxed italic border-l-4 border-indigo-600 pl-6 py-1">
              {item.summary}
           </p>
           <div className="flex items-center space-x-4 pt-2">
              <img src={`https://i.pravatar.cc/150?u=${item.author}`} className="w-10 h-10 rounded-2xl object-cover ring-4 ring-white dark:ring-slate-800 shadow-lg" />
              <div>
                 <p className="text-sm font-black text-slate-900 dark:text-white leading-none mb-1">{item.author}</p>
                 <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">ShiKu Internal Newsroom · 5 min read</p>
              </div>
           </div>
        </div>
        <div className="lg:col-span-2 relative h-64 lg:h-auto">
           <img src={item.image} className="absolute inset-0 w-full h-full object-cover" />
           <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent lg:from-transparent"></div>
        </div>
      </div>

      {/* Content Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 px-4">
        {/* Main Content */}
        <div className="lg:col-span-8 space-y-12">
           <div className="mica p-10 lg:p-16 rounded-[3rem] border border-white/50 shadow-xl">
              <div className="prose prose-lg dark:prose-invert max-w-none 
                 prose-headings:font-black prose-headings:tracking-tight prose-headings:text-slate-900 dark:prose-headings:text-white
                 prose-p:font-medium prose-p:leading-relaxed prose-p:text-slate-600 dark:prose-p:text-slate-300
                 prose-strong:font-black prose-strong:text-indigo-600
                 prose-blockquote:border-l-indigo-600 prose-blockquote:bg-indigo-50/50 dark:prose-blockquote:bg-indigo-900/10 prose-blockquote:py-2 prose-blockquote:rounded-r-2xl
                 prose-img:rounded-[2rem] prose-img:shadow-2xl">
                 <ReactMarkdown remarkPlugins={[remarkGfm]}>
                   {item.content || `
## 核心摘要
${item.summary}

### 详细说明
本通知旨在明确 ShiKu Home 在 2024 年度的关键方针。我们始终坚持“以人为本，技术驱动”的核心理念，为全体员工创造更高效、更具包容性的工作环境。

![Office Environment](https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=1200&auto=format&fit=crop)
*图：ShiKu Home 2024 办公环境升级预览*

1. **执行细节**：从即日起生效，所有相关部门需在 5 个工作日内完成系统更新。
2. **员工影响**：本次调整将显著优化办公流程，预计可减少约 20% 的行政审批时间。
3. **后续支持**：如有疑问，请通过 [ShiKu Chat](#) 联系行政部 (Admin Department)。

> "在这个瞬息万变的时代，我们的唯一不变就是持续进化的决心。" —— ShiKu Home 管理委员会

### 关键里程碑
在过去的一个季度中，我们见证了团队在多个维度的突破。无论是技术架构的升级，还是企业文化的深耕，每一位员工的贡献都不可或缺。

![Team Collaboration](https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=1200&auto=format&fit=crop)
*图：跨部门协作会议现场*
                   `}
                 </ReactMarkdown>
              </div>
           </div>

        </div>

        {/* Sidebar */}
        <div className="lg:col-span-4 space-y-8">
           {/* Related News */}
           <div className="mica p-8 rounded-[2.5rem] border border-white/50 shadow-xl">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6">相关推荐</h3>
              <div className="space-y-6">
                 {MOCK_NEWS.filter(n => n.id !== item.id).map(news => (
                   <div key={news.id} onClick={() => setSelectedNews(news)} className="group cursor-pointer flex space-x-4">
                      <div className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0">
                         <img src={news.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                      </div>
                      <div className="flex flex-col justify-center">
                         <h4 className="text-sm font-black text-slate-900 dark:text-white line-clamp-2 group-hover:text-indigo-600 transition-colors leading-snug">{news.title}</h4>
                         <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">{news.date}</p>
                      </div>
                   </div>
                 ))}
              </div>
           </div>

           {/* Tags */}
           <div className="mica p-8 rounded-[2.5rem] border border-white/50 shadow-xl">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6">热门标签</h3>
              <div className="flex flex-wrap gap-2">
                 {['# 2024规划', '# 办公升级', '# 企业文化', '# 效率提升', '# 团队协作'].map(tag => (
                   <span key={tag} className="px-3 py-1.5 bg-slate-50 dark:bg-white/5 border border-white dark:border-white/5 rounded-xl text-[10px] font-bold text-slate-500 hover:text-indigo-600 hover:border-indigo-600 transition-all cursor-pointer">
                      {tag}
                   </span>
                 ))}
              </div>
           </div>

           {/* Newsletter */}
           <div className="bg-indigo-600 p-8 rounded-[2.5rem] shadow-xl shadow-indigo-600/20 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
              <h3 className="text-xl font-black mb-2 relative z-10">订阅周报</h3>
              <p className="text-xs font-medium text-indigo-100 mb-6 relative z-10 opacity-80">获取 ShiKu Home 最新的资讯与动态，每周一准时送达。</p>
              <div className="space-y-3 relative z-10">
                 <input type="email" placeholder="your@email.com" className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/50 transition-all" />
                 <button className="w-full bg-white text-indigo-600 text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all">立即订阅</button>
              </div>
           </div>
        </div>
      </div>
    </div>
  );

  const renderLeaveRequest = () => (
    <div className="max-w-5xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
      <div className="flex items-center justify-between">
         <div>
            <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">休假申请中心</h1>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">Smart Leave Management System</p>
         </div>
         <div className="flex items-center space-x-4">
            <div className="text-right">
               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">年假剩余额度</p>
               <p className="text-2xl font-black text-indigo-600">12.5 <span className="text-xs">天</span></p>
            </div>
            <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl flex items-center justify-center text-indigo-600">
               <CalendarCheck size={24} />
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-7">
           <form onSubmit={handleLeaveSubmit} className="mica p-10 rounded-organic border border-white/50 shadow-2xl space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">休假类型</label>
                    <select 
                       value={leaveData.type}
                       onChange={(e) => setLeaveData({...leaveData, type: e.target.value})}
                       className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-bold appearance-none"
                    >
                       <option>年假</option>
                       <option>病假</option>
                       <option>调休</option>
                       <option>婚/丧假</option>
                       <option>事假</option>
                    </select>
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">当前代办状态</label>
                    <div className="flex items-center space-x-2 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-100 dark:border-emerald-800/30">
                       <ClipboardCheck size={18} className="text-emerald-600" />
                       <span className="text-xs font-black text-emerald-600 uppercase">流程畅通</span>
                    </div>
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">开始日期</label>
                    <div className="relative">
                       <Timer size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                       <input 
                          type="date" 
                          value={leaveData.start}
                          onChange={(e) => setLeaveData({...leaveData, start: e.target.value})}
                          className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl py-4 pl-12 pr-4 outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-bold" 
                       />
                    </div>
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">结束日期</label>
                    <div className="relative">
                       <Timer size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                       <input 
                          type="date" 
                          value={leaveData.end}
                          onChange={(e) => setLeaveData({...leaveData, end: e.target.value})}
                          className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl py-4 pl-12 pr-4 outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-bold" 
                       />
                    </div>
                 </div>
              </div>

              <div className="space-y-2">
                 <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">请假事由</label>
                 <textarea 
                    value={leaveData.reason}
                    onChange={(e) => setLeaveData({...leaveData, reason: e.target.value})}
                    placeholder="请输入您的请假理由..."
                    className="w-full h-32 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl p-6 outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium resize-none transition-all"
                 />
              </div>

              <div className="pt-4">
                 <button 
                    disabled={isSubmittingLeave || !leaveData.start || !leaveData.end}
                    className="w-full bg-indigo-600 text-white py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl shadow-indigo-500/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center space-x-3 disabled:opacity-50"
                 >
                    {isSubmittingLeave ? <Loader2 size={18} className="animate-spin" /> : <><PlaneTakeoff size={18} /><span>提交审批单</span></>}
                 </button>
                 <p className="text-center text-[9px] text-slate-400 mt-4 uppercase tracking-widest font-bold">申请将自动发送至直属主管及 HR 邮箱</p>
              </div>
           </form>
        </div>

        <div className="lg:col-span-5 space-y-8">
           <div className="mica p-8 rounded-organic border border-indigo-100 dark:border-indigo-900/30 shadow-xl bg-gradient-to-br from-white to-indigo-50/30 dark:from-slate-900 dark:to-indigo-900/10">
              <div className="flex items-center space-x-3 mb-6">
                 <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/30">
                    <Sparkles size={20} className="animate-pulse" />
                 </div>
                 <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">AI 智能分析</h3>
              </div>
              <div className="space-y-4">
                 {leaveAiCheck ? (
                   <div className="text-xs font-medium text-slate-600 dark:text-slate-300 leading-relaxed italic">
                      {leaveAiCheck}
                   </div>
                 ) : (
                   <div className="text-xs font-medium text-slate-400 italic">
                      填写日期和理由后，点击提交。ShiKu AI 将为您检查这段时间的团队日程和潜在冲突。
                   </div>
                 )}
              </div>
           </div>

           <div className="mica p-8 rounded-organic border border-white/50 shadow-xl space-y-6">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-800 dark:text-white">近期休假历史</h3>
              <div className="space-y-4">
                 {[
                   { type: '病假', date: '2024-04-12', days: '1.0', status: '已完成' },
                   { type: '年假', date: '2024-02-10', days: '5.0', status: '已完成' },
                 ].map((hist, i) => (
                   <div key={i} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-white dark:border-white/5 group hover:-translate-y-0.5 transition-all">
                      <div className="flex items-center space-x-3">
                         <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center text-slate-400">
                            <History size={16} />
                         </div>
                         <div>
                            <p className="text-xs font-bold text-slate-800 dark:text-white">{hist.type}</p>
                            <p className="text-[8px] text-slate-400 uppercase font-bold">{hist.date}</p>
                         </div>
                      </div>
                      <div className="text-right">
                         <p className="text-xs font-black text-slate-800 dark:text-white">{hist.days} 天</p>
                         <p className="text-[8px] text-emerald-500 font-bold uppercase">{hist.status}</p>
                      </div>
                   </div>
                 ))}
              </div>
           </div>
        </div>
      </div>
    </div>
  );

  const renderEmployeeDetail = (employee: Employee) => (
    <div className="max-w-5xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-12 duration-1000 pb-20">
      <button onClick={() => setSelectedEmployee(null)} className="flex items-center space-x-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors">
        <ArrowLeft size={16} />
        <span>返回目录</span>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Left Column: Profile Card */}
        <div className="lg:col-span-4 space-y-6">
          <div className="mica p-8 rounded-[3rem] border border-white/50 shadow-2xl text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-br from-indigo-600 to-purple-600 opacity-10"></div>
            <div className="relative mb-6 mx-auto w-40 h-40">
              <div className="w-40 h-40 rounded-[3rem] p-1.5 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 shadow-2xl">
                <img src={employee.avatar} className="w-full h-full rounded-[2.5rem] object-cover border-4 border-white dark:border-slate-900" />
              </div>
              <div className={`absolute bottom-2 right-2 w-6 h-6 rounded-full border-4 border-white dark:border-slate-900 shadow-lg ${employee.status === '在线' ? 'bg-emerald-500' : employee.status === '会议中' ? 'bg-amber-500' : 'bg-slate-300'}`}></div>
            </div>
            <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-1">{employee.name}</h2>
            <p className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.2em] mb-4">{employee.role}</p>
            
            <div className="flex justify-center space-x-3 mb-8">
              <button className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-500 hover:bg-indigo-600 hover:text-white transition-all">
                <Mail size={18} />
              </button>
              <button className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-500 hover:bg-indigo-600 hover:text-white transition-all">
                <MessageSquare size={18} />
              </button>
              <button className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-500 hover:bg-indigo-600 hover:text-white transition-all">
                <Phone size={18} />
              </button>
            </div>

            <div className="space-y-3 pt-6 border-t border-slate-100 dark:border-white/5">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
                <span className="text-slate-400">部门</span>
                <span className="text-slate-900 dark:text-white">{employee.department}</span>
              </div>
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
                <span className="text-slate-400">邮箱</span>
                <span className="text-slate-900 dark:text-white">{employee.email}</span>
              </div>
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
                <span className="text-slate-400">地点</span>
                <span className="text-slate-900 dark:text-white">{employee.location || '北京总部'}</span>
              </div>
            </div>
          </div>

          <div className="mica p-8 rounded-[2.5rem] border border-white/50 shadow-xl">
             <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6">核心技能</h3>
             <div className="flex flex-wrap gap-2">
                {(employee.skills || ['UI 设计', '用户研究', 'Figma', 'React', '团队协作']).map(skill => (
                  <span key={skill} className="px-3 py-1 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 text-[9px] font-black uppercase tracking-widest rounded-lg border border-white/50">
                    {skill}
                  </span>
                ))}
             </div>
          </div>
        </div>

        {/* Right Column: Details */}
        <div className="lg:col-span-8 space-y-8">
          <div className="mica p-10 rounded-[3rem] border border-white/50 shadow-2xl">
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-6 flex items-center">
              <User size={20} className="mr-3 text-indigo-600" />
              个人简介
            </h3>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
              {employee.bio || `${employee.name} 是 ${employee.department} 的 ${employee.role}。在 ShiKu Home 工作的 3 年间，TA 参与了多个核心项目的研发与设计工作，致力于提升企业内部协作效率。TA 相信技术的力量可以改变人们的工作方式，并始终保持对新技术的探索热情。`}
            </p>
          </div>

          <div className="mica p-10 rounded-[3rem] border border-white/50 shadow-2xl">
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-8 flex items-center">
              <Briefcase size={20} className="mr-3 text-indigo-600" />
              当前参与项目
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               {(employee.projects || ['ShiKu Home 2.0', 'AI 助手集成', '移动端重构']).map((project, i) => (
                 <div key={i} className="p-6 bg-slate-50 dark:bg-white/5 rounded-3xl border border-white dark:border-white/5 group hover:border-indigo-500/30 transition-all">
                    <div className="flex items-center justify-between mb-4">
                       <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center text-indigo-600 shadow-sm">
                          <Target size={20} />
                       </div>
                       <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-md">进行中</span>
                    </div>
                    <h4 className="text-sm font-black text-slate-900 dark:text-white mb-2">{project}</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">最后更新: 2天前</p>
                 </div>
               ))}
            </div>
          </div>

          <div className="mica p-10 rounded-[3rem] border border-white/50 shadow-2xl">
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-8 flex items-center">
              <Award size={20} className="mr-3 text-indigo-600" />
              荣誉与成就
            </h3>
            <div className="space-y-4">
               {[
                 { title: '2023 年度优秀员工', date: '2023.12', icon: <Star className="text-amber-500" /> },
                 { title: 'Q2 季度创新奖', date: '2023.06', icon: <Zap className="text-indigo-500" /> },
               ].map((award, i) => (
                 <div key={i} className="flex items-center justify-between p-5 bg-slate-50 dark:bg-white/5 rounded-2xl border border-white dark:border-white/5">
                    <div className="flex items-center space-x-4">
                       <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center shadow-sm">
                          {award.icon}
                       </div>
                       <div>
                          <p className="text-sm font-black text-slate-900 dark:text-white">{award.title}</p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{award.date}</p>
                       </div>
                    </div>
                    <ChevronRight size={16} className="text-slate-300" />
                 </div>
               ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderProfileView = () => (
    <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-20">
      {/* Profile Header Card */}
      <div className="mica rounded-[3rem] overflow-hidden border border-white/50 shadow-2xl relative">
        <div className="h-48 bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 relative overflow-hidden">
           <div className="absolute inset-0 bg-cubes opacity-20"></div>
           <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0.2),transparent)]"></div>
        </div>
        <div className="px-10 pb-10 pt-0 relative">
           <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="flex flex-col md:flex-row items-center md:items-end space-y-4 md:space-y-0 md:space-x-8">
                 <div className="relative -mt-16 w-40 h-40">
                    <div className="w-40 h-40 rounded-[2.5rem] p-1.5 bg-white dark:bg-slate-900 shadow-2xl relative z-10">
                       <img src="https://i.pravatar.cc/150?u=alex" className="w-full h-full rounded-[2rem] object-cover" />
                    </div>
                    <button className="absolute bottom-2 right-2 w-10 h-10 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg border-4 border-white dark:border-slate-900 hover:scale-110 transition-transform z-20">
                       <Camera size={18} />
                    </button>
                 </div>
                 <div className="text-center md:text-left pb-2">
                    <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">Alex Johnson</h1>
                    <div className="flex items-center justify-center md:justify-start space-x-3 mt-1">
                       <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Product Design Lead</span>
                       <span className="text-slate-300">|</span>
                       <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">设计部 · 北京</span>
                    </div>
                 </div>
              </div>
              <div className="flex items-center space-x-3 pb-2">
                 <button onClick={() => setCurrentView(AppView.SETTINGS)} className="px-6 py-2.5 mica border border-white/50 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-600 transition-all">
                    编辑资料
                 </button>
                 <button className="px-6 py-2.5 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-600/20 hover:scale-105 active:scale-95 transition-all">
                    分享主页
                 </button>
              </div>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Stats & Info */}
        <div className="lg:col-span-4 space-y-8">
           <div className="mica p-8 rounded-[2.5rem] border border-white/50 shadow-xl">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6">工作统计</h3>
              <div className="grid grid-cols-2 gap-4">
                 <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-white dark:border-white/5 text-center">
                    <p className="text-2xl font-black text-slate-900 dark:text-white">128</p>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">已完成任务</p>
                 </div>
                 <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-white dark:border-white/5 text-center">
                    <p className="text-2xl font-black text-slate-900 dark:text-white">12.5</p>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">剩余年假</p>
                 </div>
                 <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-white dark:border-white/5 text-center">
                    <p className="text-2xl font-black text-slate-900 dark:text-white">42</p>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">获赞次数</p>
                 </div>
                 <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-white dark:border-white/5 text-center">
                    <p className="text-2xl font-black text-slate-900 dark:text-white">15</p>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">参与项目</p>
                 </div>
              </div>
           </div>

           <div className="mica p-8 rounded-[2.5rem] border border-white/50 shadow-xl">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6">联系方式</h3>
              <div className="space-y-4">
                 <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl flex items-center justify-center text-indigo-600">
                       <Mail size={18} />
                    </div>
                    <div>
                       <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">企业邮箱</p>
                       <p className="text-xs font-bold text-slate-900 dark:text-white">alex.j@shiku.com</p>
                    </div>
                 </div>
                 <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl flex items-center justify-center text-emerald-600">
                       <Phone size={18} />
                    </div>
                    <div>
                       <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">分机号码</p>
                       <p className="text-xs font-bold text-slate-900 dark:text-white">#8012</p>
                    </div>
                 </div>
                 <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-amber-50 dark:bg-amber-900/20 rounded-xl flex items-center justify-center text-amber-600">
                       <MapPin size={18} />
                    </div>
                    <div>
                       <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">办公地点</p>
                       <p className="text-xs font-bold text-slate-900 dark:text-white">北京研发中心 · 4F-A02</p>
                    </div>
                 </div>
              </div>
           </div>
        </div>

        {/* Right Column: Content Sections */}
        <div className="lg:col-span-8 space-y-8">
           <div className="mica p-10 rounded-[3rem] border border-white/50 shadow-2xl">
              <div className="flex items-center justify-between mb-8">
                 <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center">
                    <History size={20} className="mr-3 text-indigo-600" />
                    最近活动
                 </h3>
                 <button className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline">查看全部</button>
              </div>
              <div className="space-y-6">
                 {[
                   { action: '完成了任务', target: 'Q3 季度预算审核', time: '2小时前', icon: <CheckCircle2 size={14} />, color: 'text-emerald-500' },
                   { action: '发布了动态', target: '关于新一代协同工具的思考', time: '昨天', icon: <Share2 size={14} />, color: 'text-blue-500' },
                   { action: '更新了资料', target: '个人技能标签', time: '3天前', icon: <Edit3 size={14} />, color: 'text-purple-500' },
                 ].map((act, i) => (
                   <div key={i} className="flex items-start space-x-4 group">
                      <div className={`mt-1 w-8 h-8 rounded-full bg-slate-50 dark:bg-white/5 flex items-center justify-center ${act.color} border border-white dark:border-white/5`}>
                         {act.icon}
                      </div>
                      <div className="flex-1 border-b border-slate-100 dark:border-white/5 pb-4 group-last:border-none">
                         <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                            <span className="font-black text-slate-900 dark:text-white mr-1">{act.action}</span>
                            <span className="text-indigo-600 font-bold">"{act.target}"</span>
                         </p>
                         <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">{act.time}</p>
                      </div>
                   </div>
                 ))}
              </div>
           </div>

           <div className="mica p-10 rounded-[3rem] border border-white/50 shadow-2xl">
              <div className="flex items-center justify-between mb-8">
                 <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center">
                    <Bookmark size={20} className="mr-3 text-indigo-600" />
                    我的收藏
                 </h3>
                 <div className="flex space-x-2">
                    <button className="px-4 py-1.5 rounded-xl bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest">全部</button>
                    <button className="px-4 py-1.5 rounded-xl mica text-slate-400 text-[9px] font-black uppercase tracking-widest hover:text-indigo-600">资讯</button>
                    <button className="px-4 py-1.5 rounded-xl mica text-slate-400 text-[9px] font-black uppercase tracking-widest hover:text-indigo-600">文档</button>
                 </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {MOCK_NEWS.slice(0, 2).map(news => (
                   <div key={news.id} onClick={() => setSelectedNews(news)} className="group cursor-pointer">
                      <div className="h-32 rounded-2xl overflow-hidden mb-3 relative">
                         <img src={news.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                         <div className="absolute top-2 right-2">
                            <div className="p-1.5 bg-white/20 backdrop-blur-md rounded-lg text-white">
                               <Bookmark size={12} fill="currentColor" />
                            </div>
                         </div>
                      </div>
                      <h4 className="text-sm font-black text-slate-900 dark:text-white line-clamp-1 group-hover:text-indigo-600 transition-colors">{news.title}</h4>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">{news.date} · {news.category}</p>
                   </div>
                 ))}
              </div>
           </div>
        </div>
      </div>
    </div>
  );

  const renderNewsCenter = () => {
    const activeNewsCategory = '全部'; // This could be stateful if needed

    return (
      <div className="space-y-12 animate-in fade-in duration-700 slide-in-from-bottom-8 pb-20">
        {/* News Center Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter uppercase leading-none">资讯中心</h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.3em] mt-2">ShiKu Home Intelligence & Insights</p>
          </div>
          <div className="flex bg-white/40 dark:bg-white/5 p-1.5 rounded-2xl border border-white/50 shadow-sm">
             {['全部', '公司', '技术', '生活'].map(t => (
               <button key={t} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeNewsCategory === t ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:text-slate-600'}`}>
                 {t}
               </button>
             ))}
          </div>
        </div>

        {/* Main News Carousel */}
        <div className="relative h-[400px] lg:h-[500px] rounded-[3rem] overflow-hidden shadow-2xl group">
          <AnimatePresence mode="wait">
            <motion.div
              key={newsCarouselIndex}
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -100 }}
              transition={{ duration: 0.6, ease: "circOut" }}
              className="absolute inset-0"
            >
              <img 
                src={CAROUSEL_ITEMS[newsCarouselIndex].image} 
                className="w-full h-full object-cover" 
                alt={CAROUSEL_ITEMS[newsCarouselIndex].title}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent"></div>
              
              <div className="absolute bottom-0 left-0 w-full p-10 lg:p-16 space-y-4">
                <motion.span 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="px-4 py-1.5 bg-indigo-600 text-white text-[10px] font-black rounded-full uppercase tracking-widest shadow-lg inline-block"
                >
                  {CAROUSEL_ITEMS[newsCarouselIndex].badge}
                </motion.span>
                <motion.h2 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-4xl lg:text-6xl font-black text-white tracking-tighter leading-none max-w-3xl"
                >
                  {CAROUSEL_ITEMS[newsCarouselIndex].title}
                </motion.h2>
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="flex items-center space-x-6 pt-4"
                >
                  <button className="px-8 py-3 bg-white text-slate-900 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl">
                    立即阅读
                  </button>
                  <button className="flex items-center space-x-2 text-white/80 hover:text-white transition-colors">
                    <Share2 size={18} />
                    <span className="text-[10px] font-black uppercase tracking-widest">分享资讯</span>
                  </button>
                </motion.div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Carousel Controls */}
          <div className="absolute bottom-10 right-10 flex items-center space-x-3 z-20">
            <button 
              onClick={() => setNewsCarouselIndex((prev) => (prev - 1 + CAROUSEL_ITEMS.length) % CAROUSEL_ITEMS.length)}
              className="w-12 h-12 rounded-2xl mica border border-white/20 text-white flex items-center justify-center hover:bg-white hover:text-slate-900 transition-all"
            >
              <ChevronLeft size={20} />
            </button>
            <button 
              onClick={() => setNewsCarouselIndex((prev) => (prev + 1) % CAROUSEL_ITEMS.length)}
              className="w-12 h-12 rounded-2xl mica border border-white/20 text-white flex items-center justify-center hover:bg-white hover:text-slate-900 transition-all"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Indicators */}
          <div className="absolute top-10 right-10 flex space-x-2 z-20">
            {CAROUSEL_ITEMS.map((_, i) => (
              <button 
                key={i}
                onClick={() => setNewsCarouselIndex(i)}
                className={`h-1.5 rounded-full transition-all duration-500 ${newsCarouselIndex === i ? 'w-8 bg-white' : 'w-2 bg-white/30'}`}
              />
            ))}
          </div>
        </div>

        {/* News Grid Section */}
        <div className="space-y-8">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">最新动态 · Latest Updates</h3>
            <div className="flex items-center space-x-4">
               <button className="flex items-center space-x-2 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-600 transition-colors">
                  <Filter size={14} />
                  <span>筛选</span>
               </button>
               <div className="flex items-center space-x-1 bg-slate-100 dark:bg-white/5 p-1 rounded-xl border border-slate-200 dark:border-white/10">
                  <button 
                    onClick={() => setNewsViewMode('grid')}
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg transition-all ${newsViewMode === 'grid' ? 'bg-white dark:bg-white/10 shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    <LayoutGrid size={14} />
                    <span className="text-[9px] font-black uppercase tracking-widest">网格</span>
                  </button>
                  <button 
                    onClick={() => setNewsViewMode('list')}
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg transition-all ${newsViewMode === 'list' ? 'bg-white dark:bg-white/10 shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    <List size={14} />
                    <span className="text-[9px] font-black uppercase tracking-widest">列表</span>
                  </button>
               </div>
            </div>
          </div>

          {newsViewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {MOCK_NEWS.map(news => (
                <div 
                  key={news.id} 
                  onClick={() => setSelectedNews(news)} 
                  className="mica group rounded-[2.5rem] overflow-hidden border border-white/50 shadow-xl flex flex-col hover:-translate-y-2 transition-all duration-500 cursor-pointer"
                >
                  <div className="h-56 overflow-hidden relative">
                    <img src={news.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" referrerPolicy="no-referrer" />
                    <div className="absolute top-4 left-4">
                      <span className="px-3 py-1 bg-white/20 backdrop-blur-md text-white text-[8px] font-black rounded-full uppercase tracking-widest border border-white/20">{news.category}</span>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  </div>
                  <div className="p-8 flex-1 flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-2">
                        <img src={`https://i.pravatar.cc/150?u=${news.author}`} className="w-6 h-6 rounded-lg object-cover" referrerPolicy="no-referrer" />
                        <span className="text-[10px] font-bold text-slate-400">{news.author}</span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400">{news.date}</span>
                    </div>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white leading-tight mb-4 group-hover:text-indigo-600 transition-colors">{news.title}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-6 flex-1">{news.summary}</p>
                    <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-white/5">
                      <button className="flex items-center space-x-2 text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                        <span>阅读全文</span>
                        <ChevronRight size={14} />
                      </button>
                      <div className="flex items-center space-x-3 text-slate-300">
                         <Heart size={14} />
                         <MessageSquare size={14} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {MOCK_NEWS.map(news => (
                <div 
                  key={news.id} 
                  onClick={() => setSelectedNews(news)} 
                  className="mica group rounded-3xl overflow-hidden border border-white/50 shadow-lg flex items-center p-4 hover:bg-white/60 dark:hover:bg-white/10 transition-all duration-300 cursor-pointer"
                >
                  <div className="w-40 h-28 rounded-2xl overflow-hidden flex-shrink-0">
                    <img src={news.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" referrerPolicy="no-referrer" />
                  </div>
                  <div className="ml-6 flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <span className="text-[8px] font-black text-indigo-600 uppercase tracking-widest px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 rounded-full">{news.category}</span>
                      <span className="text-[10px] font-bold text-slate-400">{news.date}</span>
                    </div>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white group-hover:text-indigo-600 transition-colors line-clamp-1">{news.title}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-1">{news.summary}</p>
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center space-x-2">
                        <img src={`https://i.pravatar.cc/150?u=${news.author}`} className="w-5 h-5 rounded-full object-cover" referrerPolicy="no-referrer" />
                        <span className="text-[10px] font-bold text-slate-400">{news.author}</span>
                      </div>
                      <div className="flex items-center space-x-4 text-slate-300">
                         <div className="flex items-center space-x-1">
                           <Heart size={12} />
                           <span className="text-[9px] font-bold">24</span>
                         </div>
                         <div className="flex items-center space-x-1">
                           <MessageSquare size={12} />
                           <span className="text-[9px] font-bold">12</span>
                         </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderHolidayDetail = () => {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 pb-20">
        <button 
          onClick={() => setShowHolidayDetail(false)}
          className="flex items-center space-x-2 text-slate-400 hover:text-indigo-600 transition-colors mb-8 group"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          <span className="text-[10px] font-black uppercase tracking-widest">返回概览</span>
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-8 space-y-12">
            <div className="relative h-[400px] rounded-[3rem] overflow-hidden shadow-2xl">
              <img 
                src="https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&q=80&w=2000" 
                className="w-full h-full object-cover" 
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-emerald-900 via-transparent to-transparent"></div>
              <div className="absolute bottom-10 left-10">
                <div className="flex items-center space-x-3 mb-4">
                  <span className="px-4 py-1.5 bg-white/20 backdrop-blur-md text-white text-[10px] font-black rounded-full uppercase tracking-widest border border-white/20">节日专题</span>
                  <span className="text-white/60 text-[10px] font-bold uppercase tracking-widest">3月12日 · 植树节</span>
                </div>
                <h1 className="text-5xl font-black text-white tracking-tighter leading-none">种下一棵树，<br />收获一片绿</h1>
              </div>
            </div>

            <div className="mica p-10 rounded-[3rem] border border-white/50 space-y-8">
              <div className="prose prose-slate dark:prose-invert max-w-none">
                <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mb-6">关于植树节 (Arbor Day)</h2>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
                  植树节是按照法律规定宣传保护树木，并动员群众参加造林为活动内容的节日。按时间长短可分为植树日、植树周和植树月，共称为植树节。通过这种活动，激发人们爱林造林的热情，意识到环保的重要性。
                </p>
                
                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight mb-4">公司活动安排</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <div className="p-6 bg-emerald-50 dark:bg-emerald-900/10 rounded-3xl border border-emerald-100 dark:border-emerald-800/20">
                    <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-emerald-600/20">
                      <CalendarDays size={20} />
                    </div>
                    <h4 className="font-black text-slate-900 dark:text-white mb-2">线上环保知识竞赛</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">参与答题赢取环保积分，兑换精美周边。</p>
                  </div>
                  <div className="p-6 bg-emerald-50 dark:bg-emerald-900/10 rounded-3xl border border-emerald-100 dark:border-emerald-800/20">
                    <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-emerald-600/20">
                      <Target size={20} />
                    </div>
                    <h4 className="font-black text-slate-900 dark:text-white mb-2">“云植树”认领计划</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">在公司内网认领属于你的虚拟树苗，我们将以你的名义在沙漠地区种下真树。</p>
                  </div>
                </div>

                <div className="p-8 bg-slate-900 rounded-[2rem] text-white relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-10">
                    <Sparkles size={120} />
                  </div>
                  <h3 className="text-xl font-black mb-4 relative z-10">环保小贴士</h3>
                  <ul className="space-y-3 text-slate-300 text-sm relative z-10">
                    <li className="flex items-start space-x-3">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 shrink-0"></div>
                      <span>减少一次性纸杯的使用，自带水杯。</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 shrink-0"></div>
                      <span>双面打印文档，节约纸张。</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 shrink-0"></div>
                      <span>下班记得关闭显示器和不必要的电源。</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-8">
            <div className="mica p-8 rounded-[2.5rem] border border-white/50 shadow-xl">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-6">活动负责人</h3>
              <div className="flex items-center space-x-4 mb-8">
                <img src="https://i.pravatar.cc/150?u=admin" className="w-14 h-14 rounded-2xl object-cover shadow-lg" />
                <div>
                  <p className="text-base font-black text-slate-900 dark:text-white leading-none">行政部 - 小林</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Admin Specialist</p>
                </div>
              </div>
              <button className="w-full py-4 bg-slate-100 dark:bg-white/5 hover:bg-indigo-600 hover:text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center space-x-2">
                <MessageSquare size={14} />
                <span>咨询详情</span>
              </button>
            </div>

            <div className="mica p-8 rounded-[2.5rem] border border-white/50 shadow-xl bg-emerald-600 text-white">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-[10px] font-black uppercase tracking-widest opacity-80">环保成就</h3>
                <Award size={20} className="text-amber-400" />
              </div>
              <p className="text-3xl font-black tracking-tighter mb-2">1,240 棵</p>
              <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">去年公司全体员工累计种植树木数量</p>
              <div className="mt-8 pt-8 border-t border-white/10">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-2">
                  <span>今年目标</span>
                  <span>1,500 棵</span>
                </div>
                <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div className="h-full bg-white w-[82%]"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderView = () => {
    if (selectedNews) return renderNewsDetail(selectedNews);
    if (showHolidayDetail) return renderHolidayDetail();

    switch (currentView) {
      case AppView.DASHBOARD:
        return <Dashboard 
          onViewAll={() => setCurrentView(AppView.TOOLS)} 
          onGoToTodo={() => setCurrentView(AppView.TODO)} 
          onShowHolidayDetail={() => setShowHolidayDetail(true)}
        />;
      case AppView.NEWS:
        return renderNewsCenter();
      case AppView.DIRECTORY:
        if (selectedEmployee) return renderEmployeeDetail(selectedEmployee);
        return (
          <div className="space-y-10 animate-in fade-in duration-700 slide-in-from-bottom-8 pb-20">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter uppercase leading-none">团队目录</h1>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.3em] mt-2">Connecting ShiKu Talent Globally</p>
              </div>
              
              <div className="flex items-center space-x-4">
                <div className="relative hidden md:block">
                  <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="搜索姓名、部门或职位..."
                    className="mica bg-white/40 dark:bg-white/5 border border-white/50 rounded-2xl py-2.5 pl-11 pr-6 text-[10px] font-bold uppercase tracking-widest outline-none focus:ring-2 focus:ring-indigo-500/20 w-64 transition-all"
                  />
                </div>

                <div className="flex items-center space-x-1 bg-white/40 dark:bg-white/5 p-1.5 rounded-2xl border border-white/50 shadow-sm">
                  <button 
                    onClick={() => setDirectoryView('grid')}
                    className={`p-2 rounded-xl transition-all ${directoryView === 'grid' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    <Grid size={18} />
                  </button>
                  <button 
                    onClick={() => setDirectoryView('list')}
                    className={`p-2 rounded-xl transition-all ${directoryView === 'list' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    <List size={18} />
                  </button>
                </div>
              </div>
            </div>

            {directoryView === 'grid' ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {MOCK_EMPLOYEES.map(employee => (
                  <div 
                    key={employee.id}
                    onClick={() => setSelectedEmployee(employee)}
                    className="mica group p-5 rounded-[2rem] border border-white/50 hover:bg-white dark:hover:bg-slate-800 transition-all duration-500 cursor-pointer text-center relative overflow-hidden shadow-lg hover:shadow-xl hover:-translate-y-1"
                  >
                    <div className="absolute top-0 left-0 w-full h-16 bg-gradient-to-br from-indigo-600 to-purple-600 opacity-0 group-hover:opacity-5 transition-opacity"></div>
                    <div className="relative mb-4 mx-auto w-20 h-20">
                      <div className="w-20 h-20 rounded-[1.5rem] p-1 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 group-hover:from-indigo-500 group-hover:to-purple-500 transition-all duration-500 group-hover:rotate-3">
                        <img src={employee.avatar} className="w-full h-full rounded-[1.25rem] object-cover border-2 border-white dark:border-slate-900" referrerPolicy="no-referrer" />
                      </div>
                      <div className={`absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 shadow-sm ${employee.status === '在线' ? 'bg-emerald-500' : employee.status === '会议中' ? 'bg-amber-500' : 'bg-slate-300'}`}></div>
                    </div>
                    <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight leading-none mb-1 line-clamp-1">{employee.name}</h3>
                    <p className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-0.5 line-clamp-1">{employee.role}</p>
                    <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest line-clamp-1">{employee.department}</p>
                    
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5 flex items-center justify-center space-x-3 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                       <Mail size={12} className="text-slate-400 hover:text-indigo-600" />
                       <MessageSquare size={12} className="text-slate-400 hover:text-indigo-600" />
                       <Phone size={12} className="text-slate-400 hover:text-indigo-600" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mica rounded-[2.5rem] border border-white/50 overflow-hidden shadow-2xl">
                <div className="grid grid-cols-12 px-8 py-4 bg-slate-50 dark:bg-white/5 border-b border-slate-100 dark:border-white/5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <div className="col-span-5">员工信息</div>
                  <div className="col-span-3">部门</div>
                  <div className="col-span-3">状态</div>
                  <div className="col-span-1 text-right">操作</div>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-white/5">
                  {MOCK_EMPLOYEES.map(employee => (
                    <div 
                      key={employee.id}
                      onClick={() => setSelectedEmployee(employee)}
                      className="grid grid-cols-12 px-8 py-6 items-center hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors cursor-pointer group"
                    >
                      <div className="col-span-5 flex items-center space-x-4">
                        <div className="relative w-12 h-12 shrink-0">
                          <img src={employee.avatar} className="w-12 h-12 rounded-2xl object-cover border-2 border-white dark:border-slate-800 shadow-sm" />
                          <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-900 ${employee.status === '在线' ? 'bg-emerald-500' : employee.status === '会议中' ? 'bg-amber-500' : 'bg-slate-300'}`}></div>
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-900 dark:text-white leading-none mb-1 group-hover:text-indigo-600 transition-colors">{employee.name}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{employee.role}</p>
                        </div>
                      </div>
                      <div className="col-span-3">
                        <span className="px-3 py-1 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 text-[9px] font-black uppercase tracking-widest rounded-lg border border-white/50">
                          {employee.department}
                        </span>
                      </div>
                      <div className="col-span-3 flex items-center space-x-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${employee.status === '在线' ? 'bg-emerald-500' : employee.status === '会议中' ? 'bg-amber-500' : 'bg-slate-300'}`}></div>
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{employee.status}</span>
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <button className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-all">
                          <MoreVertical size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Directory Stats / Footer */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 px-4">
               <div className="flex items-center space-x-6">
                  <div className="flex -space-x-3">
                     {MOCK_EMPLOYEES.map((e, i) => (
                       <img key={i} src={e.avatar} className="w-8 h-8 rounded-full border-2 border-white dark:border-slate-900 object-cover" />
                     ))}
                     <div className="w-8 h-8 rounded-full border-2 border-white dark:border-slate-900 bg-indigo-600 flex items-center justify-center text-[10px] font-black text-white">+12</div>
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">共 16 位团队成员</p>
               </div>
               <div className="flex items-center space-x-2">
                  <button className="px-6 py-2.5 mica border border-white/50 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-all">
                    导出通讯录
                  </button>
                  <button className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-600/20 hover:scale-105 active:scale-95 transition-all">
                    邀请新成员
                  </button>
               </div>
            </div>
          </div>
        );
      case AppView.SEARCH_RESULTS:
        return (
          <div className="space-y-10 animate-in fade-in duration-700 slide-in-from-bottom-8 pb-20">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white uppercase">搜索结果</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm font-medium italic">"{globalSearch}" 的全局搜索结果</p>
              </div>
              <button 
                onClick={() => { setGlobalSearch(''); setCurrentView(AppView.DASHBOARD); }}
                className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 flex items-center space-x-2"
              >
                <RotateCcw size={14} />
                <span>清除搜索</span>
              </button>
            </div>

            <div className="mica p-8 rounded-organic border border-indigo-500/20 bg-gradient-to-br from-indigo-50/50 to-white dark:from-indigo-900/10 dark:to-slate-900 shadow-xl relative overflow-hidden group">
              <div className="absolute -top-12 -right-12 w-32 h-32 bg-indigo-500/5 rounded-full group-hover:scale-150 transition-transform duration-1000"></div>
              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/20 shrink-0">
                  {isAiSearching ? <Loader2 size={24} className="animate-spin" /> : <Sparkles size={24} />}
                </div>
                <div className="flex-1">
                   <div className="flex items-center space-x-2 mb-2">
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">AI 智能摘要</h3>
                      {isAiSearching && <span className="text-[9px] font-bold text-slate-400 animate-pulse">正在检索中...</span>}
                   </div>
                   <div className="text-sm font-medium text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">
                      {isAiSearching ? "ShiKu AI 正在为您深度解析企业知识库，请稍候..." : searchAiSummary || "输入关键词获取 AI 智能概括"}
                   </div>
                </div>
              </div>
            </div>
          </div>
        );
      case AppView.ADMIN:
        return <AdminDashboard />;
      case AppView.ABOUT:
        return renderAbout();
      case AppView.LEAVE_REQUEST:
        return renderLeaveRequest();
      case AppView.TODO:
        return renderTodoView();
      case AppView.PROFILE:
        return renderProfileView();
      case AppView.SETTINGS:
        return (
          <div className="space-y-12 animate-in fade-in duration-700 slide-in-from-bottom-8 pb-20">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white uppercase">偏好设置</h1>
              <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm font-medium">定制您的 ShiKu Home 沉浸式体验</p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              <div className="lg:col-span-4 space-y-8">
                <div className="mica rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/50 dark:border-white/10 relative group">
                  <div className="h-32 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 relative">
                     <div className="absolute inset-0 bg-cubes opacity-30"></div>
                  </div>
                  <div className="px-8 pb-8 pt-0 relative">
                     <div className="relative -mt-12 mb-4 w-24 h-24">
                        <div className="w-24 h-24 rounded-[1.5rem] p-1 bg-white dark:bg-slate-900 shadow-xl">
                           <img src="https://i.pravatar.cc/150?u=alex" className="w-full h-full rounded-[1.25rem] object-cover" />
                        </div>
                     </div>
                     <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Alex Johnson</h2>
                     <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">Product Design Lead</p>
                  </div>
                </div>
              </div>
              <div className="lg:col-span-8 space-y-8">
                <div className="mica rounded-[2.5rem] p-8 shadow-xl border border-white/50">
                  <h3 className="text-lg font-bold mb-6 flex items-center">
                    <Monitor size={16} className="text-blue-600 mr-3" />
                    显示与主题
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[
                      { id: 'light', icon: <Sun size={18} />, label: '清新浅色' },
                      { id: 'dark', icon: <Moon size={18} />, label: '深邃暗色' },
                      { id: 'system', icon: <Laptop size={18} />, label: '智能跟随' }
                    ].map((mode) => (
                      <button 
                        key={mode.id}
                        onClick={() => setThemeMode(mode.id as ThemeMode)}
                        className={`group relative flex items-center space-x-3 p-4 rounded-3xl transition-all duration-300 ${themeMode === mode.id ? 'bg-indigo-600 text-white shadow-xl -translate-y-1' : 'bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                      >
                        <div className={`p-2 rounded-2xl transition-colors ${themeMode === mode.id ? 'bg-white/20' : 'bg-white dark:bg-slate-700 shadow-sm'}`}>
                          {mode.icon}
                        </div>
                        <span className="text-[11px] font-black uppercase tracking-widest">{mode.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      case AppView.TOOLS:
        return (
          <div className="space-y-12 animate-in fade-in duration-700 slide-in-from-bottom-8">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white uppercase">应用中心</h1>
              <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm font-medium">点击启动您的工作流</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
              {QUICK_TOOLS.map(tool => (
                <button 
                  key={tool.id} 
                  onClick={() => {
                     if (tool.name === '人事门户') setCurrentView(AppView.LEAVE_REQUEST);
                     else if (tool.id === 'todo') setCurrentView(AppView.TODO);
                     else window.location.href = tool.url;
                  }}
                  className="group flex flex-col items-center p-8 mica rounded-organic hover:bg-white dark:hover:bg-slate-800 hover:-translate-y-3 transition-all duration-500 shadow-xl shadow-slate-200/20 dark:shadow-none"
                >
                  <div className={`w-16 h-16 ${tool.color} rounded-organic flex items-center justify-center mb-6 shadow-xl group-hover:scale-110 transition-transform duration-500 rim-glow`}>
                    {tool.icon}
                  </div>
                  <h3 className="text-sm font-black text-center text-slate-800 dark:text-slate-100 uppercase tracking-tighter">{tool.name}</h3>
                </button>
              ))}
            </div>
          </div>
        );
      case AppView.RESOURCES:
        return (
          <div className="space-y-10 animate-in fade-in duration-700 slide-in-from-bottom-8 pb-20">
             <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white uppercase">资源中心</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm font-medium">公司级共享文档与协作资源库</p>
             </div>
             <div className="mica p-20 rounded-organic border border-white/50 text-center">
                <Folder size={48} className="mx-auto text-slate-200 mb-6" />
                <p className="text-sm font-black text-slate-400 uppercase tracking-widest">资源中心模块正在进行安全合规升级</p>
                <p className="text-[10px] text-slate-300 font-bold mt-2 italic">预计于 2024.Q4 恢复完全访问</p>
             </div>
          </div>
        );
      default:
        return <div className="text-center py-20 text-slate-400 font-bold uppercase tracking-widest">即将上线</div>;
    }
  };

  const renderAbout = () => (
    <div className="space-y-24 animate-in fade-in slide-in-from-bottom-12 duration-1000 pb-32">
      <section className="relative pt-12 overflow-hidden">
        <div className="flex flex-col items-center text-center space-y-8 max-w-4xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-[10px] font-black uppercase tracking-[0.2em] animate-bounce">
            <Sparkles size={14} />
            <span>Since 2018 · Leading Innovation</span>
          </div>
          <h1 className="text-6xl md:text-8xl font-black text-slate-900 dark:text-white tracking-tighter leading-none">
            关于 <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">ShiKu Home</span>
          </h1>
          <p className="text-xl text-slate-500 dark:text-slate-400 font-medium max-w-2xl leading-relaxed">
            我们致力于构建下一代企业级智慧协作生态，通过 AI 驱动的技术方案，让每一位员工都能在数字空间中释放无限潜能。
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full pt-8">
            {[
              { label: '全球员工', val: '1,200+', icon: <Users2 size={20} /> },
              { label: '覆盖城市', val: '24', icon: <Globe size={20} /> },
              { label: '专利技术', val: '150+', icon: <Zap size={20} /> },
              { label: '客户满意度', val: '99.2%', icon: <Heart size={20} /> },
            ].map((s, i) => (
              <div key={i} className="mica p-6 rounded-[2rem] border border-white/50 text-center space-y-2">
                <div className="text-indigo-600 dark:text-indigo-400 flex justify-center">{s.icon}</div>
                <p className="text-2xl font-black text-slate-900 dark:text-white">{s.val}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-12">
        <div className="flex flex-col items-center text-center space-y-2">
          <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-500">Our Essence</h2>
          <h3 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">核心使命与价值观</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { 
              title: '极客创新', 
              desc: '我们不满足于平庸的解决方案。通过持续探索生成式 AI 和前沿 UX，挑战行业标准。', 
              icon: <Rocket size={32} />,
              color: 'blue'
            },
            { 
              title: '极致透明', 
              desc: '信息即力量。我们倡导开放的沟通文化，确保公司战略与每位员工的目标对齐。', 
              icon: <Target size={32} />,
              color: 'indigo'
            },
            { 
              title: '以人为本', 
              desc: '技术应为人服务。我们关注员工的工作幸福感，提供最舒适、灵活的协作环境。', 
              icon: <HeartHandshake size={32} />,
              color: 'rose'
            },
          ].map((v, i) => (
            <div key={i} className="mica group p-10 rounded-organic border border-white/50 hover:bg-white dark:hover:bg-slate-800 transition-all duration-500 shadow-xl overflow-hidden relative">
              <div className={`absolute -top-12 -right-12 w-32 h-32 bg-${v.color}-500/10 rounded-full group-hover:scale-150 transition-transform duration-700`}></div>
              <div className={`w-16 h-16 bg-${v.color}-500/10 text-${v.color}-600 rounded-2xl flex items-center justify-center mb-8 rim-glow`}>
                {v.icon}
              </div>
              <h4 className="text-2xl font-black text-slate-900 dark:text-white mb-4 tracking-tight">{v.title}</h4>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed font-medium">{v.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mica p-12 md:p-20 rounded-organic border border-white/50 shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-cubes opacity-10"></div>
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-6">
            <h2 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">成长足迹</h2>
            <p className="text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
              从一家初创工作室，成长为全球领先的智慧办公方案商，每一个脚步都见证了 ShiKu 人的执着。
            </p>
          </div>
          <div className="space-y-8 relative">
            <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-gradient-to-b from-indigo-500 via-blue-500 to-transparent"></div>
            {[
              { year: '2018', title: 'ShiKu Home 诞生', desc: '在北京一间共享办公室内开启了对智慧工作空间的探索。' },
              { year: '2020', title: '完成 B 轮融资', desc: '获得 5,000 万美元投资，加速全球市场布局。' },
              { year: '2023', title: 'AI 引擎发布', desc: '自研 ShiKu AI 引擎正式上线，重新定义自动化流转。' },
              { year: '2024', title: '全球合作伙伴突破 5,000 家', desc: '包括 40% 的世界 500 强企业正在使用我们的服务。' },
            ].map((item, i) => (
              <div key={i} className="flex items-start relative pl-12 group">
                <div className="absolute left-2 top-2 w-4.5 h-4.5 rounded-full border-4 border-white dark:border-slate-900 bg-indigo-600 -translate-x-1/2 z-10 group-hover:scale-125 transition-transform"></div>
                <div>
                   <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-1 block">{item.year}</span>
                   <h5 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">{item.title}</h5>
                   <p className="text-xs text-slate-400 font-medium mt-1">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* New Section: Open Source and Licenses */}
      <section className="space-y-12">
        <div className="flex flex-col items-center text-center space-y-2">
          <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-500">Technical Foundations</h2>
          <h3 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">开源生态与授权信息</h3>
        </div>
        <div className="mica p-10 md:p-16 rounded-organic border border-white/50 shadow-xl space-y-10">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
             {[
               { name: 'React', desc: 'UI Framework', license: 'MIT', icon: <Component size={24} /> },
               { name: 'Tailwind CSS', desc: 'Styling Engine', license: 'MIT', icon: <Braces size={24} /> },
               { name: 'Lucide', desc: 'Icon Ecosystem', license: 'ISC', icon: <Code2 size={24} /> },
               { name: 'Gemini API', desc: 'AI Foundation', license: 'Apache 2.0', icon: <Sparkles size={24} /> },
               { name: 'React Markdown', desc: 'Content Rendering', license: 'MIT', icon: <FileText size={24} /> }
             ].map((lib, i) => (
               <div key={i} className="flex flex-col items-center text-center p-4 bg-slate-50 dark:bg-white/5 rounded-3xl border border-white dark:border-white/5 hover:scale-105 transition-transform">
                  <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center text-indigo-600 mb-4 shadow-sm">
                    {lib.icon}
                  </div>
                  <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tight mb-1">{lib.name}</p>
                  <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mb-2">{lib.desc}</p>
                  <div className="flex items-center space-x-1 px-2 py-0.5 bg-slate-200 dark:bg-slate-700 rounded-full">
                     <Scale size={8} className="text-slate-500" />
                     <span className="text-[7px] font-black text-slate-600 dark:text-slate-300 uppercase">{lib.license}</span>
                  </div>
               </div>
             ))}
          </div>

          <div className="pt-8 border-t border-slate-100 dark:border-slate-800/50 flex flex-col md:flex-row items-center justify-between gap-6">
             <div className="flex items-center space-x-4">
                <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center">
                   <Copyright size={20} />
                </div>
                <div>
                   <p className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">© 2018-2024 ShiKu Home</p>
                   <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-1">版权所有，保留所有权利。</p>
                </div>
             </div>
             <div className="flex flex-wrap justify-center gap-3">
                <button className="flex items-center space-x-2 px-4 py-2 mica text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-600 transition-all rounded-xl">
                   <Globe size={14} />
                   <span>查看开源协议列表</span>
                </button>
                <button className="flex items-center space-x-2 px-4 py-2 mica text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-600 transition-all rounded-xl">
                   <SearchCode size={14} />
                   <span>安全漏洞披露说明</span>
                </button>
             </div>
          </div>
        </div>
      </section>
    </div>
  );

  if (!isLoggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen flex flex-col selection:bg-indigo-600 selection:text-white transition-colors">
      <Navbar 
        currentView={currentView} 
        setView={setCurrentView} 
        globalSearch={globalSearch} 
        setGlobalSearch={handleGlobalSearch} 
        onAskAI={handleOpenAssistantWithPrompt}
        isAdmin={isAdmin}
      />
      
      <main className="flex-1 mt-24 px-6 sm:px-8 pb-16">
        <div className="max-w-7xl mx-auto">
          {renderView()}
        </div>
      </main>

      <AIAssistant 
        isOpen={isAssistantOpen} 
        setIsOpen={setIsAssistantOpen} 
        initialPrompt={assistantInitialPrompt}
        currentView={currentView}
      />
    </div>
  );
};

export default App;
