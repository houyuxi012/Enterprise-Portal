import React, { useState } from 'react';
import { Lock, Eye, EyeOff, Loader2, ArrowRight, Fingerprint, Globe, Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import ApiClient from '../../services/api';

interface AdminLoginProps {
    onLoginSuccess: () => void;
}

const AdminLogin: React.FC<AdminLoginProps> = ({ onLoginSuccess }) => {
    const { login, logout } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [systemConfig, setSystemConfig] = useState<Record<string, string>>({});

    React.useEffect(() => {
        const fetchConfig = async () => {
            try {
                const config = await ApiClient.getSystemConfig();
                setSystemConfig(config);
            } catch (e) {
                console.error("Failed to load system config", e);
            }
        };
        fetchConfig();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            const user = await login(username, password);
            if (user.role !== 'admin') {
                setError('Access Denied: Administrator privileges required.');
                logout(); // Clear invalid session
            } else {
                onLoginSuccess();
            }
        } catch (err) {
            setError('Invalid credentials. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex bg-slate-50 dark:bg-slate-900">
            {/* Left Panel - Branding */}
            <div className="hidden lg:flex lg:w-1/2 bg-[#0A1A3B] relative flex-col justify-between p-16 overflow-hidden">
                {/* Abstract Background Elements */}
                <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-3xl"></div>
                <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-3xl"></div>

                <div className="relative z-10">
                    <div className="flex items-center space-x-3 mb-12">
                        <img
                            src={systemConfig.logo_url || '/images/logo.png'}
                            className="w-10 h-10 rounded-xl object-cover shadow-lg shadow-blue-500/50"
                            alt="Logo"
                        />
                        <span className="text-white font-bold text-xl tracking-wide">{systemConfig.app_name || 'Next-Gen Enterprise Portal'}</span>
                    </div>

                    <h1 className="text-5xl font-black text-white leading-tight tracking-tight mb-8">
                        Empowering<br />
                        <span className="text-blue-400">Next-Gen</span><br />
                        Workplaces.
                    </h1>

                    <p className="text-slate-400 text-lg leading-relaxed max-w-md">
                        Experience the future of enterprise collaboration with AI-powered insights and seamless productivity tools.
                    </p>
                </div>

                <div className="relative z-10">
                    <div className="inline-flex items-center space-x-3 bg-white/5 backdrop-blur-sm px-4 py-3 rounded-2xl border border-white/10">
                        <div className="p-1.5 bg-blue-500/20 rounded-lg text-blue-400">
                            <Lock size={16} />
                        </div>
                        <div>
                            <p className="text-white text-xs font-bold uppercase tracking-wider">ENTERPRISE SECURE</p>
                            <p className="text-slate-500 text-[10px]">AES-256 Multi-Layer Encryption</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Panel - Login Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
                <div className="max-w-md w-full">
                    <div className="mb-10">
                        <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-2">欢迎回来</h2>
                        <p className="text-slate-500 text-sm">请使用您的企业账户登录系统</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">企业邮箱 / 工号</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                                    <MailIcon size={18} />
                                </div>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="block w-full pl-11 pr-4 py-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-300"
                                    placeholder="name@shiku.com"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between ml-1">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">登录密码</label>
                                <a href="#" className="text-xs font-bold text-blue-600 hover:text-blue-700">忘记密码?</a>
                            </div>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                                    <Lock size={18} />
                                </div>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="block w-full pl-11 pr-12 py-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-300"
                                    placeholder="••••••••"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center ml-1">
                            <input
                                id="remember-me"
                                type="checkbox"
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded"
                            />
                            <label htmlFor="remember-me" className="ml-2 block text-xs text-slate-500 font-medium">
                                记住本次登录
                            </label>
                        </div>

                        {error && (
                            <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold text-center animate-in fade-in slide-in-from-top-2">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full flex items-center justify-center py-4 px-6 border border-transparent rounded-2xl text-sm font-black text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-xl shadow-blue-500/20 transition-all disabled:opacity-70 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
                        >
                            {isLoading ? <Loader2 size={20} className="animate-spin" /> : (
                                <>
                                    <span className="mr-2">安全登录</span>
                                    <ArrowRight size={16} />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-12 flex justify-between items-center text-[10px] text-slate-300 font-medium uppercase tracking-widest">
                        <div className="flex items-center space-x-1">
                            <Sparkles size={12} className="text-blue-400" />
                            <span>© 2025 侯钰熙. All Rights Reserved.</span>
                        </div>
                        <a href="#" className="hover:text-slate-500 transition-colors">隐私权政策</a>
                    </div>

                </div>
            </div>
        </div>
    );
};

// Start Icon Helper (since I used MailIcon above but didn't import distinct one, usually just Mail)
const MailIcon: React.FC<{ size?: number }> = ({ size }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
);


export default AdminLogin;
