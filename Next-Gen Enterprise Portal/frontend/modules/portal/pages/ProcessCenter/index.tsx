import React, { useMemo, useState } from 'react';
import { Activity, ExternalLink } from 'lucide-react';

type ProcessCenterProps = {
  onOpenTodoCenter?: () => void;
};

type DemoTask = {
  id: string;
  title: string;
  dueDate: string;
  priority: 'high' | 'medium' | 'low';
  source: string;
  status: '待审批' | '处理中' | '已完成' | '已驳回';
  requester: string;
  type: string;
};

const MOCK_TASKS: DemoTask[] = [
  {
    id: 't1',
    title: '关于 Q3 季度市场推广预算的审批申请',
    dueDate: '2024-06-15',
    priority: 'high',
    source: 'OA系统',
    status: '待审批',
    requester: '陈莎莎',
    type: '费用报销',
  },
  {
    id: 't2',
    title: '核心交易系统数据库升级方案评审',
    dueDate: '2024-06-12',
    priority: 'medium',
    source: 'Jira项目管理',
    status: '已完成',
    requester: '马库斯',
    type: '技术评审',
  },
  {
    id: 't3',
    title: '2024年度员工健康体检供应商合同审核',
    dueDate: '2024-06-20',
    priority: 'low',
    source: '法务系统',
    status: '处理中',
    requester: '王汤姆',
    type: '合同审核',
  },
  {
    id: 't4',
    title: '新入职员工“艾莎”的转正申请审批',
    dueDate: '2024-06-10',
    priority: 'high',
    source: 'HRM系统',
    status: '待审批',
    requester: '艾莎',
    type: '人事申请',
  },
];

const CATEGORIES = ['全部', 'OA系统', 'HRM系统', 'CRM系统', 'Jira项目管理', '法务系统'] as const;

