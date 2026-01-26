import React, { useMemo } from 'react';
import { Users, Newspaper, Zap, TrendingUp } from 'lucide-react';

interface StatsCardProps {
    label: string;
    value: string | number;
    icon: React.ReactNode;
    trend?: string;
    color: string;
}

const StatsCard: React.FC<StatsCardProps> = ({ label, value, icon, trend, color }) => (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-700/50 relative overflow-hidden group hover:-translate-y-1 transition-transform duration-500">
        <div className={`absolute top-0 right-0 p-4 opacity-10 ${color} group-hover:scale-150 transition-transform duration-700`}>
            {React.cloneElement(icon as React.ReactElement, { size: 64 })}
        </div>
        <div className="relative z-10">
            <div className={`w-12 h-12 rounded-2xl ${color} bg-opacity-10 flex items-center justify-center mb-4 text-${color.split('-')[1]}-600`}>
                {icon}
            </div>
            <h3 className="text-slate-500 font-bold text-xs uppercase tracking-widest mb-1">{label}</h3>
            <div className="flex items-baseline space-x-2">
                <span className="text-3xl font-black text-slate-900 dark:text-white">{value}</span>
                {trend && <span className="text-emerald-500 text-xs font-bold flex items-center"><TrendingUp size={12} className="mr-0.5" />{trend}</span>}
            </div>
        </div>
    </div>
);

interface AdminDashboardProps {
    employeeCount: number;
    newsCount: number;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ employeeCount, newsCount }) => {
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-black text-slate-900 dark:text-white">概览面板</h1>
                <p className="text-slate-500 text-sm mt-1">欢迎回来，管理员。这里是您今天的系统概况。</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatsCard
                    label="总员工数"
                    value={employeeCount}
                    icon={<Users size={24} />}
                    trend="+12% 本月"
                    color="bg-blue-500"
                />
                <StatsCard
                    label="已发布资讯"
                    value={newsCount}
                    icon={<Newspaper size={24} />}
                    trend="+3 本周"
                    color="bg-purple-500"
                />
                <StatsCard
                    label="系统状态"
                    value="运行中"
                    icon={<Zap size={24} />}
                    color="bg-emerald-500"
                />
            </div>

            {/* Recent Activity Placeholder */}
            <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-8 shadow-sm border border-slate-100 dark:border-slate-700/50">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-6">快速操作</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <button className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-700/50 hover:bg-blue-50 hover:text-blue-600 transition-colors text-sm font-bold text-slate-600 dark:text-slate-300">
                        发布公告
                    </button>
                    <button className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-700/50 hover:bg-blue-50 hover:text-blue-600 transition-colors text-sm font-bold text-slate-600 dark:text-slate-300">
                        添加员工
                    </button>
                    <button className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-700/50 hover:bg-blue-50 hover:text-blue-600 transition-colors text-sm font-bold text-slate-600 dark:text-slate-300">
                        系统备份
                    </button>
                    <button className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-700/50 hover:bg-blue-50 hover:text-blue-600 transition-colors text-sm font-bold text-slate-600 dark:text-slate-300">
                        查看日志
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
