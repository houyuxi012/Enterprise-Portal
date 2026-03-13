
import React, { useMemo, useState, useEffect } from 'react';
import { 
  TrendingUp, Calendar, Clock, ChevronRight, BellRing, UserCheck, Quote, 
  X, AlertTriangle, Utensils, Wrench, FileText, UserPlus, Cpu,
  BarChart4, Trophy, PartyPopper, ArrowUpRight, CheckSquare, ListTodo
} from 'lucide-react';
import { QUICK_TOOLS, MOCK_NEWS, DAILY_QUOTES, CAROUSEL_ITEMS, MOCK_ANNOUNCEMENTS, MOCK_TASKS } from '../constants';

interface DashboardProps {
  onViewAll: () => void;
  onGoToTodo: () => void;
  onShowHolidayDetail: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onViewAll, onGoToTodo, onShowHolidayDetail }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [voted, setVoted] = useState(false);

  const quote = useMemo(() => {
    const day = new Date().getDate();
    return DAILY_QUOTES[day % DAILY_QUOTES.length];
  }, []);

  const formattedDate = useMemo(() => {
    return new Intl.DateTimeFormat('zh-CN', { 
      month: 'long', 
      day: 'numeric', 
      weekday: 'long' 
    }).format(new Date());
  }, []);

  const pendingTasks = useMemo(() => MOCK_TASKS.filter(t => !t.completed).slice(0, 3), []);
  
  const holidayInfo = useMemo(() => {
    // For demo purposes, we'll show Arbor Day since it's March 12
    return {
      name: '植树节',
      date: '3月12日',
      countdown: 1,
      theme: 'emerald',
      message: '种下一棵树，收获一片绿。明天就是植树节了，让我们一起为地球添绿！'
    };
  }, []);

  const completionRate = useMemo(() => {
    const total = MOCK_TASKS.length;
    const completed = MOCK_TASKS.filter(t => t.completed).length;
    return Math.round((completed / total) * 100);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % CAROUSEL_ITEMS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const getTagStyles = (color: string) => {
    const styles: Record<string, string> = {
      orange: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20 border-orange-100 dark:border-orange-800/30',
      blue: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/30',
      rose: 'text-rose-600 bg-rose-50 dark:bg-rose-900/20 border-rose-100 dark:border-rose-800/30',
      emerald: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/30',
      purple: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20 border-purple-100 dark:border-purple-800/30',
    };
    return styles[color] || styles.blue;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-1000 pt-2 relative">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tighter text-slate-900 dark:text-white leading-none">
            早上好，Alex
          </h1>
          <div className="flex items-center mt-2 group">
            <Quote size={12} className="text-blue-500 mr-2 flex-shrink-0" />
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium italic tracking-tight">
              {quote} <span className="mx-2 text-slate-300 dark:text-slate-700">|</span> {formattedDate}
            </p>
          </div>
        </div>
        <div className="flex -space-x-2">
          {[1, 2, 3].map(i => (
            <img key={i} src={`https://i.pravatar.cc/100?u=${i+10}`} className="w-10 h-10 rounded-xl border-2 border-slate-50 dark:border-slate-900 shadow-md" />
          ))}
          <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 border-2 border-slate-50 dark:border-slate-900 flex items-center justify-center text-[10px] font-bold text-slate-500">
            +12
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-10">
          {/* Holiday Card */}
          <div className="mica p-8 rounded-[2.5rem] border border-emerald-500/20 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/10 dark:to-slate-900 shadow-xl relative overflow-hidden group">
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-emerald-500/5 rounded-full group-hover:scale-150 transition-transform duration-1000"></div>
            <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-emerald-500/5 rounded-full group-hover:scale-150 transition-transform duration-1000"></div>
            
            <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
              <div className="w-24 h-24 bg-emerald-600 text-white rounded-[2rem] flex flex-col items-center justify-center shadow-lg shadow-emerald-600/20 shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest opacity-80">倒计时</span>
                <span className="text-4xl font-black leading-none my-1">{holidayInfo.countdown}</span>
                <span className="text-[10px] font-black uppercase tracking-widest opacity-80">天</span>
              </div>
              
              <div className="flex-1 text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start space-x-2 mb-2">
                  <PartyPopper size={16} className="text-emerald-600" />
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-600">即将到来的节日</h3>
                </div>
                <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-2">
                  {holidayInfo.name} · {holidayInfo.date}
                </h2>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 leading-relaxed max-w-xl">
                  {holidayInfo.message}
                </p>
              </div>
              
              <button 
                onClick={onShowHolidayDetail}
                className="px-8 py-3 bg-emerald-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-emerald-600/20"
              >
                查看详情
              </button>
            </div>
          </div>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Todo Widget */}
            <div className="mica p-8 rounded-organic border border-white/50 shadow-xl relative overflow-hidden group">
               <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white flex items-center">
                    <ListTodo size={16} className="mr-2 text-indigo-500" />
                    我的待办
                  </h3>
                  <button onClick={onGoToTodo} className="text-[8px] font-black text-indigo-600 uppercase tracking-widest hover:underline">进入管理</button>
               </div>
               
               <div className="mb-6">
                  <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-400 mb-2">
                     <span>任务进度</span>
                     <span className="text-indigo-600">{completionRate}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                     <div className="h-full bg-indigo-600 transition-all duration-1000" style={{ width: `${completionRate}%` }}></div>
                  </div>
               </div>

               <div className="space-y-3">
                  {pendingTasks.map(task => (
                    <div key={task.id} className="flex items-center space-x-3 p-3 bg-white/40 dark:bg-white/5 rounded-2xl border border-white/60 dark:border-white/5 hover:bg-white transition-all group/task">
                       <div className="w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-700 flex-shrink-0"></div>
                       <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{task.title}</p>
                       <span className={`ml-auto text-[7px] px-1.5 py-0.5 rounded-md font-black uppercase ${
                         task.priority === 'high' ? 'bg-rose-100 text-rose-600' : 
                         task.priority === 'medium' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'
                       }`}>
                         {task.priority}
                       </span>
                    </div>
                  ))}
               </div>
            </div>

            <div className="mica p-8 rounded-organic border border-white/50 shadow-xl bg-gradient-to-br from-indigo-600 to-indigo-900 text-white relative group overflow-hidden">
               <div className="absolute top-[-20%] right-[-20%] w-[60%] h-[60%] bg-white/10 rounded-full blur-[80px]"></div>
               <div className="relative z-10">
                  <div className="flex items-center space-x-3 mb-6">
                     <div className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center">
                        <Trophy size={20} className="text-amber-400" />
                     </div>
                     <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-100">本月明星员工</h3>
                  </div>
                  <div className="flex items-center space-x-4 mb-6">
                     <img src="https://i.pravatar.cc/150?u=star" className="w-16 h-16 rounded-2xl border-4 border-white/20 shadow-2xl" />
                     <div>
                        <p className="text-xl font-black tracking-tight leading-none">Emily Zhao</p>
                        <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest mt-1">Growth Marketing Team</p>
                     </div>
                  </div>
                  <p className="text-[11px] text-indigo-100 font-medium leading-relaxed italic mb-6">
                    "在 Q2 增长活动中，Emily 通过自研 AI 脚本显著提升了用户转化率。"
                  </p>
                  <button className="flex items-center space-x-2 text-[9px] font-black uppercase tracking-widest text-white group-hover:translate-x-1 transition-transform">
                     <span>送上祝贺</span>
                     <PartyPopper size={14} />
                  </button>
               </div>
            </div>
          </section>

          <section>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">常用应用</h2>
              <button onClick={onViewAll} className="p-2 mica rounded-full text-slate-400 hover:text-blue-600 transition-colors">
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {QUICK_TOOLS.slice(0, 6).map((tool) => (
                <button 
                  key={tool.id} 
                  onClick={() => { if(tool.id === 'todo') onGoToTodo(); }}
                  className="mica group p-5 rounded-[1.75rem] hover:bg-white dark:hover:bg-slate-800 transition-all duration-500 border border-white/50 shadow-lg shadow-slate-200/20 dark:shadow-none text-left"
                >
                  <div className={`w-10 h-10 ${tool.color} rounded-xl flex items-center justify-center mb-4 shadow-md group-hover:scale-110 transition-transform duration-500 rim-glow`}>
                    {tool.icon}
                  </div>
                  <span className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-tighter block">{tool.name}</span>
                  <p className="text-[9px] text-slate-400 mt-1 font-medium">点击进入系统</p>
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="lg:col-span-4 space-y-8">
          <div className="mica rounded-[2rem] shadow-xl overflow-hidden border border-white/50">
            <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-white/30">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-rose-500 rounded-full animate-pulse"></div>
                <h3 className="font-black text-[10px] uppercase tracking-widest">实时公告</h3>
              </div>
              <BellRing size={14} className="text-slate-400" />
            </div>
            <div className="p-3 space-y-1">
              {MOCK_ANNOUNCEMENTS.slice(0, 4).map((item) => (
                <div key={item.id} className="group p-4 rounded-2xl hover:bg-white dark:hover:bg-slate-700/50 transition-all cursor-pointer">
                  <div className="flex justify-between items-center mb-1">
                     <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${getTagStyles(item.color)}`}>
                       {item.tag}
                     </span>
                     <span className="text-[8px] text-slate-400 font-bold">{item.time}</span>
                  </div>
                  <p className="text-[11px] font-bold text-slate-800 dark:text-slate-100 line-clamp-1">{item.title}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mica p-8 rounded-organic border border-emerald-100 dark:border-emerald-900/20 shadow-xl">
             <div className="flex items-center justify-between mb-6">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-emerald-600">行政速递</h3>
                <Utensils size={14} className="text-emerald-500" />
             </div>
             <p className="text-base font-black text-slate-900 dark:text-white leading-tight mb-2">今日午餐菜单：</p>
             <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">泰式冬阴功海鲜面、清炒时蔬、冰镇酸梅汤。</p>
             <div className="mt-4 pt-4 border-t border-emerald-50 dark:border-emerald-900/10 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase">供应时间 11:30 - 13:30</span>
                <ArrowUpRight size={16} className="text-emerald-500" />
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
