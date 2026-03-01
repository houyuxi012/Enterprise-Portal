import React, { useState } from 'react';
import { App } from 'antd';
import { Lock, Eye, EyeOff, Loader2, ArrowRight, Fingerprint, Globe, Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import ApiClient from '../../services/api';
import { hasAdminAccess } from '../../utils/adminAccess';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import { useTranslation } from 'react-i18next';

import { AppModal, AppButton } from '../../components/admin';

interface AdminLoginProps {
    onLoginSuccess: () => void;
}

const AdminLogin: React.FC<AdminLoginProps> = ({ onLoginSuccess }) => {
    const { t } = useTranslation();
    const { login, logout } = useAuth();
    const { message } = App.useApp();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [systemConfig, setSystemConfig] = useState<Record<string, string>>({});
    const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);

    const [requiresCaptcha, setRequiresCaptcha] = useState(false);
    const [captchaId, setCaptchaId] = useState('');
    const [captchaImage, setCaptchaImage] = useState('');
    const [captchaCode, setCaptchaCode] = useState('');

    const fetchCaptcha = async () => {
        try {
            const data = await ApiClient.getCaptcha();
            setCaptchaId(data.captcha_id);
            setCaptchaImage(data.captcha_image);
        } catch (e) {
            message.error(t('loginAdmin.messages.captchaFetchFailed'));
        }
    };

    React.useEffect(() => {
        const fetchConfig = async () => {
            try {
                const config = await ApiClient.getPublicSystemConfig();
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
            const headers: any = {};
            if (requiresCaptcha) {
                const normalizedCaptcha = captchaCode.trim();
                if (!captchaId) {
                    await fetchCaptcha();
                    throw new Error(t('loginAdmin.messages.captchaLoading'));
                }
                if (normalizedCaptcha.length !== 4) {
                    throw new Error(t('loginAdmin.messages.captchaLength'));
                }
                headers['X-Captcha-ID'] = captchaId;
                headers['X-Captcha-Code'] = normalizedCaptcha;
            }
            const user = await login(username, password, 'admin', headers);

            if (!hasAdminAccess(user)) {
                const msg = t('loginAdmin.messages.noAdminAccess');
                setError(msg);
                message.error(msg);
                logout(); // Clear invalid session
                return;
            }
            message.success(t('loginAdmin.messages.loginSuccess'));
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
            let msg = err?.message || t('loginAdmin.messages.loginFailedNetwork');
            const shouldShowCaptcha =
                err?.response?.status === 428 ||
                err?.response?.headers?.['x-requires-captcha'] === 'true' ||
                /captcha/i.test(`${detail} ${detailCode}`);

            if (shouldShowCaptcha) {
                setRequiresCaptcha(true);
                fetchCaptcha();
                setCaptchaCode('');
                if (/invalid|expired/i.test(String(detail))) {
                    msg = t('loginAdmin.messages.captchaInvalid');
                } else if (/verification required/i.test(String(detail))) {
                    msg = t('loginAdmin.messages.captchaRequired');
                } else {
                    msg = detail || t('loginAdmin.messages.captchaPleaseInput');
                }
            } else if (detail.includes('locked')) {
                msg = t('loginAdmin.messages.accountLocked');
            } else if (detail.includes('IP')) {
                msg = t('loginAdmin.messages.ipForbidden');
            } else if (err?.response?.status === 403 && (/concurrent|session limit/i.test(String(detail)))) {
                msg = t('loginAdmin.messages.concurrentExceeded');
            } else if (err?.response?.status === 401) {
                msg = t('loginAdmin.messages.invalidCredentials');
            }

            setError(msg);
            message.error(msg);
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
                        <span className="text-white font-bold text-xl tracking-wide">{systemConfig.app_name || t('loginAdmin.fallbackAppName')}</span>
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
                            <p className="text-white text-xs font-bold uppercase tracking-wider">{t('loginAdmin.identityGovernanceTitle')}</p>
                            <p className="text-slate-500 text-[10px]">{t('loginAdmin.identityGovernanceSubtitle')}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Panel - Login Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8 relative">
                <div className="absolute top-6 right-6">
                    <LanguageSwitcher />
                </div>
                <div className="max-w-md w-full">
                    <div className="mb-10">
                        <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-2">{t('loginAdmin.welcomeTitle')}</h2>
                        <p className="text-slate-500 text-sm">{t('loginAdmin.welcomeSubtitle')}</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">{t('loginAdmin.accountLabel')}</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                                    <MailIcon size={18} />
                                </div>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="block w-full pl-11 pr-4 py-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-300"
                                    placeholder={t('loginPortal.usernamePlaceholder')}
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between ml-1">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('loginAdmin.passwordLabel')}</label>
                                <a href="#" className="text-xs font-bold text-blue-600 hover:text-blue-700">{t('loginAdmin.forgotPassword')}</a>
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
                                    placeholder={t('loginAdmin.passwordPlaceholder')}
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

                        {requiresCaptcha && (
                            <div className="flex items-center space-x-3 ml-1 animate-in fade-in slide-in-from-top-2">
                                <div className="relative flex-1">
                                    <input
                                        type="text"
                                        value={captchaCode}
                                        onChange={(e) => setCaptchaCode(e.target.value)}
                                        className="block w-full px-4 py-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-300"
                                        placeholder={t('loginAdmin.captchaPlaceholder')}
                                        required
                                        maxLength={4}
                                    />
                                </div>
                                <div
                                    className="h-[52px] min-w-[120px] bg-slate-100 rounded-2xl overflow-hidden cursor-pointer hover:opacity-80 transition-opacity border border-slate-200 dark:border-slate-700"
                                    onClick={fetchCaptcha}
                                    title={t('loginAdmin.captchaRefreshTitle')}
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
                                    <span className="mr-2">{t('loginAdmin.submit')}</span>
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-12 flex justify-between items-center text-[10px] text-slate-300 font-medium uppercase tracking-widest">
                        <div className="flex items-center space-x-1">
                            <span>{t('loginAdmin.footer')}</span>
                        </div>
                        <a
                            href="#"
                            onClick={(e) => { e.preventDefault(); setIsPrivacyOpen(true); }}
                            className="hover:text-slate-500 transition-colors"
                        >
                            {t('loginAdmin.privacyPolicy')}
                        </a>
                    </div>

                </div>
            </div>

            <AppModal
                title={t('loginAdmin.privacyPolicyTitle')}
                open={isPrivacyOpen}
                onCancel={() => setIsPrivacyOpen(false)}
                footer={[
                    <AppButton key="close" onClick={() => setIsPrivacyOpen(false)}>
                        {t('loginAdmin.privacyPolicyClose')}
                    </AppButton>
                ]}
                width={700}
                styles={{ body: { maxHeight: '60vh', overflowY: 'auto' } }}
            >
                <div className="prose prose-slate dark:prose-invert max-w-none p-4 whitespace-pre-wrap text-slate-600 dark:text-slate-300 leading-relaxed">
                    {systemConfig.privacy_policy || t('loginAdmin.privacyPolicyEmpty')}
                </div>
            </AppModal>
        </div>
    );
};


// Start Icon Helper (since I used MailIcon above but didn't import distinct one, usually just Mail)
const MailIcon: React.FC<{ size?: number }> = ({ size }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
);


export default AdminLogin;
