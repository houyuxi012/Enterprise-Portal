
import React, { useMemo, useState, useEffect } from 'react';
import {
    Users, FileText, Activity, Server,
    Plus, Shield, Database, Search,
    TrendingUp, TrendingDown, Clock, AlertTriangle, AlertCircle, CheckCircle, CheckCircle2, XCircle, Filter, Download, RefreshCw, BarChart2,
    Cpu, HardDrive, Globe, Zap, List, Eye, Eye as EyeIcon,
    Sparkles, MessageSquare, Box, PlayCircle as Play, StopCircle as Stop,
    MousePointer2, ShoppingCart, ArrowUp, ArrowDown, MoreHorizontal, Calendar
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

    // AI Stats State
    const [aiStats, setAiStats] = useState<{
        total_tokens: number;
        total_tokens_in: number;
        total_tokens_out: number;
        model_breakdown: Array<{
            model: string;
            requests: number;
            total_tokens: number;
            tokens_in?: number;
            tokens_out?: number;
        }>;
        daily_trend?: Array<{
            date: string;
            total_tokens: number;
        }>;
        total_tokens_prev?: number;
        trend_percentage?: number;
    } | null>(null);

    // Fetch AI Stats on mount
    useEffect(() => {
        const fetchAiStats = async () => {
            try {
                const data = await ApiClient.getAIAuditStats();
                setAiStats(data);
            } catch (err) {
                console.error("Failed to fetch AI stats", err);
            }
        };
        fetchAiStats();
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
            title: '应用访问', // App Visits
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

                    {/* AI Model Usage Section (Polished) */}
                    <div className="rounded-[1.5rem] p-8 shadow-sm border border-slate-100 dark:border-slate-700/50 relative overflow-hidden group bg-white dark:bg-slate-800">
                        {/* Decorative Background Glow */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/10 dark:bg-violet-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

                        <div className="flex justify-between items-center mb-8 relative z-10">
                            <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <div className="p-2 bg-[#2636dd]/10 rounded-lg text-[#2636dd]">
                                    <Sparkles size={18} />
                                </div>
                                <span>AI 模型消耗趋势</span>
                            </h3>
                            {aiStats?.total_tokens && (
                                <div className="px-3 py-1 rounded-full bg-slate-50 dark:bg-slate-700/50 text-xs font-bold text-slate-500 border border-slate-100 dark:border-slate-700">
                                    总计: <span className="text-violet-600 dark:text-violet-400">{aiStats.total_tokens.toLocaleString()}</span> Tokens
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 relative z-10">
                            {/* Left: VS Trend (Area Line Chart) */}
                            <div>
                                <h4 className="text-xs font-bold text-slate-400 mb-6 uppercase tracking-wider flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#2636dd]"></span>
                                    近7日 Token 趋势 (万)
                                </h4>

                                {/* Chart Container */}
                                <div className="h-48 w-full relative group/chart">

                                    {aiStats?.daily_trend && aiStats.daily_trend.length > 0 ? (
                                        (() => {
                                            const data = aiStats.daily_trend!.slice(-7);
                                            // Handle edge case: single data point or empty
                                            if (data.length < 2) return <div className="text-xs text-slate-400">数据不足，无法显示趋势</div>;

                                            // 1. Calculate Scales
                                            const maxVal = Math.max(...data.map(d => d.total_tokens)) * 1.1 || 100; // Add 10% headroom
                                            const minVal = 0;

                                            // Chart Dimensions (use % for width, fixed height internal coordinate system)
                                            const width = 100;
                                            const height = 100;

                                            // 2. Generate Points
                                            const points = data.map((d, i) => {
                                                const x = (i / (data.length - 1)) * width;
                                                const y = height - ((d.total_tokens - minVal) / (maxVal - minVal)) * height;
                                                return { x, y, val: d.total_tokens, date: d.date };
                                            });

                                            // 3. Create SVG Path (Smooth Curve or Straight Line)
                                            // L = Line to
                                            const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');

                                            // Area Path (Close the loop at bottom)
                                            const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;

                                            // Peak Point
                                            const peakPoint = points.reduce((prev, curr) => curr.val > prev.val ? curr : prev, points[0]);

                                            return (
                                                <div className="w-full h-full relative">
                                                    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
                                                        <defs>
                                                            <linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1">
                                                                <stop offset="0%" stopColor="#2636dd" stopOpacity="0.3" />
                                                                <stop offset="100%" stopColor="#2636dd" stopOpacity="0.0" />
                                                            </linearGradient>
                                                            <linearGradient id="lineGradient" x1="0" x2="1" y1="0" y2="0">
                                                                <stop offset="0%" stopColor="#4c5ce8" />
                                                                <stop offset="100%" stopColor="#2636dd" />
                                                            </linearGradient>
                                                        </defs>

                                                        {/* Area Fill */}
                                                        <path d={areaPath} fill="url(#areaGradient)" />

                                                        {/* Stroke Line */}
                                                        <path
                                                            d={linePath}
                                                            fill="none"
                                                            stroke="url(#lineGradient)"
                                                            strokeWidth="1.5"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            className="drop-shadow-sm"
                                                        />

                                                        {/* Peak Dot (Pulse) */}
                                                        <circle cx={peakPoint.x} cy={peakPoint.y} r="1.5" fill="#2636dd" className="animate-pulse" />
                                                        <circle cx={peakPoint.x} cy={peakPoint.y} r="4" fill="#2636dd" fillOpacity="0.2" />
                                                    </svg>

                                                    {/* Tooltip Hover Overlay (Invisible Columns) */}
                                                    <div className="absolute inset-0 flex">
                                                        {points.map((p, i) => (
                                                            <div key={i} className="flex-1 h-full relative group/point cursor-crosshair">
                                                                {/* The Tooltip */}
                                                                <div
                                                                    className={`absolute bottom-full mb-2 bg-slate-800 text-white text-[10px] py-1 px-2 rounded 
                                                                                opacity-0 group-hover/point:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20 shadow-xl
                                                                                ${i === 0 ? 'left-0' : i === points.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'}
                                                                    `}
                                                                >
                                                                    <div className="font-bold">{p.val.toLocaleString()}</div>
                                                                    <div className="text-slate-400 text-[9px]">{p.date}</div>
                                                                </div>

                                                                {/* Highlight Line on Hover */}
                                                                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-indigo-500/20 opacity-0 group-hover/point:opacity-100"></div>

                                                                {/* Dot on Hover */}
                                                                <div
                                                                    className="absolute w-2 h-2 bg-white border-2 border-indigo-500 rounded-full left-1/2 -ml-1 opacity-0 group-hover/point:opacity-100 transition-all shadow-sm"
                                                                    style={{ top: `${(p.y / height) * 100}%` }}
                                                                ></div>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* Peak Label (Static) */}
                                                    <div
                                                        className="absolute text-[9px] font-bold text-indigo-500 bg-white/80 dark:bg-slate-800/80 px-1 rounded shadow-sm backdrop-blur-sm pointer-events-none"
                                                        style={{ left: `${(peakPoint.x / width) * 100}%`, top: `${(peakPoint.y / height) * 100}%`, transform: 'translate(-50%, -140%)' }}
                                                    >
                                                        Peak
                                                    </div>

                                                    {/* Axis Labels (X-Axis) */}
                                                    <div className="absolute -bottom-6 inset-x-0 flex justify-between text-[9px] text-slate-400 font-medium px-1">
                                                        {/* Only show 1st, middle, and last for clean look */}
                                                        <span>{new Date(points[0].date).toLocaleDateString('zh-CN', { weekday: 'short' }).replace('周', '')}</span>
                                                        <span>{new Date(points[3]?.date || '').toLocaleDateString('zh-CN', { weekday: 'short' }).replace('周', '')}</span>
                                                        <span>{new Date(points[points.length - 1].date).toLocaleDateString('zh-CN', { weekday: 'short' }).replace('周', '')}</span>
                                                    </div>
                                                </div>
                                            );
                                        })()
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 font-bold">暂无数据</div>
                                    )}
                                </div>
                                <div className="mt-8 flex items-center gap-4 text-xs font-medium text-slate-500">
                                    <div className="flex items-center gap-1">
                                        <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                                        <span>近7日总消耗</span>
                                    </div>
                                    <div className="text-slate-800 dark:text-slate-200 font-bold">
                                        {(aiStats?.total_tokens || 0).toLocaleString()}
                                    </div>
                                    {/* Trend Badge */}
                                    {aiStats?.trend_percentage !== undefined && (
                                        <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${aiStats.trend_percentage >= 0 ? 'bg-indigo-50 text-indigo-600' : 'bg-green-50 text-green-600'}`}>
                                            {aiStats.trend_percentage > 0 ? (
                                                <TrendingUp size={10} />
                                            ) : (
                                                <TrendingDown size={10} />
                                            )}
                                            {Math.abs(aiStats.trend_percentage)}% <span className="text-slate-400 scale-75 origin-left ml-0.5">周环比</span>
                                        </div>
                                    )}

                                </div>
                            </div>

                            {/* Right: Donut Chart (Modern Conic Gradient) */}
                            <div className="flex flex-col md:flex-row items-center justify-center gap-8 pl-0 md:pl-8 border-l border-transparent md:border-slate-50 dark:md:border-slate-800/50">
                                {/* Donut Chart */}
                                <div className="relative group/donut cursor-default w-40 h-40 flex-shrink-0">
                                    {/* The Glow */}
                                    <div className="absolute inset-0 rounded-full bg-[#2636dd]/10 blur-xl opacity-0 group-hover/donut:opacity-100 transition-opacity duration-700"></div>

                                    {/* The Chart */}
                                    <div
                                        className="w-full h-full rounded-full relative transition-transform duration-500 hover:scale-105 shadow-sm"
                                        style={{
                                            // Conic Gradient for the Ring
                                            background: (() => {
                                                if (!aiStats?.model_breakdown || aiStats.model_breakdown.length === 0) return '#f1f5f9'; // slate-100

                                                const sorted = [...aiStats.model_breakdown].sort((a, b) => b.total_tokens - a.total_tokens);
                                                const top3 = sorted.slice(0, 3);
                                                const others = sorted.slice(3).reduce((acc, curr) => acc + curr.total_tokens, 0);
                                                const total = aiStats.total_tokens || 1;

                                                let gradientString = 'conic-gradient(';
                                                let currentDeg = 0;

                                                // Colors: #2636dd (Requested), Sky, Pink, Slate
                                                const colors = ['#2636dd', '#0ea5e9', '#ec4899', '#cbd5e1'];

                                                const segments = [...top3.map((m, i) => ({ value: m.total_tokens, color: colors[i] })),
                                                ...(others > 0 ? [{ value: others, color: colors[3] }] : [])
                                                ];

                                                segments.forEach((seg, i) => {
                                                    const deg = (seg.value / total) * 360;
                                                    gradientString += `${seg.color} ${currentDeg}deg ${currentDeg + deg}deg${i === segments.length - 1 ? '' : ', '}`;
                                                    currentDeg += deg;
                                                });

                                                return gradientString + ')';
                                            })(),
                                            // Mask for Inner Cutout (Donut Hole - 70%)
                                            mask: 'radial-gradient(transparent 68%, black 69%)',
                                            WebkitMask: 'radial-gradient(transparent 68%, black 69%)'
                                        }}
                                    >
                                    </div>

                                    {/* Center Text (Absolute Positioned in the Hole) */}
                                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
                                        {/* Big Number */}
                                        <div className="text-2xl font-black text-slate-800 dark:text-white leading-none mb-1">
                                            {aiStats?.daily_trend && aiStats.daily_trend.length > 0
                                                ? (() => {
                                                    const val = aiStats.daily_trend[aiStats.daily_trend.length - 1].total_tokens;
                                                    if (val >= 10000) return (val / 10000).toFixed(2) + 'w'; // 1.25w
                                                    if (val >= 1000) return (val / 1000).toFixed(1) + 'k';   // 1.5k
                                                    return val.toLocaleString();                             // 100
                                                })()
                                                : '0'
                                            }
                                        </div>
                                        {/* Small Label */}
                                        <div className="text-[10px] font-bold text-slate-400">今日 Token</div>
                                    </div>
                                </div>

                                {/* Legend (Right Side List) */}
                                <div className="flex flex-col justify-center gap-3 min-w-[140px] flex-1">
                                    {(() => {
                                        if (!aiStats?.model_breakdown || aiStats.model_breakdown.length === 0) return <div className="text-[10px] text-slate-400">暂无数据</div>;
                                        const sorted = [...aiStats.model_breakdown].sort((a, b) => b.total_tokens - a.total_tokens);
                                        const top3 = sorted.slice(0, 3);
                                        const others = sorted.slice(3).reduce((acc, curr) => acc + curr.total_tokens, 0);
                                        const total = aiStats.total_tokens || 1;

                                        // Same colors as above
                                        const colors = ['bg-[#2636dd]', 'bg-sky-500', 'bg-pink-500', 'bg-slate-300'];

                                        const chartData = [...top3.map((m, i) => ({
                                            label: m.model,
                                            value: m.total_tokens,
                                            color: colors[i]
                                        })),
                                        ...(others > 0 ? [{ label: '其他', value: others, color: colors[3] }] : [])
                                        ];

                                        return chartData.map((item, i) => (
                                            <div key={i} className="flex items-center justify-between text-xs group/item cursor-default w-full">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <span className={`w-2 h-2 rounded-full ${item.color} flex-shrink-0 group-hover/item:scale-125 transition-transform`}></span>
                                                    {/* Tooltip for full name if truncated */}
                                                    <span className="font-bold text-slate-600 dark:text-slate-300 truncate" title={item.label}>
                                                        {item.label}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 pl-2">
                                                    <span className="font-medium text-slate-400 text-[10px] hidden xl:block tabular-nums">
                                                        {item.value >= 1000 ? (item.value / 1000).toFixed(1) + 'k' : item.value}
                                                    </span>
                                                    <span className="font-bold text-slate-500 group-hover/item:text-slate-700 dark:group-hover/item:text-slate-200 transition-colors tabular-nums min-w-[32px] text-right">
                                                        {Math.round((item.value / total) * 100)}%
                                                    </span>
                                                </div>
                                            </div>
                                        ));
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column (Widgets) */}
                <div className="space-y-6">

                    {/* Chart Widget (e.g. Storage or something) */}
                    <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-[1.5rem] p-6 text-white shadow-xl shadow-indigo-500/30">
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
