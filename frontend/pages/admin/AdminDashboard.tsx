import React, { useMemo } from 'react';
import {
    Users, FileText, Activity, Server,
    Plus, Shield, Database, Search,
    TrendingUp, Clock, AlertCircle, CheckCircle2
} from 'lucide-react';

interface AdminDashboardProps {
    employeeCount: number;
    newsCount: number;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ employeeCount, newsCount }) => {
    const greeting = useMemo(() => {
        const hour = new Date().getHours();
        if (hour < 5) return '夜深了';
        if (hour < 11) return '早上好';
        if (hour < 13) return '中午好';
        if (hour < 18) return '下午好';
        return '晚上好';
    }, []);

    const formattedDate = useMemo(() => {
        return new Intl.DateTimeFormat('zh-CN', {
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        }).format(new Date());
    }, []);

    const stats = [
        {
            title: '总用户数',
            value: employeeCount,
            icon: <Users size={20} />,
            color: 'blue',
            trend: '+12%',
            trendLabel: '较上月',
            bg: 'bg-blue-50 dark:bg-blue-900/20',
            text: 'text-blue-600 dark:text-blue-400'
        },
        {
            title: '已发布资讯',
            value: newsCount,
            icon: <FileText size={20} />,
            color: 'purple',
            trend: '+3',
            trendLabel: '本周新增',
            bg: 'bg-purple-50 dark:bg-purple-900/20',
            text: 'text-purple-600 dark:text-purple-400'
        },
        {
            title: '系统状态',
            value: '运行中',
            icon: <Activity size={20} />,
            color: 'emerald',
            trend: '100%',
            trendLabel: '在线率',
            bg: 'bg-emerald-50 dark:bg-emerald-900/20',
            text: 'text-emerald-600 dark:text-emerald-400'
        },
        {
            title: '待处理告警',
            value: '0',
            icon: <AlertCircle size={20} />,
            color: 'rose',
            trend: '-2',
            trendLabel: '较昨日',
            bg: 'bg-rose-50 dark:bg-rose-900/20',
            text: 'text-rose-600 dark:text-rose-400'
        }
    ];

    const quickActions = [
        { icon: <Plus size={18} />, label: '发布公告', color: 'blue' },
        { icon: <Users size={18} />, label: '新增用户', color: 'indigo' },
        { icon: <Database size={18} />, label: '系统备份', color: 'cyan' },
        { icon: <Search size={18} />, label: '日志查询', color: 'slate' },
    ];

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                        {greeting}, 管理员
                    </h1>
                    <div className="flex items-center mt-2 group">
                        <Clock size={14} className="text-slate-400 mr-2" />
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                            {formattedDate} <span className="mx-2 text-slate-300">|</span>系统各项指标运行正常
                        </p>
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat, i) => (
                    <div key={i} className="mica p-5 rounded-3xl border border-white/50 shadow-sm hover:shadow-md transition-all duration-300 group">
                        <div className="flex justify-between items-start mb-4">
                            <div className={`p-3 rounded-2xl ${stat.bg} ${stat.text} group-hover:scale-110 transition-transform`}>
                                {stat.icon}
                            </div>
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${stat.bg} ${stat.text}`}>
                                {stat.trend}
                            </span>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{stat.title}</p>
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white">{stat.value}</h3>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent Activity */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="mica p-6 rounded-[2rem] border border-white/50 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">最近动态</h3>
                            <button className="text-xs font-bold text-blue-600 hover:text-blue-700">查看全部</button>
                        </div>
                        <div className="space-y-4">
                            {[1, 2, 3].map((_, i) => (
                                <div key={i} className="flex items-center space-x-4 p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                        <CheckCircle2 size={18} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-slate-900 dark:text-white">系统备份成功</p>
                                        <p className="text-xs text-slate-500">自动备份任务执行完毕</p>
                                    </div>
                                    <span className="text-xs font-medium text-slate-400">2小时前</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="space-y-6">
                    <div className="mica p-6 rounded-[2rem] border border-white/50 shadow-sm bg-gradient-to-br from-white to-blue-50/30 dark:from-slate-800 dark:to-slate-900">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">快捷操作</h3>
                        <div className="grid grid-cols-2 gap-4">
                            {quickActions.map((action, i) => (
                                <button key={i} className={`flex flex-col items-center justify-center p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 group`}>
                                    <div className={`mb-3 text-${action.color}-500 group-hover:scale-110 transition-transform`}>
                                        {action.icon}
                                    </div>
                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{action.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mica p-6 rounded-[2rem] border border-white/50 shadow-sm bg-slate-900 text-white relative overflow-hidden group">
                        <div className="relative z-10">
                            <h3 className="text-lg font-bold mb-2">系统健康度</h3>
                            <div className="text-4xl font-black mb-1">98%</div>
                            <p className="text-xs text-white/60">各项服务运行稳定</p>
                        </div>
                        <Server className="absolute -bottom-4 -right-4 w-32 h-32 text-white/5 group-hover:text-white/10 transition-colors rotate-12" />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
