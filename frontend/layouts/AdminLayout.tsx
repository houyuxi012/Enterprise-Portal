import React from 'react';
import {
    LayoutDashboard, Newspaper, Users, LogOut, ArrowLeft, Shield
} from 'lucide-react';
import AuthService from '../services/auth';

interface AdminLayoutProps {
    children: React.ReactNode;
    activeTab: 'dashboard' | 'news' | 'employees' | 'users';
    onTabChange: (tab: 'dashboard' | 'news' | 'employees' | 'users') => void;
    onExit: () => void;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children, activeTab, onTabChange, onExit }) => {
    const handleLogout = () => {
        AuthService.logout();
        window.location.reload();
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex">
            {/* Sidebar */}
            <aside className="w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col fixed inset-y-0 z-20">
                <div className="h-16 flex items-center px-6 border-b border-slate-100 dark:border-slate-700/50">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-black mr-3">
                        A
                    </div>
                    <span className="font-black text-slate-800 dark:text-white tracking-tight">Admin Portal</span>
                </div>

                <nav className="flex-1 p-4 space-y-1">
                    <button
                        onClick={() => onTabChange('dashboard')}
                        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${activeTab === 'dashboard' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                    >
                        <LayoutDashboard size={18} />
                        <span className="text-sm font-bold">概览面板</span>
                    </button>

                    <div className="pt-4 pb-2 px-4 text-xs font-black text-slate-400 uppercase tracking-widest">内容管理</div>

                    <button
                        onClick={() => onTabChange('news')}
                        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${activeTab === 'news' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                    >
                        <Newspaper size={18} />
                        <span className="text-sm font-bold">新闻公告</span>
                    </button>

                    <button
                        onClick={() => onTabChange('employees')}
                        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${activeTab === 'employees' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                    >
                        <Users size={18} />
                        <span className="text-sm font-bold">员工档案</span>
                    </button>

                    <div className="pt-4 pb-2 px-4 text-xs font-black text-slate-400 uppercase tracking-widest">系统管理</div>

                    <button
                        onClick={() => onTabChange('users')}
                        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${activeTab === 'users' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                    >
                        <Shield size={18} />
                        <span className="text-sm font-bold">用户权限</span>
                    </button>
                </nav>

                <div className="p-4 border-t border-slate-100 dark:border-slate-700/50 space-y-2">
                    <button
                        onClick={onExit}
                        className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                    >
                        <ArrowLeft size={18} />
                        <span className="text-sm font-bold">返回前台</span>
                    </button>
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                    >
                        <LogOut size={18} />
                        <span className="text-sm font-bold">退出登录</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 ml-64 p-8">
                <div className="max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default AdminLayout;
