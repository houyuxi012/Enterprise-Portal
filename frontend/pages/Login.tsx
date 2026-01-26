import React, { useState } from 'react';
import { Lock, User, ArrowRight, Loader2 } from 'lucide-react';
import AuthService from '../services/auth';

interface LoginProps {
    onLoginSuccess: () => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            await AuthService.login(username, password);
            onLoginSuccess();
        } catch (err) {
            setError('用户名或密码错误');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
            <div className="max-w-md w-full mica p-8 rounded-[2.5rem] shadow-2xl ring-1 ring-white/50">
                <div className="text-center mb-10">
                    <div className="w-16 h-16 mx-auto bg-gradient-to-br from-blue-600 to-cyan-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/30 mb-6">
                        <Lock size={32} />
                    </div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">欢迎回来</h1>
                    <p className="text-slate-500 text-sm mt-2 font-medium">请登录 ShiKu Enterprise Portal</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-4">
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                                <User size={18} />
                            </div>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="block w-full pl-11 pr-4 py-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                placeholder="用户名"
                                required
                            />
                        </div>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                                <Lock size={18} />
                            </div>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="block w-full pl-11 pr-4 py-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                placeholder="密码"
                                required
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="p-4 rounded-xl bg-rose-50 text-rose-600 text-xs font-bold text-center animate-in fade-in slide-in-from-top-2">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex items-center justify-center py-4 px-6 border border-transparent rounded-2xl text-sm font-black text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-lg shadow-blue-500/30 transition-all disabled:opacity-70 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
                    >
                        {isLoading ? <Loader2 size={20} className="animate-spin" /> : (
                            <>
                                <span className="mr-2">登 录</span>
                                <ArrowRight size={16} />
                            </>
                        )}
                    </button>
                </form>

                <p className="mt-8 text-center text-[10px] text-slate-400 font-medium">
                    忘记密码请联系 IT 部门 · ShiKu Inc.
                </p>
            </div>
        </div>
    );
};

export default Login;
