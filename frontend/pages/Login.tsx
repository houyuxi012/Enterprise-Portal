import React, { useState, useEffect } from 'react';
import { App } from 'antd';
import { Lock, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import ApiClient from '../services/api';

interface LoginProps {
    onLoginSuccess: () => void;
}

const REMEMBERED_PORTAL_USERNAME_KEY = 'portal_remembered_username';

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
    const { login } = useAuth();
    const { message } = App.useApp();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [rememberAccount, setRememberAccount] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const [requiresCaptcha, setRequiresCaptcha] = useState(false);
    const [captchaId, setCaptchaId] = useState('');
    const [captchaImage, setCaptchaImage] = useState('');
    const [captchaCode, setCaptchaCode] = useState('');

    const [appName, setAppName] = useState(() => localStorage.getItem('sys_app_name') || 'Next-Gen Enterprise Portal');
    const [logoUrl, setLogoUrl] = useState<string>(() => localStorage.getItem('sys_logo_url') || '/images/logo.png');
    const [footerText, setFooterText] = useState(() => localStorage.getItem('sys_footer_text') || '© 2025 侯钰熙. All Rights Reserved.');

    const fetchCaptcha = async () => {
        try {
            const data = await ApiClient.getCaptcha();
            setCaptchaId(data.captcha_id);
            setCaptchaImage(data.captcha_image);
        } catch (e) {
            message.error('获取验证码失败');
        }
    };

    useEffect(() => {
        const rememberedUsername = localStorage.getItem(REMEMBERED_PORTAL_USERNAME_KEY);
        if (rememberedUsername) {
            setUsername(rememberedUsername);
            setRememberAccount(true);
        }

        const fetchConfig = async () => {
            try {
                const config = await ApiClient.getPublicSystemConfig();
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
            const headers: any = {};
            if (requiresCaptcha) {
                const normalizedCaptcha = captchaCode.trim();
                if (!captchaId) {
                    await fetchCaptcha();
                    throw new Error('验证码加载中，请稍后重试');
                }
                if (normalizedCaptcha.length !== 4) {
                    throw new Error('请输入4位验证码');
                }
                headers['X-Captcha-ID'] = captchaId;
                headers['X-Captcha-Code'] = normalizedCaptcha;
            }
            await login(username, password, 'portal', headers);
            if (rememberAccount && username.trim()) {
                localStorage.setItem(REMEMBERED_PORTAL_USERNAME_KEY, username.trim());
            } else {
                localStorage.removeItem(REMEMBERED_PORTAL_USERNAME_KEY);
            }
            message.success('登录成功');
            onLoginSuccess();
        } catch (err: any) {
            // Parse backend error response
            const detailPayload = err?.response?.data?.detail;
            const detail = typeof detailPayload === 'string'
                ? detailPayload
                : (detailPayload?.message || '');
            const detailCode = typeof detailPayload === 'object' && detailPayload?.code
                ? String(detailPayload.code)
                : '';
            let msg = err?.message || '登录失败，请检查网络连接';
            const shouldShowCaptcha =
                err?.response?.status === 428 ||
                err?.response?.headers?.['x-requires-captcha'] === 'true' ||
                /captcha/i.test(`${detail} ${detailCode}`);

            if (shouldShowCaptcha) {
                setRequiresCaptcha(true);
                fetchCaptcha();
                setCaptchaCode('');
                if (/invalid|expired/i.test(String(detail))) {
                    msg = '验证码错误或已过期，请重试';
                } else if (/verification required/i.test(String(detail))) {
                    msg = '需要验证码，请输入后重试';
                } else {
                    msg = detail || '请输入验证码';
                }
            } else if (detail.includes('locked')) {
                msg = '账户已被锁定，请稍后再试';
            } else if (detail.includes('IP')) {
                msg = '当前 IP 地址无访问权限';
            } else if (err?.response?.status === 403 && (/并发|concurrent/i.test(String(detail)))) {
                msg = '该用户超过并发设定，请退出其他设备后再次尝试登陆';
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

                        {requiresCaptcha && (
                            <div className="flex items-center space-x-3 mt-4 animate-in fade-in slide-in-from-top-2">
                                <input
                                    type="text"
                                    value={captchaCode}
                                    onChange={(e) => setCaptchaCode(e.target.value)}
                                    className="block w-full px-4 py-3.5 bg-slate-50 border border-transparent rounded-xl text-slate-900 text-sm font-medium placeholder:text-slate-400 focus:bg-white focus:border-blue-500/20 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                                    placeholder="验证码"
                                    required
                                    maxLength={4}
                                />
                                <div
                                    className="h-[52px] min-w-[120px] bg-slate-100 rounded-xl overflow-hidden cursor-pointer hover:opacity-80 transition-opacity border border-slate-200"
                                    onClick={fetchCaptcha}
                                    title="点击刷新验证码"
                                >
                                    {captchaImage ? (
                                        <img src={captchaImage} alt="captcha" className="w-full h-full object-contain" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                                            <Loader2 size={18} className="animate-spin" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="p-3 rounded-xl bg-rose-50 text-rose-600 text-xs font-bold text-center animate-in fade-in slide-in-from-top-1">
                                {error}
                            </div>
                        )}

                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                <input
                                    id="remember-account"
                                    name="remember-account"
                                    type="checkbox"
                                    checked={rememberAccount}
                                    onChange={(e) => {
                                        const checked = e.target.checked;
                                        setRememberAccount(checked);
                                        if (!checked) {
                                            localStorage.removeItem(REMEMBERED_PORTAL_USERNAME_KEY);
                                        }
                                    }}
                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded"
                                />
                                <label htmlFor="remember-account" className="ml-2 block text-sm text-slate-500 font-medium">记住账户</label>
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
