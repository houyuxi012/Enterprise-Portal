import React from 'react';
import { Users, Globe, Zap, Heart } from 'lucide-react';

const AboutUs: React.FC = () => {
    const stats = [
        {
            icon: <Users className="w-6 h-6 text-indigo-500" />,
            value: '1,200+',
            label: '全球员工',
            color: 'indigo'
        },
        {
            icon: <Globe className="w-6 h-6 text-blue-500" />,
            value: '24',
            label: '覆盖城市',
            color: 'blue'
        },
        {
            icon: <Zap className="w-6 h-6 text-violet-500" />,
            value: '150+',
            label: '专利技术',
            color: 'violet'
        },
        {
            icon: <Heart className="w-6 h-6 text-rose-500" />,
            value: '99.2%',
            label: '客户满意度',
            color: 'rose'
        }
    ];

    return (
        <div className="flex flex-col items-center justify-center min-h-[80vh] animate-in fade-in zoom-in-95 duration-700 p-6">

            {/* Badge */}
            <div className="mb-8 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 rounded-full px-6 py-2 flex items-center space-x-2 shadow-sm">
                <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                </span>
                <span className="text-[10px] font-black tracking-[0.2em] text-indigo-600 dark:text-indigo-300 uppercase">
                    零信任架构 · 身份驱动安全 · 全链路审计
                </span>
            </div>

            {/* Title */}
            <h1 className="text-4xl md:text-6xl font-black text-slate-900 dark:text-white tracking-tight mb-2 text-center">
                关于
            </h1>
            <h1 className="text-3xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 mb-8 text-center drop-shadow-sm">
                Next-Gen Enterprise Portal
            </h1>

            {/* Description */}
            <p className="max-w-2xl text-center text-slate-500 dark:text-slate-400 text-sm md:text-base font-medium leading-relaxed mb-16">
                我们致力于构建下一代企业级智慧协作生态，通过 AI 驱动的技术方案，让每一位员工都能在数字空间中释放无限潜能。
            </p>

            {/* Cards Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 w-full max-w-5xl">
                {stats.map((stat, index) => (
                    <div
                        key={index}
                        className="bg-white dark:bg-slate-800 rounded-[2rem] p-8 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-50 dark:border-slate-700/50 flex flex-col items-center justify-center group hover:-translate-y-2 transition-transform duration-500"
                    >
                        <div className={`mb-4 p-4 bg-${stat.color}-50 dark:bg-${stat.color}-900/10 rounded-2xl group-hover:scale-110 transition-transform duration-500`}>
                            {stat.icon}
                        </div>
                        <div className="text-3xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">
                            {stat.value}
                        </div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            {stat.label}
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer Decoration */}
            <div className="mt-20 opacity-20">
                <div className="flex space-x-2">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="w-1 h-1 rounded-full bg-slate-400"></div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default AboutUs;
