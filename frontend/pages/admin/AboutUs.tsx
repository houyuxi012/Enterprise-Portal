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
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 dark:bg-slate-800 dark:border-slate-700 max-w-2xl mx-auto text-center">
            <div className="mb-8">
                <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-bold text-3xl mx-auto mb-4 shadow-lg shadow-blue-500/30">
                    A
                </div>
                <h2 className="text-3xl font-bold dark:text-white">管理后台</h2>
                <p className="text-slate-500 dark:text-slate-400 mt-2">企业级管理系统</p>
                <div className="mt-4">
                    <Tag color="green" className="px-3 py-1 text-sm rounded-full">
                        {info?.status || 'Online'}
                    </Tag>
                </div>
            </div>

            <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-2xl">
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider font-bold">系统版本</p>
                        <p className="text-lg font-bold text-slate-900 dark:text-white">{info?.version || '1.0.0'}</p>
                    </div>

                    <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-2xl">
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider font-bold">运行环境</p>
                        <p className="text-lg font-bold text-slate-900 dark:text-white">{info?.environment || '生产环境'}</p>
                    </div>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-2xl">
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider font-bold">数据库状态</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">
                        <span className={`inline-flex items-center gap-2 ${info?.database === 'Connected' ? 'text-emerald-600' : 'text-red-600'}`}>
                            <span className={`w-2 h-2 rounded-full ${info?.database === 'Connected' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                            {info?.database || 'Unknown'}
                        </span>
                    </p>
                </div>


            </div>
        </div>
    );
};

export default AboutUs;
