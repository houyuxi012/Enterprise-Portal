
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, Plus, Trash2, Edit3, Search, Filter, 
  ChevronRight, CalendarDays, Info, CheckCircle2,
  AlertCircle, Clock, MapPin, Sparkles, ShieldCheck
} from 'lucide-react';
import { Holiday } from '../../types';
import { MOCK_HOLIDAYS } from '../../constants';

const HolidayManagement: React.FC = () => {
  const [holidays, setHolidays] = useState<Holiday[]>(MOCK_HOLIDAYS);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('全部');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newHoliday, setNewHoliday] = useState<Partial<Holiday>>({
    name: '',
    date: '',
    endDate: '',
    type: '法定节假日',
    description: ''
  });

  const filteredHolidays = holidays.filter(h => {
    const matchesSearch = h.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         (h.description?.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesType = filterType === '全部' || h.type === filterType;
    return matchesSearch && matchesType;
  }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHoliday.name || !newHoliday.date) return;

    const holiday: Holiday = {
      id: Math.random().toString(36).substr(2, 9),
      name: newHoliday.name,
      date: newHoliday.date,
      endDate: newHoliday.endDate,
      type: newHoliday.type as Holiday['type'],
      description: newHoliday.description
    };

    setHolidays([...holidays, holiday]);
    setIsAddModalOpen(false);
    setNewHoliday({
      name: '',
      date: '',
      endDate: '',
      type: '法定节假日',
      description: ''
    });
  };

  const handleDeleteHoliday = (id: string) => {
    setHolidays(holidays.filter(h => h.id !== id));
  };

  const getHolidayStatus = (date: string, endDate?: string) => {
    const now = new Date();
    const start = new Date(date);
    const end = endDate ? new Date(endDate) : start;
    
    // Set to start of day for comparison
    now.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    if (now > end) return '已结束';
    if (now >= start && now <= end) return '进行中';
    return '未开始';
  };

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-rose-100 dark:bg-rose-900/30 rounded-2xl flex items-center justify-center text-rose-600">
              <Calendar size={20} />
            </div>
            <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white uppercase">节日管理</h2>
          </div>
          <p className="text-slate-500 dark:text-slate-400 font-medium ml-1">管理公司法定节假日、福利假及调休安排</p>
        </div>
        
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center space-x-2 bg-rose-600 hover:bg-rose-700 text-white px-6 py-3.5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all shadow-lg shadow-rose-600/20 active:scale-95"
        >
          <Plus size={18} />
          <span>添加节日</span>
        </button>
      </div>

      {/* Stats / Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: '年度总假期', value: holidays.filter(h => h.type !== '调休工作日').length, icon: CalendarDays, color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
          { label: '法定节假日', value: holidays.filter(h => h.type === '法定节假日').length, icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
          { label: '调休安排', value: holidays.filter(h => h.type === '调休工作日').length, icon: Clock, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20' },
        ].map((stat, idx) => (
          <motion.div 
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-white dark:bg-slate-800/50 p-6 rounded-[32px] border border-slate-100 dark:border-white/5 shadow-sm flex items-center space-x-4"
          >
            <div className={`w-12 h-12 ${stat.bg} ${stat.color} rounded-2xl flex items-center justify-center`}>
              <stat.icon size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{stat.label}</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{stat.value} <span className="text-sm font-medium text-slate-400">天</span></p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Filters & Search */}
      <div className="bg-white dark:bg-slate-800/50 p-4 rounded-[32px] border border-slate-100 dark:border-white/5 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="搜索节日名称或描述..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 dark:bg-white/5 border-none rounded-2xl py-3.5 pl-12 pr-4 outline-none focus:ring-2 focus:ring-rose-500/20 text-[11px] font-bold uppercase tracking-widest transition-all"
          />
        </div>
        <div className="flex items-center space-x-2 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
          {['全部', '法定节假日', '公司福利假', '调休工作日'].map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                filterType === type 
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/20' 
                  : 'bg-slate-100 dark:bg-white/5 text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Holiday List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AnimatePresence mode="popLayout">
          {filteredHolidays.map((holiday, idx) => {
            const status = getHolidayStatus(holiday.date, holiday.endDate);
            return (
              <motion.div
                key={holiday.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: idx * 0.05 }}
                className="group bg-white dark:bg-slate-800/50 rounded-[32px] border border-slate-100 dark:border-white/5 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-none transition-all overflow-hidden"
              >
                <div className="p-6 flex items-start justify-between">
                  <div className="flex items-start space-x-4">
                    <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center border ${
                      holiday.type === '调休工作日' 
                        ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-100 dark:border-orange-800/30 text-orange-600'
                        : holiday.type === '公司福利假'
                        ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-100 dark:border-purple-800/30 text-purple-600'
                        : 'bg-rose-50 dark:bg-rose-900/20 border-rose-100 dark:border-rose-800/30 text-rose-600'
                    }`}>
                      <span className="text-[10px] font-black uppercase tracking-tighter opacity-70">
                        {new Date(holiday.date).toLocaleDateString('zh-CN', { month: 'short' })}
                      </span>
                      <span className="text-xl font-black leading-none">
                        {new Date(holiday.date).getDate()}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <h3 className="text-lg font-black text-slate-900 dark:text-white">{holiday.name}</h3>
                        <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                          status === '进行中' ? 'bg-emerald-100 text-emerald-600' :
                          status === '已结束' ? 'bg-slate-100 text-slate-400' :
                          'bg-indigo-100 text-indigo-600'
                        }`}>
                          {status}
                        </span>
                      </div>
                      <div className="flex items-center space-x-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        <span className="flex items-center space-x-1">
                          <Clock size={12} />
                          <span>{holiday.date}{holiday.endDate ? ` 至 ${holiday.endDate}` : ''}</span>
                        </span>
                        <span className="w-1 h-1 bg-slate-300 rounded-full" />
                        <span>{holiday.type}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-all">
                      <Edit3 size={16} />
                    </button>
                    <button 
                      onClick={() => handleDeleteHoliday(holiday.id)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                
                {holiday.description && (
                  <div className="px-6 pb-6">
                    <div className="bg-slate-50 dark:bg-white/5 p-4 rounded-2xl">
                      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 leading-relaxed italic">
                        "{holiday.description}"
                      </p>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Add Holiday Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-[40px] shadow-2xl overflow-hidden border border-white/10"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="space-y-1">
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">添加新节日</h3>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">设置放假或调休安排</p>
                  </div>
                  <button 
                    onClick={() => setIsAddModalOpen(false)}
                    className="w-10 h-10 flex items-center justify-center rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-400 hover:text-slate-600 transition-all"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>

                <form onSubmit={handleAddHoliday} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">节日名称</label>
                    <input 
                      type="text" 
                      placeholder="例如：端午节"
                      value={newHoliday.name}
                      onChange={(e) => setNewHoliday({...newHoliday, name: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-white/5 border-none rounded-2xl py-4 px-5 outline-none focus:ring-2 focus:ring-rose-500/20 text-[12px] font-bold transition-all"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">开始日期</label>
                      <input 
                        type="date" 
                        value={newHoliday.date}
                        onChange={(e) => setNewHoliday({...newHoliday, date: e.target.value})}
                        className="w-full bg-slate-50 dark:bg-white/5 border-none rounded-2xl py-4 px-5 outline-none focus:ring-2 focus:ring-rose-500/20 text-[12px] font-bold transition-all"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">结束日期 (可选)</label>
                      <input 
                        type="date" 
                        value={newHoliday.endDate}
                        onChange={(e) => setNewHoliday({...newHoliday, endDate: e.target.value})}
                        className="w-full bg-slate-50 dark:bg-white/5 border-none rounded-2xl py-4 px-5 outline-none focus:ring-2 focus:ring-rose-500/20 text-[12px] font-bold transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">节日类型</label>
                    <div className="grid grid-cols-3 gap-2">
                      {['法定节假日', '公司福利假', '调休工作日'].map(type => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setNewHoliday({...newHoliday, type: type as Holiday['type']})}
                          className={`py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest border transition-all ${
                            newHoliday.type === type 
                              ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 border-rose-200' 
                              : 'bg-white dark:bg-white/5 text-slate-400 border-slate-100 dark:border-white/5'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">描述信息</label>
                    <textarea 
                      placeholder="输入节日相关描述或注意事项..."
                      value={newHoliday.description}
                      onChange={(e) => setNewHoliday({...newHoliday, description: e.target.value})}
                      rows={3}
                      className="w-full bg-slate-50 dark:bg-white/5 border-none rounded-2xl py-4 px-5 outline-none focus:ring-2 focus:ring-rose-500/20 text-[12px] font-bold transition-all resize-none"
                    />
                  </div>

                  <div className="pt-4">
                    <button 
                      type="submit"
                      className="w-full bg-rose-600 text-white py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl shadow-rose-500/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center space-x-3"
                    >
                      <CheckCircle2 size={18} />
                      <span>确认添加</span>
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default HolidayManagement;