const ProcessCenter: React.FC<ProcessCenterProps> = ({ onOpenTodoCenter }) => {
  const [activeCategory, setActiveCategory] = useState<(typeof CATEGORIES)[number]>('全部');

  const filteredTasks = useMemo(() => {
    if (activeCategory === '全部') return MOCK_TASKS;
    return MOCK_TASKS.filter((task) => task.source === activeCategory);
  }, [activeCategory]);

  const pendingCount = useMemo(() => MOCK_TASKS.filter((task) => task.status === '待审批').length, []);
  const progress = Math.round(((MOCK_TASKS.length - pendingCount) / MOCK_TASKS.length) * 100) || 0;

  const handleOpenTodoCenter = () => {
    onOpenTodoCenter?.();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700 relative pb-32">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">流程中心</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Enterprise Workflow Hub</p>
        </div>

        <div className="mica p-4 lg:px-6 lg:py-3 rounded-3xl border border-white/50 flex items-center space-x-4 shadow-xl self-start md:self-center">
          <div className="text-right">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">处理进度</p>
            <p className="text-2xl font-black text-indigo-600 leading-none">{progress}%</p>
          </div>
          <div className="relative w-12 h-12 flex items-center justify-center bg-indigo-50 rounded-2xl">
            <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
              <circle
                cx="20"
                cy="20"
                r="18"
                fill="transparent"
                stroke="currentColor"
                strokeWidth="3"
                className="text-slate-100"
              />
              <circle
                cx="20"
                cy="20"
                r="18"
                fill="transparent"
                stroke="currentColor"
                strokeWidth="3"
                className="text-indigo-600 transition-all duration-1000"
                strokeDasharray={113}
                strokeDashoffset={113 - (113 * progress) / 100}
              />
            </svg>
            <Activity size={14} className="absolute text-indigo-600" />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 px-2">
        <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar py-1 flex-1">
          {CATEGORIES.map((category) => {
            const count = category === '全部' ? MOCK_TASKS.length : MOCK_TASKS.filter((task) => task.source === category).length;
            const isActive = activeCategory === category;

            return (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`px-5 py-2.5 rounded-full border transition-all duration-300 flex items-center space-x-2 whitespace-nowrap text-[10px] font-black uppercase tracking-widest ${
                  isActive
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-600/20 translate-y-[-2px]'
                    : 'mica border-white/50 text-slate-400 hover:text-slate-600 hover:bg-white'
                }`}
              >
                <span>{category}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[8px] ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleOpenTodoCenter}
          className="hidden md:flex items-center space-x-2 px-6 py-2.5 bg-slate-900 text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl"
        >
          <ExternalLink size={14} />
          <span>进入 OA 系统</span>
        </button>
      </div>

      <div className="space-y-4 min-h-[400px] px-2">
        {filteredTasks.length > 0 ? (
          filteredTasks.map((task) => (
            <div
              key={task.id}
              className={`mica p-6 rounded-[2.5rem] border border-white/50 flex flex-col md:flex-row md:items-center gap-6 transition-all group animate-in fade-in slide-in-from-left-4 duration-500 hover:scale-[1.01] hover:shadow-2xl ${
                task.status === '已完成' ? 'opacity-60' : ''
              }`}
            >
              <div className="flex-1 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="px-3 py-1 bg-indigo-50 text-indigo-600 text-[9px] font-black uppercase tracking-widest rounded-lg border border-indigo-100">
                    {task.source}
                  </span>
                  <span className="px-3 py-1 bg-slate-100 text-slate-500 text-[9px] font-black uppercase tracking-widest rounded-lg border border-white/50">
                    {task.type}
                  </span>
                  <span
                    className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg border ${
                      task.status === '待审批'
                        ? 'bg-amber-50 text-amber-600 border-amber-100'
                        : task.status === '处理中'
                          ? 'bg-blue-50 text-blue-600 border-blue-100'
                          : task.status === '已完成'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                            : 'bg-rose-50 text-rose-600 border-rose-100'
                    }`}
                  >
                    {task.status}
                  </span>
                </div>

                <h3 className={`text-lg font-black text-slate-900 leading-tight ${task.status === '已完成' ? 'line-through text-slate-400' : ''}`}>
                  {task.title}
                </h3>

                <div className="flex flex-wrap items-center gap-6">
                  <div className="flex items-center space-x-2">
                    <img
                      src={`https://i.pravatar.cc/100?u=${task.requester}`}
                      className="w-6 h-6 rounded-full object-cover border-2 border-white shadow-sm"
                      referrerPolicy="no-referrer"
                    />
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">申请人</p>
                      <p className="text-[11px] font-bold text-slate-700">{task.requester}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-px h-6 bg-slate-100" />
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">截止日期</p>
                      <p className="text-[11px] font-bold text-slate-700">{task.dueDate}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-px h-6 bg-slate-100" />
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">优先级</p>
                      <p
                        className={`text-[11px] font-black uppercase ${
                          task.priority === 'high' ? 'text-rose-600' : task.priority === 'medium' ? 'text-amber-600' : 'text-blue-600'
                        }`}
                      >
                        {task.priority}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-3 md:flex-col md:space-x-0 md:space-y-3">
                <button
                  type="button"
                  onClick={handleOpenTodoCenter}
                  className="flex-1 md:w-32 py-3 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-600/20 hover:scale-105 active:scale-95 transition-all"
                >
                  立即处理
                </button>
                <button
                  type="button"
                  onClick={handleOpenTodoCenter}
                  className="flex-1 md:w-32 py-3 bg-white text-slate-600 border border-white/50 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all"
                >
                  查看详情
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-20 mica rounded-[3rem] border border-white/50">
            <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center mb-6">
              <Activity size={40} className="text-slate-200" />
            </div>
            <p className="text-lg font-black text-slate-900">暂无待处理流程</p>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">您的工作流已全部处理完毕</p>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleOpenTodoCenter}
        className="fixed bottom-10 right-8 w-16 h-16 bg-indigo-600 text-white rounded-[2rem] shadow-2xl shadow-indigo-500/40 flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-[60] group border border-white/20"
      >
        <div className="absolute inset-0 bg-indigo-400 rounded-[2rem] animate-ping opacity-20" />
        <ExternalLink size={32} className="relative group-hover:rotate-12 transition-transform duration-500" />
      </button>
    </div>
  );
};

export default ProcessCenter;
