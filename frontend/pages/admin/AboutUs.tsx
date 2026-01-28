import React from 'react';

const AboutUs: React.FC = () => {
    return (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 dark:bg-slate-800 dark:border-slate-700 max-w-2xl mx-auto text-center">
            <div className="mb-8">
                <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-bold text-3xl mx-auto mb-4 shadow-lg shadow-blue-500/30">
                    A
                </div>
                <h2 className="text-3xl font-bold dark:text-white">Admin Portal</h2>
                <p className="text-slate-500 dark:text-slate-400 mt-2">Enterprise Management System</p>
            </div>

            <div className="space-y-6">
                <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-2xl">
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider font-bold">Version</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">v1.0.0</p>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-2xl">
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider font-bold">Developer</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">ShiKu Enterprise Team</p>
                </div>

                <div className="pt-6 border-t border-slate-100 dark:border-slate-700">
                    <p className="text-xs text-slate-400">
                        &copy; 2026 ShiKu Inc. All rights reserved.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AboutUs;
