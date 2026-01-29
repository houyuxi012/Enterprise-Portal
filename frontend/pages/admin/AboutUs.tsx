import React, { useEffect, useState } from 'react';
import ApiClient from '../../services/api';
import { Tag, Spin } from 'antd';

const AboutUs: React.FC = () => {
    const [info, setInfo] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchInfo = async () => {
            try {
                const data = await ApiClient.getSystemInfo();
                setInfo(data);
            } catch (error) {
                console.error("Failed to fetch system info", error);
            } finally {
                setLoading(false);
            }
        };
        fetchInfo();
    }, []);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Spin size="large" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-700 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-6 min-h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-2 max-w-2xl mx-auto w-full">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">关于系统</h2>
                    <p className="text-xs text-slate-400 font-bold mt-1">系统版本与运行环境信息</p>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-10 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700/50 max-w-2xl mx-auto text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"></div>

                <div className="mb-10">
                    <div className="w-24 h-24 bg-slate-900 dark:bg-white rounded-[2rem] flex items-center justify-center text-white dark:text-slate-900 font-black text-4xl mx-auto mb-6 shadow-2xl shadow-indigo-500/20 transform hover:rotate-6 transition-transform duration-500">
                        A
                    </div>
                    <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">管理后台系统</h2>
                    <p className="text-slate-500 dark:text-slate-400 font-medium">Next-Gen Enterprise Portal</p>
                    <div className="mt-6 flex justify-center">
                        <Tag color={info?.status === 'Online' ? 'success' : 'default'} className="px-4 py-1.5 text-sm rounded-full font-bold border-0 bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                            {info?.status || 'Online'}
                        </Tag>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-6 bg-slate-50 dark:bg-slate-900/50 rounded-3xl border border-slate-100 dark:border-slate-800 hover:border-indigo-100 transition-colors group">
                        <p className="text-xs text-slate-400 mb-2 uppercase tracking-widest font-bold">系统版本</p>
                        <p className="text-xl font-black text-slate-900 dark:text-white group-hover:text-indigo-600 transition-colors">{info?.version || '1.0.0'}</p>
                    </div>

                    <div className="p-6 bg-slate-50 dark:bg-slate-900/50 rounded-3xl border border-slate-100 dark:border-slate-800 hover:border-indigo-100 transition-colors group">
                        <p className="text-xs text-slate-400 mb-2 uppercase tracking-widest font-bold">运行环境</p>
                        <p className="text-xl font-black text-slate-900 dark:text-white group-hover:text-indigo-600 transition-colors">{info?.environment || '生产环境'}</p>
                    </div>

                    <div className="p-6 bg-slate-50 dark:bg-slate-900/50 rounded-3xl border border-slate-100 dark:border-slate-800 hover:border-indigo-100 transition-colors md:col-span-2 flex items-center justify-between">
                        <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">数据库连接</p>

                        <span className={`inline-flex items-center gap-2 font-bold ${info?.database === 'Connected' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            <span className={`w-2.5 h-2.5 rounded-full ${info?.database === 'Connected' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
                            {info?.database === 'Connected' ? '正常连接' : '连接断开'}
                        </span>
                    </div>
                </div>

                <div className="mt-10 pt-10 border-t border-slate-100 dark:border-slate-800/50">
                    <p className="text-xs font-bold text-slate-300 dark:text-slate-600">
                        © 2025 Enterprise Portal System. All Rights Reserved.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AboutUs;
