import React, { useState, useEffect } from 'react';
import {
    Users, FileText, Activity, Server,
    TrendingUp, TrendingDown,
    Eye, HardDrive,
    MousePointer2, ArrowUp, ArrowDown, Database
} from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Sector } from 'recharts';
import ApiClient from '../../services/api';
import { DashboardStats, SystemResources, StorageStats } from '../../types';

interface AdminDashboardProps {
    employeeCount: number;
    newsCount: number;
}

// --- Formatters ---
const formatCompact = (n: number): string => {
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
    return n.toLocaleString();
};

const formatNumber = (n: number): string => n.toLocaleString();

const AdminDashboard: React.FC<AdminDashboardProps> = ({ employeeCount, newsCount }) => {
    // ... (rest of component)

    // --- Real Data State ---
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [resources, setResources] = useState<SystemResources | null>(null);
    const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
    const [activeStorageIndex, setActiveStorageIndex] = useState<number | null>(null);

    // Render Active Shape for Pie Expansion
    const renderActiveShape = (props: any) => {
        const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
        return (
            <g>
                <Sector
                    cx={cx}
                    cy={cy}
                    innerRadius={innerRadius}
                    outerRadius={outerRadius + 8}
                    startAngle={startAngle}
                    endAngle={endAngle}
                    fill={fill}
                />
            </g>
        );
    };

    // Format Bytes
    const formatBytes = (bytes: number): string => {
        if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
        if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
        if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
        return bytes + ' B';
    };

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

    // Fetch Storage Stats
    useEffect(() => {
        const fetchStorageStats = async () => {
            try {
                const data = await ApiClient.getStorageStats();
                setStorageStats(data);
            } catch (err) {
                console.error("Failed to fetch storage stats", err);
            }
        };
        fetchStorageStats();
        const interval = setInterval(fetchStorageStats, 10000); // 10 seconds
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
            tokens_in: number;
            tokens_out: number;
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


    const statCards = [
        {
            title: '系统访问量',
            value: stats?.system_visits.toLocaleString() || '---',
            trend: stats?.activity_trend || '+0.0%',
            isUp: (stats?.activity_trend || '+0.0%').startsWith('+'),
            icon: <Eye size={20} />,
            subtitle: '周环比',
            color: 'blue'
        },
        {
            title: '活跃用户',
            value: stats?.active_users.toLocaleString() || '---',
            trend: stats?.active_users_trend || '+0.0%',
            isUp: (stats?.active_users_trend || '+0.0%').startsWith('+'),
            icon: <Users size={20} />,
            subtitle: '周环比',
            color: 'emerald'
        },
        {
            title: '应用访问',
            value: stats?.tool_clicks.toLocaleString() || '---',
            trend: stats?.tool_clicks_trend || '+0.0%',
            isUp: (stats?.tool_clicks_trend || '+0.0%').startsWith('+'),
            icon: <MousePointer2 size={20} />,
            subtitle: '周环比',
            color: 'rose'
        },
        {
            title: '新增内容',
            value: stats?.new_content.toLocaleString() || '---',
            trend: stats?.new_content_trend || '+0.0%',
            isUp: (stats?.new_content_trend || '+0.0%').startsWith('+'),
            icon: <FileText size={20} />,
            subtitle: '周环比',
            color: 'indigo'
        }
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
                            <div className={`flex items-center space-x-1 text-[10px] font-bold px-2 py-1 rounded-lg ${stat.isUp
                                ? 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400'
                                : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                                }`}>
                                {stat.isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
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
                            <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                                AI 模型消耗趋势
                            </h3>
                            {aiStats?.total_tokens && (
                                <div className="px-3 py-1 rounded-full bg-slate-50 dark:bg-slate-700/50 text-xs font-bold text-slate-500 border border-slate-100 dark:border-slate-700">
                                    近7日总计: <span className="text-violet-600 dark:text-violet-400">{aiStats.total_tokens.toLocaleString()}</span> Tokens
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 relative z-10">
                            {/* Left: VS Trend (Area Line Chart) */}
                            <div>
                                <h4 className="text-xs font-bold text-slate-400 mb-6 uppercase tracking-wider flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#2636dd]"></span>
                                    近7日 Token 趋势
                                </h4>

                                {/* Chart Container (Recharts) */}
                                <div className="h-48 w-full">
                                    {aiStats?.daily_trend && aiStats.daily_trend.length > 0 ? (
                                        (() => {
                                            const chartData = aiStats.daily_trend!.slice(-7).map(d => ({
                                                date: new Date(d.date).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }).replace('/', '-'),
                                                out: d.tokens_out,
                                                in: d.tokens_in,
                                            }));

                                            // Custom Tooltip
                                            const CustomTooltip = ({ active, payload, label }: any) => {
                                                if (active && payload && payload.length) {
                                                    return (
                                                        <div className="bg-slate-900/90 backdrop-blur-sm text-white text-[11px] py-2 px-3 rounded-lg shadow-xl border border-white/10">
                                                            <div className="text-slate-400 mb-1 border-b border-white/10 pb-1 font-medium">{label}</div>
                                                            {payload.map((p: any, i: number) => (
                                                                <div key={i} className="flex items-center justify-between gap-4">
                                                                    <span className="flex items-center gap-1.5">
                                                                        <span className="w-2 h-2 rounded-full" style={{ background: p.color }}></span>
                                                                        {p.dataKey === 'out' ? 'Output' : 'Input'}
                                                                    </span>
                                                                    <span className="font-bold font-mono">{formatCompact(p.value)} <span className="text-slate-500">({formatNumber(p.value)})</span></span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            };

                                            return (
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <LineChart data={chartData} margin={{ top: 20, right: 5, left: 5, bottom: 5 }}>
                                                        <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" opacity={0.5} vertical={false} />
                                                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} axisLine={false} tickLine={false} />
                                                        <YAxis tickFormatter={(v) => formatCompact(Number(v))} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} axisLine={false} tickLine={false} width={50} />
                                                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#2636dd', strokeOpacity: 0.1, strokeWidth: 20 }} />
                                                        <Line type="monotone" dataKey="out" stroke="#2636dd" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#2636dd', stroke: '#fff', strokeWidth: 2 }} name="Output" strokeLinecap="round" strokeLinejoin="round" />
                                                        <Line type="monotone" dataKey="in" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }} name="Input" strokeLinecap="round" strokeLinejoin="round" />
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            );
                                        })()
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 font-bold">暂无数据</div>
                                    )}
                                </div>
                            </div>

                            {/* Right: Donut Chart (Modern Conic Gradient) */}
                            <div className="flex flex-col md:flex-row items-center justify-center gap-8 pl-0 md:pl-8 border-l border-transparent md:border-slate-50 dark:md:border-slate-800/50">
                                {/* Donut Chart */}
                                {(() => {
                                    // Prepare data
                                    const sorted = aiStats?.model_breakdown ? [...aiStats.model_breakdown].sort((a, b) => b.total_tokens - a.total_tokens) : [];
                                    const top3 = sorted.slice(0, 3);
                                    const others = sorted.slice(3).reduce((acc, curr) => acc + curr.total_tokens, 0);
                                    const total = aiStats?.total_tokens || 1;
                                    const colors = ['#2636dd', '#0ea5e9', '#ec4899', '#cbd5e1'];
                                    const bgColors = ['bg-[#2636dd]', 'bg-sky-500', 'bg-pink-500', 'bg-slate-300'];

                                    const segments = [
                                        ...top3.map((m, i) => ({ label: m.model, value: m.total_tokens, color: colors[i], bgColor: bgColors[i] })),
                                        ...(others > 0 ? [{ label: '其他', value: others, color: colors[3], bgColor: bgColors[3] }] : [])
                                    ];

                                    // State for hovered segment
                                    const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);

                                    // Calculate segment angles for hover detection
                                    let cumulativeDeg = 0;
                                    const segmentAngles = segments.map(seg => {
                                        const startDeg = cumulativeDeg;
                                        const deg = (seg.value / total) * 360;
                                        cumulativeDeg += deg;
                                        return { ...seg, startDeg, endDeg: cumulativeDeg, percent: Math.round((seg.value / total) * 100) };
                                    });

                                    // Conic gradient string
                                    let gradientString = 'conic-gradient(';
                                    segmentAngles.forEach((seg, i) => {
                                        gradientString += `${seg.color} ${seg.startDeg}deg ${seg.endDeg}deg${i === segmentAngles.length - 1 ? '' : ', '}`;
                                    });
                                    gradientString += ')';

                                    return (
                                        <>
                                            <div className="relative group/donut cursor-pointer w-40 h-40 flex-shrink-0">
                                                {/* The Glow */}
                                                <div className="absolute inset-0 rounded-full bg-[#2636dd]/10 blur-xl opacity-0 group-hover/donut:opacity-100 transition-opacity duration-700"></div>

                                                {/* The Chart (Thicker Ring - 55%) */}
                                                <div
                                                    className="w-full h-full rounded-full relative transition-transform duration-500 hover:scale-105 shadow-sm"
                                                    style={{
                                                        background: gradientString,
                                                        mask: 'radial-gradient(transparent 55%, black 56%)',
                                                        WebkitMask: 'radial-gradient(transparent 55%, black 56%)'
                                                    }}
                                                >
                                                    {/* Invisible Segment Hover Areas (SVG overlay) */}
                                                    <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full">
                                                        {segmentAngles.map((seg, i) => {
                                                            // Create arc path for each segment
                                                            const startRad = (seg.startDeg - 90) * Math.PI / 180;
                                                            const endRad = (seg.endDeg - 90) * Math.PI / 180;
                                                            const r = 50; // radius
                                                            const x1 = 50 + r * Math.cos(startRad);
                                                            const y1 = 50 + r * Math.sin(startRad);
                                                            const x2 = 50 + r * Math.cos(endRad);
                                                            const y2 = 50 + r * Math.sin(endRad);
                                                            const largeArc = (seg.endDeg - seg.startDeg) > 180 ? 1 : 0;

                                                            return (
                                                                <path
                                                                    key={i}
                                                                    d={`M 50 50 L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`}
                                                                    fill="transparent"
                                                                    onMouseEnter={() => setHoveredIdx(i)}
                                                                    onMouseLeave={() => setHoveredIdx(null)}
                                                                    className="cursor-pointer"
                                                                />
                                                            );
                                                        })}
                                                    </svg>
                                                </div>

                                                {/* Center Text (Dynamic based on hover) */}
                                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
                                                    {hoveredIdx !== null ? (
                                                        <>
                                                            {/* Percentage on hover */}
                                                            <div className="text-3xl font-black leading-none mb-1" style={{ color: segmentAngles[hoveredIdx].color }}>
                                                                {segmentAngles[hoveredIdx].percent}%
                                                            </div>
                                                            <div className="text-[9px] font-bold text-slate-400 truncate max-w-[80px] text-center">
                                                                {segmentAngles[hoveredIdx].label}
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            {/* Default: Today's Token */}
                                                            <div className="text-2xl font-black text-slate-800 dark:text-white leading-none mb-1">
                                                                {aiStats?.daily_trend && aiStats.daily_trend.length > 0
                                                                    ? (() => {
                                                                        const val = aiStats.daily_trend[aiStats.daily_trend.length - 1].total_tokens;
                                                                        if (val >= 10000) return (val / 10000).toFixed(2) + 'w';
                                                                        if (val >= 1000) return (val / 1000).toFixed(1) + 'k';
                                                                        return val.toLocaleString();
                                                                    })()
                                                                    : '0'
                                                                }
                                                            </div>
                                                            <div className="text-[10px] font-bold text-slate-400">今日 Token</div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Legend (Right Side List) - No Percentages */}
                                            <div className="flex flex-col justify-center gap-3 min-w-[140px] flex-1">
                                                {segmentAngles.length === 0 ? (
                                                    <div className="text-[10px] text-slate-400">暂无数据</div>
                                                ) : (
                                                    segmentAngles.map((item, i) => (
                                                        <div
                                                            key={i}
                                                            className={`flex items-center justify-between text-xs group/item cursor-pointer w-full transition-all ${hoveredIdx === i ? 'scale-105' : ''}`}
                                                            onMouseEnter={() => setHoveredIdx(i)}
                                                            onMouseLeave={() => setHoveredIdx(null)}
                                                        >
                                                            <div className="flex items-center gap-2 overflow-hidden">
                                                                <span className={`w-2 h-2 rounded-full ${item.bgColor} flex-shrink-0 group-hover/item:scale-125 transition-transform`}></span>
                                                                <span className="font-bold text-slate-600 dark:text-slate-300 truncate" title={item.label}>
                                                                    {item.label}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-2 pl-2">
                                                                <span className="font-medium text-slate-400 text-[10px] tabular-nums">
                                                                    {item.value >= 1000 ? (item.value / 1000).toFixed(1) + 'k' : item.value}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column - Storage Stats */}
                <div className="space-y-6">
                    <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700/50">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 dark:text-white">对象存储</h3>
                                <p className="text-xs text-slate-400 font-medium mt-1">MinIO 存储统计</p>
                            </div>
                            <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl">
                                <HardDrive size={18} />
                            </div>
                        </div>

                        {/* Semi-circle Gauge + Stats Layout */}
                        <div className="flex items-center gap-6">
                            {/* Left: Semi-circle Gauge */}
                            <div className="relative flex-shrink-0" style={{ width: 160, height: 90 }}>
                                <PieChart width={160} height={90}>
                                    {/* @ts-ignore */}
                                    <Pie
                                        data={[
                                            { name: '已用', value: storageStats?.used_percent ?? 0 },
                                            { name: '剩余', value: 100 - (storageStats?.used_percent ?? 0) }
                                        ]}
                                        cx={75} // Center X adjustment
                                        cy={85} // Center Y (Bottom)
                                        innerRadius={60}
                                        outerRadius={75}
                                        startAngle={180}
                                        endAngle={0}
                                        paddingAngle={0}
                                        dataKey="value"
                                        stroke="none"
                                        activeIndex={activeStorageIndex !== null ? activeStorageIndex : undefined}
                                        activeShape={renderActiveShape}
                                        onClick={(_, index) => setActiveStorageIndex(index === activeStorageIndex ? null : index)}
                                        cursor="pointer"
                                    >
                                        <Cell fill="#10b981" />
                                        <Cell fill="#e2e8f0" className="dark:fill-slate-700" />
                                    </Pie>
                                </PieChart>
                                <div className="absolute bottom-0 left-[75px] -translate-x-1/2 text-center mb-1 pointer-events-none">
                                    <span className="text-2xl font-black text-slate-800 dark:text-white">
                                        {storageStats?.used_percent ?? 0}%
                                    </span>
                                </div>
                            </div>

                            {/* Right: Stats */}
                            <div className="flex-1 space-y-4 pt-2">
                                {/* Used Capacity (Index 0) */}
                                <div
                                    className={`flex items-end justify-between group transition-all duration-300 p-1.5 -mx-1.5 rounded-lg cursor-pointer ${activeStorageIndex === 0
                                        ? 'bg-emerald-50 dark:bg-emerald-900/10 scale-105 shadow-sm'
                                        : activeStorageIndex !== null
                                            ? 'opacity-40 grayscale'
                                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                        }`}
                                    onClick={() => setActiveStorageIndex(activeStorageIndex === 0 ? null : 0)}
                                >
                                    <div className="flex items-center gap-2.5 mb-0.5 relative z-10 pr-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]"></span>
                                        <span className={`text-xs font-bold transition-colors ${activeStorageIndex === 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}`}>已用容量</span>
                                    </div>
                                    <div className={`flex-grow border-b-2 border-dotted mb-1.5 mx-4 transition-colors ${activeStorageIndex === 0 ? 'border-emerald-200 dark:border-emerald-800' : 'border-slate-200 dark:border-slate-700'}`}></div>
                                    <div className={`relative z-10 pl-2 text-sm font-black transition-colors ${activeStorageIndex === 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-200'}`}>
                                        {storageStats ? formatBytes(storageStats.used_bytes) : '0 B'}
                                    </div>
                                </div>

                                {/* Remaining Capacity (Index 1) */}
                                <div
                                    className={`flex items-end justify-between group transition-all duration-300 p-1.5 -mx-1.5 rounded-lg cursor-pointer ${activeStorageIndex === 1
                                        ? 'bg-slate-100 dark:bg-slate-700 scale-105 shadow-sm'
                                        : activeStorageIndex !== null
                                            ? 'opacity-40 grayscale'
                                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                        }`}
                                    onClick={() => setActiveStorageIndex(activeStorageIndex === 1 ? null : 1)}
                                >
                                    <div className="flex items-center gap-2.5 mb-0.5 relative z-10 pr-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-slate-400 shadow-[0_0_8px_rgba(148,163,184,0.3)]"></span>
                                        <span className={`text-xs font-bold transition-colors ${activeStorageIndex === 1 ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>剩余容量</span>
                                    </div>
                                    <div className={`flex-grow border-b-2 border-dotted mb-1.5 mx-4 transition-colors ${activeStorageIndex === 1 ? 'border-slate-300 dark:border-slate-600' : 'border-slate-200 dark:border-slate-700'}`}></div>
                                    <div className={`relative z-10 pl-2 text-sm font-black transition-colors ${activeStorageIndex === 1 ? 'text-slate-800 dark:text-slate-100' : 'text-slate-700 dark:text-slate-200'}`}>
                                        {storageStats ? formatBytes(storageStats.free_bytes) : '0 B'}
                                    </div>
                                </div>

                                {/* Total Capacity (Static) */}
                                <div className={`flex items-end justify-between group transition-all duration-300 p-1.5 -mx-1.5 rounded-lg ${activeStorageIndex !== null ? 'opacity-40 grayscale' : ''}`}>
                                    <div className="flex items-center gap-2.5 mb-0.5 relative z-10 pr-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.3)]"></span>
                                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">总容量</span>
                                    </div>
                                    <div className="flex-grow border-b-2 border-dotted border-slate-200 dark:border-slate-700 mb-1.5 mx-4"></div>
                                    <div className="relative z-10 pl-2 text-sm font-black text-slate-700 dark:text-slate-200">
                                        {storageStats ? formatBytes(storageStats.total_bytes) : '0 B'}
                                    </div>
                                </div>

                                {/* Object Count (Static) */}
                                <div className={`flex items-end justify-between group transition-all duration-300 p-1.5 -mx-1.5 rounded-lg ${activeStorageIndex !== null ? 'opacity-40 grayscale' : ''}`}>
                                    <div className="flex items-center gap-2.5 mb-0.5 relative z-10 pr-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.3)]"></span>
                                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Object 数</span>
                                    </div>
                                    <div className="flex-grow border-b-2 border-dotted border-slate-200 dark:border-slate-700 mb-1.5 mx-4"></div>
                                    <div className="relative z-10 pl-2 text-sm font-black text-slate-700 dark:text-slate-200">
                                        {storageStats?.object_count ?? 0}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div >
        </div >
    );
};

export default AdminDashboard;
