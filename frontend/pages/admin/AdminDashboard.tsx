
import React, { useMemo, useState, useEffect } from 'react';
import {
    Users, FileText, Activity, Server,
    Plus, Shield, Database, Search,
    TrendingUp, Clock, AlertCircle, CheckCircle2,
    MousePointer2, ShoppingCart, ArrowUp, ArrowDown,
    MoreHorizontal, Download, Calendar, Sparkles, HardDrive, Eye as EyeIcon
} from 'lucide-react';
import { Avatar } from 'antd';
import ApiClient from '../../services/api';
import { DashboardStats, SystemResources } from '../../types';

interface AdminDashboardProps {
    employeeCount: number;
    newsCount: number;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ employeeCount, newsCount }) => {
    // --- Real Data State ---
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [resources, setResources] = useState<SystemResources | null>(null);

    // Fetch Stats on mount
    useEffect(() => {
        const fetchStats = async () => {
            try {
                const data = await ApiClient.getDashboardStats();
                setStats(data);
            } catch (err) {
                console.error("Failed to fetch dashboard stats", err);
            }
        };
        fetchStats();
    }, []);

    // Poll System Resources
    useEffect(() => {
        const fetchResources = async () => {
            try {
                const data = await ApiClient.getSystemResources();
                setResources(data);
            } catch (err) {
                console.error("Failed to fetch system resources", err);
            }
        };

        // Initial fetch
        fetchResources();

        const interval = setInterval(fetchResources, 3000); // 3 seconds
        return () => clearInterval(interval);
    }, []);

    // --- Mock Data Generators for Charts ---

    // Line Chart Data (Simulating a sine wave + trend)
    const lineChartData = useMemo(() => {
        const points = [];
        for (let i = 0; i < 30; i++) {
            const val = 40 + Math.sin(i * 0.5) * 20 + (i * 1.5) + Math.random() * 10;
            points.push(val);
        }
        return points;
    }, []);

    // Generate SVG Path for Line Chart
    const linePath = useMemo(() => {
        const max = Math.max(...lineChartData);
        const min = Math.min(...lineChartData);
        const range = max - min;
        const width = 100; // SVG viewBox width
        const height = 40; // SVG viewBox height

        return lineChartData.map((val, i) => {
            const x = (i / (lineChartData.length - 1)) * width;
            const y = height - ((val - min) / range) * height;
            return `${x},${y} `;
        }).join(' L ');
    }, [lineChartData]);

    const statCards = [
        {
            title: '系统访问量', // System Visits
            value: stats?.system_visits.toLocaleString() || '---',
            trend: stats?.activity_trend || '---',
            isPositive: true,
            icon: <EyeIcon size={20} />,
            subtitle: '总访问次数',
            color: 'blue'
        },
        {
            title: '活跃用户', // Active Users
            value: stats?.active_users.toLocaleString() || '---',
            trend: stats?.active_users_trend || '---',
            isPositive: true,
            icon: <Users size={20} />,
            subtitle: '在线用户',
            color: 'emerald'
        },
        {
            title: '工具点击', // Tool Clicks
            value: stats?.tool_clicks.toLocaleString() || '---',
            trend: stats?.tool_clicks_trend || '---',
            isPositive: false,
            icon: <MousePointer2 size={20} />,
            subtitle: '使用次数',
            color: 'rose'
        },
        {
            title: '新增内容', // New Content
            value: stats?.new_content.toLocaleString() || '---',
            trend: stats?.new_content_trend || '---',
            isPositive: true,
            icon: <FileText size={20} />,
            subtitle: '新增条目',
            color: 'indigo'
        }
    ];

    const activeEmployees = [
        { id: 1, name: '张伟', role: '设计师', sales: '2,310 浏览', revenue: '98%', rating: 5.0, img: 'https://ui-avatars.com/api/?name=Zhang+Wei&background=random' },
        { id: 2, name: '李强', role: '开发工程师', sales: '1,230 浏览', revenue: '95%', rating: 4.8, img: 'https://ui-avatars.com/api/?name=Li+Qiang&background=random' },
        { id: 3, name: '王敏', role: '项目经理', sales: '812 浏览', revenue: '92%', rating: 4.7, img: 'https://ui-avatars.com/api/?name=Wang+Min&background=random' },
        { id: 4, name: '赵杰', role: '人力资源', sales: '645 浏览', revenue: '88%', rating: 4.5, img: 'https://ui-avatars.com/api/?name=Zhao+Jie&background=random' },
        { id: 5, name: '刘芳', role: '销售专员', sales: '572 浏览', revenue: '85%', rating: 4.5, img: 'https://ui-avatars.com/api/?name=Liu+Fang&background=random' },
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-700 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-6 min-h-full">

            {/* Top Toolbar */}
            <div className="flex md:items-center justify-between flex-col md:flex-row gap-4 mb-2">
                <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">仪表盘</h1>
                {/* <div className="flex gap-3">
                    <button className="flex items-center space-x-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 shadow-sm hover:shadow transition-shadow">
                        <Calendar size={14} />
                        <span>Jan 1, 2025 - Feb 1, 2025</span>
                    </button>
                    <button className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl px-4 py-2 text-xs font-bold shadow-lg shadow-slate-900/20 transition-all">
                        Download Report
                    </button>
                </div> */}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {statCards.map((stat, index) => (
                    <div key={index} className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700/50 hover:-translate-y-1 transition-transform duration-300 cursor-default group relative overflow-hidden">
                        {/* Background Decoration */}
                        <div className={`absolute - right - 4 - bottom - 4 w - 24 h - 24 rounded - full opacity - [0.03] transition - transform group - hover: scale - 110 bg - ${stat.color} -500`}></div>

                        <div className="flex justify-between items-start mb-4 relative z-10">
                            <div>
                                <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">{stat.title}</p>
                                <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{stat.value}</h3>
                            </div>
                            <div className={`p - 3 rounded - 2xl bg - ${stat.color} -50 dark: bg - ${stat.color} -900 / 20 text - ${stat.color} -500`}>
                                {stat.icon}
                            </div>
                        </div>
                        <div className="flex items-center justify-between relative z-10">
                            <div className={`flex items - center space - x - 1 text - [10px] font - bold px - 2 py - 1 rounded - lg ${stat.isPositive
                                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                                : 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400'
                                } `}>
                                {stat.isPositive ? <TrendingUp size={10} /> : <TrendingUp size={10} className="rotate-180" />}
                                <span>{stat.trend}</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-bold">{stat.subtitle}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Content Area (Chart + Table) */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Activity Chart */}
                    {/* System Resources Monitor (Replaces Activity Overview) */}
                    <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-8 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700/50">
                        <div className="flex justify-between items-center mb-8">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 dark:text-white">系统资源监控</h3>
                                <p className="text-xs text-slate-400 font-medium mt-1">实时服务器性能指标</p>
                            </div>
                            <div className="flex items-center space-x-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">实时监控中</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {/* CPU */}
                            <div className="p-4 bg-slate-50 dark:bg-slate-700/30 rounded-2xl border border-slate-100 dark:border-slate-700">
                                <div className="flex justify-between items-center mb-4">
                                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-lg"><Server size={18} /></div>
                                    <span className="text-xl font-black text-slate-800 dark:text-white">{resources?.cpu_percent ?? 0}%</span>
                                </div>
                                <div className="text-xs font-bold text-slate-400 mb-2">CPU 使用率</div>
                                <div className="h-2 w-full bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${resources?.cpu_percent ?? 0}%` }}></div>
                                </div>
                            </div>

                            {/* Memory */}
                            <div className="p-4 bg-slate-50 dark:bg-slate-700/30 rounded-2xl border border-slate-100 dark:border-slate-700">
                                <div className="flex justify-between items-center mb-4">
                                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-lg"><Database size={18} /></div>
                                    <span className="text-sm font-black text-slate-800 dark:text-white">{resources?.memory_percent ?? 0}%</span>
                                </div>
                                <div className="text-xs font-bold text-slate-400 mb-2 whitespace-nowrap overflow-hidden text-ellipsis">内存 ({resources?.memory_used || '0GB'} / {resources?.memory_total || '0GB'})</div>
                                <div className="h-2 w-full bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${resources?.memory_percent ?? 0}%` }}></div>
                                </div>
                            </div>

                            {/* Disk */}
                            <div className="p-4 bg-slate-50 dark:bg-slate-700/30 rounded-2xl border border-slate-100 dark:border-slate-700">
                                <div className="flex justify-between items-center mb-4">
                                    <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-lg"><HardDrive size={18} /></div>
                                    <span className="text-xl font-black text-slate-800 dark:text-white">{resources?.disk_percent ?? 0}%</span>
                                </div>
                                <div className="text-xs font-bold text-slate-400 mb-2">磁盘 (SSD)</div>
                                <div className="h-2 w-full bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${resources?.disk_percent ?? 0}%` }}></div>
                                </div>
                            </div>

                            {/* Network */}
                            <div className="p-4 bg-slate-50 dark:bg-slate-700/30 rounded-2xl border border-slate-100 dark:border-slate-700 flex flex-col justify-between">
                                <div className="flex justify-between items-center mb-2">
                                    <div className="p-2 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-lg"><Activity size={18} /></div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">网络带宽</span>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center text-[10px] font-bold text-slate-500 dark:text-slate-400"><ArrowDown size={10} className="mr-1" /> 下行</div>
                                        <span className="text-sm font-black text-slate-800 dark:text-white">{resources?.network_recv_speed ?? 0} MB/s</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center text-[10px] font-bold text-slate-500 dark:text-slate-400"><ArrowUp size={10} className="mr-1" /> 上行</div>
                                        <span className="text-sm font-black text-slate-800 dark:text-white">{resources?.network_sent_speed ?? 0} MB/s</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Active Employees Table */}
                    <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-8 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700/50">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-slate-800 dark:text-white">活跃用户</h3>
                            <button className="text-blue-600 text-xs font-bold hover:underline">查看全部</button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-100 dark:border-slate-700">
                                        <th className="pb-4 pl-4">用户</th>
                                        <th className="pb-4">角色</th>
                                        <th className="pb-4">访问量</th>
                                        <th className="pb-4">评级</th>
                                        <th className="pb-4">参与度</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {activeEmployees.map((emp) => (
                                        <tr key={emp.id} className="group hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                                            <td className="py-4 pl-4">
                                                <div className="flex items-center space-x-3">
                                                    <Avatar src={emp.img} size="small" />
                                                    <span className="font-bold text-slate-700 dark:text-slate-200">{emp.name}</span>
                                                </div>
                                            </td>
                                            <td className="py-4 text-slate-500 text-xs font-medium">{emp.role}</td>
                                            <td className="py-4 text-slate-600 dark:text-slate-300 text-xs font-bold">{emp.sales}</td>
                                            <td className="py-4">
                                                <div className="flex items-center space-x-1 text-amber-400 text-xs font-bold">
                                                    <span className="text-slate-700 dark:text-slate-200">{emp.rating}</span>
                                                    <span>★</span>
                                                </div>
                                            </td>
                                            <td className="py-4">
                                                <span className="text-emerald-500 text-xs font-bold bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-lg">
                                                    {emp.revenue}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Right Column (Widgets) */}
                <div className="space-y-6">

                    {/* Most Day Active (Bar Chart) */}
                    <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700/50">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-slate-700 dark:text-slate-200">访问高峰时段</h3>
                            <button className="text-slate-400"><MoreHorizontal size={20} /></button>
                        </div>
                        <div className="flex flex-col items-center mb-6">
                            <div className="text-3xl font-black text-slate-900 dark:text-white mb-1">8,162</div>
                            <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">高流量 (周二)</div>
                        </div>

                        {/* CSS Bar Chart */}
                        <div className="h-40 flex items-end justify-between gap-2 px-2">
                            <Bar day="周日" height="40%" />
                            <Bar day="周一" height="55%" />
                            <Bar day="周二" height="90%" active />
                            <Bar day="周三" height="45%" />
                            <Bar day="周四" height="35%" />
                            <Bar day="周五" height="65%" />
                            <Bar day="周六" height="75%" />
                        </div>
                    </div>



                    {/* Small Widgets */}
                    < div className="grid grid-cols-2 gap-4" >
                        <SmallStatBox icon={<Shield size={18} />} label="系统安全" value="安全" color="emerald" />
                        <SmallStatBox icon={<Server size={18} />} label="服务器状态" value="在线" color="blue" />
                    </div >

                    {/* Chart Widget (e.g. Storage or something) */}
                    < div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-[1.5rem] p-6 text-white shadow-xl shadow-indigo-500/30" >
                        <h4 className="font-bold text-white/90 mb-4">存储计划</h4>
                        <div className="flex items-end space-x-2 mb-4">
                            <span className="text-3xl font-black">85%</span>
                            <span className="text-xs font-medium text-white/60 mb-1">已使用</span>
                        </div>
                        <div className="h-2 w-full bg-black/20 rounded-full overflow-hidden mb-4">
                            <div className="h-full bg-white/90 rounded-full w-[85%]"></div>
                        </div>
                        <button className="w-full py-2 bg-white text-indigo-600 rounded-xl text-xs font-bold hover:bg-white/90 transition-colors">
                            升级计划
                        </button>
                    </div >

                </div >
            </div >
        </div >
    );
};

// --- Sub-components for cleaner code ---

const SmallStatBox = ({ icon, label, value, color }: any) => (
    <div className={`bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/50 flex flex-col items-center justify-center space-y-2 hover:-translate-y-1 transition-transform`}>
        <div className={`text-${color}-500 bg-${color}-50 dark:bg-${color}-900/20 p-2 rounded-xl`}>{icon}</div>
        <div className="text-center">
            <div className="text-xs text-slate-400 font-bold">{label}</div>
            <div className={`text-sm font-black text-${color}-600 dark:text-${color}-400`}>{value}</div>
        </div>
    </div>
);

const Bar: React.FC<{ day: string, height: string, active?: boolean }> = ({ day, height, active }) => (
    <div className="flex flex-col items-center w-full group cursor-pointer">
        <div className={`w-full rounded-t-lg transition-all duration-300 ${active ? 'bg-blue-600 shadow-lg shadow-blue-500/30' : 'bg-slate-100 dark:bg-slate-700 group-hover:bg-slate-200 dark:group-hover:bg-slate-600'}`} style={{ height }}></div>
        <div className="mt-2 text-[10px] font-bold text-slate-400 uppercase">{day}</div>
    </div>
);

export default AdminDashboard;
