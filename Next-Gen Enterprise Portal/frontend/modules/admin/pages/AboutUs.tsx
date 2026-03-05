import React from 'react';
import { ShieldCheck, BrainCircuit, Database, Fingerprint } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const AboutUs: React.FC = () => {
    const { t } = useTranslation();
    const stats = [
        {
            icon: <ShieldCheck className="w-6 h-6 text-indigo-500" />,
            valueKey: 'aboutUsPage.stats.zeroTrust.value',
            labelKey: 'aboutUsPage.stats.zeroTrust.label',
            colorClass: 'bg-indigo-50 dark:bg-indigo-900/10'
        },
        {
            icon: <BrainCircuit className="w-6 h-6 text-blue-500" />,
            valueKey: 'aboutUsPage.stats.multiModel.value',
            labelKey: 'aboutUsPage.stats.multiModel.label',
            colorClass: 'bg-blue-50 dark:bg-blue-900/10'
        },
        {
            icon: <Database className="w-6 h-6 text-violet-500" />,
            valueKey: 'aboutUsPage.stats.knowledgeBase.value',
            labelKey: 'aboutUsPage.stats.knowledgeBase.label',
            colorClass: 'bg-violet-50 dark:bg-violet-900/10'
        },
        {
            icon: <Fingerprint className="w-6 h-6 text-rose-500" />,
            valueKey: 'aboutUsPage.stats.audit.value',
            labelKey: 'aboutUsPage.stats.audit.label',
            colorClass: 'bg-rose-50 dark:bg-rose-900/10'
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
                    {t('aboutUsPage.badge')}
                </span>
            </div>

            {/* Title */}
            <h1 className="text-4xl md:text-6xl font-black text-slate-900 dark:text-white tracking-tight mb-2 text-center">
                {t('aboutUsPage.titlePrefix')}
            </h1>
            <h1 className="text-3xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 mb-8 text-center drop-shadow-sm">
                {t('aboutUsPage.titleMain')}
            </h1>

            {/* Description */}
            <p className="max-w-2xl text-center text-slate-500 dark:text-slate-400 text-sm md:text-base font-medium leading-relaxed mb-16">
                {t('aboutUsPage.description')}
            </p>

            {/* Cards Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 w-full max-w-5xl">
                {stats.map((stat, index) => (
                    <div
                        key={index}
                        className="bg-white dark:bg-slate-800 rounded-[2rem] p-8 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-50 dark:border-slate-700/50 flex flex-col items-center justify-center group hover:-translate-y-2 transition-transform duration-500"
                    >
                        <div className={`mb-4 p-4 rounded-2xl group-hover:scale-110 transition-transform duration-500 ${stat.colorClass}`}>
                            {stat.icon}
                        </div>
                        <div className="text-3xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">
                            {t(stat.valueKey)}
                        </div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            {t(stat.labelKey)}
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
