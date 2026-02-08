import React, { useState, useEffect } from 'react';
import { App } from 'antd';
import { Lock, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import ApiClient from '../services/api';

interface LoginProps {
    onLoginSuccess: () => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
    const { login } = useAuth();
    const { message } = App.useApp();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const [appName, setAppName] = useState(() => localStorage.getItem('sys_app_name') || 'Next-Gen Enterprise Portal');
    const [logoUrl, setLogoUrl] = useState<string>(() => localStorage.getItem('sys_logo_url') || '/images/logo.png');
    const [footerText, setFooterText] = useState(() => localStorage.getItem('sys_footer_text') || '© 2025 侯钰熙. All Rights Reserved.');

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const config = await ApiClient.getSystemConfig();
                if (config.app_name) {
                    setAppName(config.app_name);
                    localStorage.setItem('sys_app_name', config.app_name);
                }
                if (config.logo_url) {
                    setLogoUrl(config.logo_url);
                    localStorage.setItem('sys_logo_url', config.logo_url);
                }
                if (config.footer_text) {
                    setFooterText(config.footer_text);
                    localStorage.setItem('sys_footer_text', config.footer_text);
                }
                if (config.browser_title) document.title = config.browser_title;
                if (config.favicon_url) {
                    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
                    if (link) {
                        link.href = config.favicon_url;
                    } else {
                        const newLink = document.createElement('link');
                        newLink.rel = 'icon';
                        newLink.href = config.favicon_url;
                        document.head.appendChild(newLink);
                    }
                }
            } catch (error) {
                console.error("Failed to load system config:", error);
            }
        };
        fetchConfig();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            await login(username, password);
            message.success('登录成功');
            onLoginSuccess();
        } catch (err: any) {
            // Parse backend error response
            const detail = err?.response?.data?.detail || '';
            let msg = '登录失败，请检查网络连接';

            if (detail.includes('locked')) {
                msg = '账户已被锁定，请稍后再试';
            } else if (detail.includes('IP')) {
                msg = '当前 IP 地址无访问权限';
            } else if (err?.response?.status === 401) {
                msg = '用户名或密码错误';
            }

            setError(msg);
            message.error(msg);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-white relative flex flex-col">
            {/* Top Bar */}
            <header className="w-full max-w-7xl mx-auto p-6 flex justify-between items-center z-10">
                <div className="flex items-center space-x-4">
                    <img src={logoUrl} alt="Logo" className="w-12 h-12 rounded-lg object-contain" />
                    <span className="text-2xl font-bold text-slate-800 tracking-tight">{appName}</span>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 flex items-center justify-center -mt-20 px-4">
                <div className="max-w-sm w-full space-y-8">
                    {/* Headers */}
                    <div className="text-center space-y-2">
                        <h1 className="text-3xl font-bold text-slate-900">欢迎登录</h1>
                        <p className="text-slate-500 font-medium tracking-wide">请使用您的企业账户登录系统</p>
                    </div>

                    {/* Login Form */}
                    <form onSubmit={handleSubmit} className="space-y-6 pt-4">
                        <div className="space-y-4">
                            <div>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="block w-full px-4 py-3.5 bg-slate-50 border border-transparent rounded-xl text-slate-900 text-sm font-medium placeholder:text-slate-400 focus:bg-white focus:border-blue-500/20 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                                    placeholder="请输入用户名"
                                    required
                                />
                            </div>
                            <div>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="block w-full px-4 py-3.5 bg-slate-50 border border-transparent rounded-xl text-slate-900 text-sm font-medium placeholder:text-slate-400 focus:bg-white focus:border-blue-500/20 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                                    placeholder="请输入密码"
                                    required
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="p-3 rounded-xl bg-rose-50 text-rose-600 text-xs font-bold text-center animate-in fade-in slide-in-from-top-1">
                                {error}
                            </div>
                        )}

                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                <input id="remember-me" name="remember-me" type="checkbox" className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded" />
                                <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-500 font-medium">记住我</label>
                            </div>
                            <div className="text-sm">
                                <a href="#" className="font-bold text-blue-600 hover:text-blue-700">忘记密码?</a>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full flex items-center justify-center py-3.5 px-6 border border-transparent rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/20 transition-all shadow-lg shadow-blue-500/30 disabled:opacity-70 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
                        >
                            {isLoading ? <Loader2 size={18} className="animate-spin" /> : '立即登录'}
                        </button>
                    </form>
                </div>
            </main>

            {/* Footer */}
            <footer className="py-6 text-center text-xs text-slate-400 font-medium tracking-wide mb-4">
                {footerText}
            </footer>
        </div>
    );
};

export default Login;
