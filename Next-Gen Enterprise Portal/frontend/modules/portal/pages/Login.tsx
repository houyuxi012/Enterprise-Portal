import React, { useState, useEffect } from 'react';
import { App } from 'antd';
import { Lock, Loader2, ShieldCheck, Fingerprint } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import AuthService, { MfaRequiredError } from '@/services/auth';
import ApiClient from '@/services/api';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useTranslation } from 'react-i18next';

interface LoginProps {
    onLoginSuccess: () => void;
}

const REMEMBERED_PORTAL_USERNAME_KEY = 'portal_remembered_username';
const DEFAULT_LOGO_URL = '/images/logo.png';

const normalizeConfigValue = (value?: string): string => String(value ?? '').trim();

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
    const { t } = useTranslation();
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

    // MFA state
    const [mfaStep, setMfaStep] = useState(false);
    const [mfaToken, setMfaToken] = useState('');
    const [mfaMethods, setMfaMethods] = useState<string[]>([]);
    const [mfaMode, setMfaMode] = useState<'totp' | 'email'>('totp');
    const [totpCode, setTotpCode] = useState('');
    const [webauthnLoading, setWebauthnLoading] = useState(false);
    const [emailCodeSending, setEmailCodeSending] = useState(false);

    const [appName, setAppName] = useState(() => normalizeConfigValue(localStorage.getItem('sys_app_name') || '') || t('loginPortal.fallbackAppName'));
    const [logoUrl, setLogoUrl] = useState<string>(() => normalizeConfigValue(localStorage.getItem('sys_logo_url') || '') || DEFAULT_LOGO_URL);
    const [footerText, setFooterText] = useState(() => normalizeConfigValue(localStorage.getItem('sys_footer_text') || '') || t('loginPortal.fallbackFooter'));

    const fetchCaptcha = async () => {
        try {
            const data = await ApiClient.getCaptcha();
            setCaptchaId(data.captcha_id);
            setCaptchaImage(data.captcha_image);
        } catch (e) {
            message.error(t('loginPortal.messages.captchaFetchFailed'));
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
                const nextAppNameRaw = normalizeConfigValue(config.app_name);
                const nextLogoUrlRaw = normalizeConfigValue(config.logo_url);
                const nextFooterTextRaw = normalizeConfigValue(config.footer_text);
                const nextBrowserTitleRaw = normalizeConfigValue(config.browser_title);
                const nextFaviconRaw = normalizeConfigValue(config.favicon_url);

                const nextAppName = nextAppNameRaw || t('loginPortal.fallbackAppName');
                const nextLogoUrl = nextLogoUrlRaw || DEFAULT_LOGO_URL;
                const nextFooterText = nextFooterTextRaw || t('loginPortal.fallbackFooter');

                setAppName(nextAppName);
                setLogoUrl(nextLogoUrl);
                setFooterText(nextFooterText);

                if (nextAppNameRaw) localStorage.setItem('sys_app_name', nextAppNameRaw);
                else localStorage.removeItem('sys_app_name');

                if (nextLogoUrlRaw) localStorage.setItem('sys_logo_url', nextLogoUrlRaw);
                else localStorage.removeItem('sys_logo_url');

                if (nextFooterTextRaw) localStorage.setItem('sys_footer_text', nextFooterTextRaw);
                else localStorage.removeItem('sys_footer_text');

                document.title = nextBrowserTitleRaw || nextAppName;

                const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
                const finalFavicon = nextFaviconRaw || '/favicon.ico';
                if (link) {
                    link.href = finalFavicon;
                } else {
                    const newLink = document.createElement('link');
                    newLink.rel = 'icon';
                    newLink.href = finalFavicon;
                    document.head.appendChild(newLink);
                }
            } catch (error) {
                console.error("Failed to load system config:", error);
            }
        };
        fetchConfig();
    }, [t]);

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
                    throw new Error(t('loginPortal.messages.captchaLoading'));
                }
                if (normalizedCaptcha.length !== 4) {
                    throw new Error(t('loginPortal.messages.captchaLength'));
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
            message.success(t('loginPortal.messages.loginSuccess'));
            onLoginSuccess();
        } catch (err: any) {
            // MFA challenge required
            if (err instanceof MfaRequiredError) {
                setMfaToken(err.mfaToken);
                const methods = Array.isArray(err.mfaMethods) ? err.mfaMethods : [];
                setMfaMethods(methods);
                setMfaMode(methods.includes('totp') ? 'totp' : (methods.includes('email') ? 'email' : 'totp'));
                setMfaStep(true);
                setError('');
                return;
            }

            // Parse backend error response
            const detailPayload = err?.response?.data?.detail;
            const detail = typeof detailPayload === 'string'
                ? detailPayload
                : (detailPayload?.message || '');
            const detailCode = typeof detailPayload === 'object' && detailPayload?.code
                ? String(detailPayload.code)
                : '';
            let msg = err?.message || t('loginPortal.messages.loginFailedNetwork');
            const shouldShowCaptcha =
                err?.response?.status === 428 ||
                err?.response?.headers?.['x-requires-captcha'] === 'true' ||
                /captcha/i.test(`${detail} ${detailCode}`);

            if (shouldShowCaptcha) {
                setRequiresCaptcha(true);
                fetchCaptcha();
                setCaptchaCode('');
                if (/invalid|expired/i.test(String(detail))) {
                    msg = t('loginPortal.messages.captchaInvalid');
                } else if (/verification required/i.test(String(detail))) {
                    msg = t('loginPortal.messages.captchaRequired');
                } else {
                    msg = detail || t('loginPortal.messages.captchaPleaseInput');
                }
            } else if (detail.includes('locked')) {
                msg = t('loginPortal.messages.accountLocked');
            } else if (detail.includes('IP')) {
                msg = t('loginPortal.messages.ipForbidden');
            } else if (err?.response?.status === 403 && (/concurrent|session limit/i.test(String(detail)))) {
                msg = t('loginPortal.messages.concurrentExceeded');
            } else if (err?.response?.status === 401) {
                msg = t('loginPortal.messages.invalidCredentials');
            }

            setError(msg);
            message.error(msg);
        } finally {
            setIsLoading(false);
        }
    };

    const handleMfaSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        try {
            if (mfaMode === 'email' && mfaMethods.includes('email')) {
                await AuthService.verifyMfaEmail(mfaToken, totpCode);
            } else if (mfaMethods.includes('totp')) {
                await AuthService.verifyMfa(mfaToken, totpCode);
            } else {
                const msg = t('mfa.useSecurityKey', '使用安全密钥');
                setError(msg);
                message.error(msg);
                return;
            }
            if (rememberAccount && username.trim()) {
                localStorage.setItem(REMEMBERED_PORTAL_USERNAME_KEY, username.trim());
            }
            message.success(t('loginPortal.messages.loginSuccess'));
            // Force auth context to refresh
            window.location.reload();
        } catch (err: any) {
            const detailPayload = err?.response?.data?.detail;
            const detail = typeof detailPayload === 'string'
                ? detailPayload
                : (detailPayload?.message || '');
            const msg = detail || t('mfa.invalidCode', '验证码错误或已过期');
            setError(msg);
            message.error(msg);
            setTotpCode('');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSendMfaEmailCode = async () => {
        if (!mfaToken) return;
        setEmailCodeSending(true);
        try {
            await ApiClient.sendEmailMfaCode('portal', mfaToken);
            message.success(t('portalSecurity.emailMfa.messages.codeSentSuccess'));
        } catch (err: any) {
            const detailPayload = err?.response?.data?.detail;
            const detail = typeof detailPayload === 'string'
                ? detailPayload
                : (detailPayload?.message || '');
            message.error(detail || t('portalSecurity.emailMfa.messages.sendFailed'));
        } finally {
            setEmailCodeSending(false);
        }
    };

    const handleWebAuthnLogin = async () => {
        setWebauthnLoading(true);
        setError('');
        try {
            // Get authentication options from server
            const options = await ApiClient.getWebAuthnAuthOptions(mfaToken, 'portal');
            // Call browser WebAuthn API
            const assertion = await navigator.credentials.get({
                publicKey: {
                    ...options,
                    challenge: Uint8Array.from(atob(options.challenge.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
                    allowCredentials: (options.allowCredentials || []).map((c: any) => ({
                        ...c,
                        id: Uint8Array.from(atob(c.id.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
                    })),
                }
            }) as PublicKeyCredential | null;

            if (!assertion) {
                setWebauthnLoading(false);
                return;
            }

            const response = assertion.response as AuthenticatorAssertionResponse;
            const webauthnResponse = {
                id: assertion.id,
                rawId: btoa(String.fromCharCode(...new Uint8Array(assertion.rawId))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
                type: assertion.type,
                response: {
                    authenticatorData: btoa(String.fromCharCode(...new Uint8Array(response.authenticatorData))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
                    clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(response.clientDataJSON))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
                    signature: btoa(String.fromCharCode(...new Uint8Array(response.signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
                    userHandle: response.userHandle ? btoa(String.fromCharCode(...new Uint8Array(response.userHandle))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : null,
                },
            };

            await AuthService.verifyMfaWebAuthn(mfaToken, webauthnResponse);
            if (rememberAccount && username.trim()) {
                localStorage.setItem(REMEMBERED_PORTAL_USERNAME_KEY, username.trim());
            }
            message.success(t('loginPortal.messages.loginSuccess'));
            window.location.reload();
        } catch (err: any) {
            const detailPayload = err?.response?.data?.detail;
            const detail = typeof detailPayload === 'string'
                ? detailPayload
                : (detailPayload?.message || '');
            if (detail && !detail.includes('NO_WEBAUTHN_CREDENTIALS')) {
                const msg = detail || t('mfa.webauthnFailed', '安全密钥验证失败');
                setError(msg);
                message.error(msg);
            }
        } finally {
            setWebauthnLoading(false);
        }
    };

    // MFA verification step UI
    if (mfaStep) {
        return (
            <div className="min-h-screen bg-white relative flex flex-col">
                <header className="w-full max-w-7xl mx-auto p-6 flex justify-between items-center z-10">
                    <div className="flex items-center space-x-4">
                        <img src={logoUrl} alt="Logo" className="w-12 h-12 rounded-lg object-contain" />
                        <span className="text-2xl font-bold text-slate-800 tracking-tight">{appName}</span>
                    </div>
                    <LanguageSwitcher />
                </header>

                <main className="flex-1 flex items-center justify-center -mt-20 px-4">
                    <div className="max-w-sm w-full space-y-8">
                        <div className="text-center space-y-3">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 mb-2">
                                <ShieldCheck size={32} />
                            </div>
                            <h1 className="text-2xl font-bold text-slate-900">{t('mfa.title', '多因素认证')}</h1>
                            <p className="text-slate-500 text-sm">
                                {mfaMode === 'email'
                                    ? t('portalSecurity.emailMfa.codeSent', '验证码已发送到您的邮箱，请在 5 分钟内输入')
                                    : t('mfa.subtitle', '请输入您的验证器应用中的 6 位验证码')}
                            </p>
                        </div>

                        <form onSubmit={handleMfaSubmit} className="space-y-6 pt-4">
                            <div>
                                <input
                                    type="text"
                                    value={totpCode}
                                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    className="block w-full px-4 py-4 bg-slate-50 border border-transparent rounded-xl text-slate-900 text-2xl font-bold text-center tracking-[0.5em] placeholder:text-slate-300 placeholder:tracking-[0.3em] placeholder:text-base placeholder:font-medium focus:bg-white focus:border-blue-500/20 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                                    placeholder="000000"
                                    required
                                    maxLength={6}
                                    autoFocus
                                    autoComplete="one-time-code"
                                    inputMode="numeric"
                                />
                            </div>

                            {error && (
                                <div className="p-3 rounded-xl bg-rose-50 text-rose-600 text-xs font-bold text-center animate-in fade-in slide-in-from-top-1">
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isLoading || totpCode.length !== 6 || (!mfaMethods.includes('totp') && !mfaMethods.includes('email'))}
                                className="w-full flex items-center justify-center py-3.5 px-6 border border-transparent rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/20 transition-all shadow-lg shadow-blue-500/30 disabled:opacity-70 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
                            >
                                {isLoading ? <Loader2 size={18} className="animate-spin" /> : t('mfa.verify', '验证')}
                            </button>

                            <button
                                type="button"
                                onClick={() => { setMfaStep(false); setMfaToken(''); setMfaMethods([]); setMfaMode('totp'); setTotpCode(''); setError(''); }}
                                className="w-full text-center text-sm text-slate-500 hover:text-slate-700 font-medium"
                            >
                                {t('mfa.backToLogin', '返回登录')}
                            </button>

                            {mfaMethods.includes('email') && (
                                <button
                                    type="button"
                                    onClick={handleSendMfaEmailCode}
                                    disabled={emailCodeSending}
                                    className="w-full text-center text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-60"
                                >
                                    {emailCodeSending ? t('common.loading', '加载中...') : t('portalSecurity.emailMfa.sendCode', '发送验证码')}
                                </button>
                            )}

                            {mfaMethods.includes('totp') && mfaMethods.includes('email') && (
                                <button
                                    type="button"
                                    onClick={() => setMfaMode((prev) => (prev === 'totp' ? 'email' : 'totp'))}
                                    className="w-full text-center text-sm text-slate-500 hover:text-slate-700 font-medium"
                                >
                                    {mfaMode === 'totp'
                                        ? t('portalSecurity.emailMfa.title', '邮箱验证')
                                        : 'TOTP'}
                                </button>
                            )}

                            {/* WebAuthn divider and button */}
                            {mfaMethods.includes('webauthn') && (
                                <div className="relative py-2">
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="w-full border-t border-slate-200" />
                                    </div>
                                    <div className="relative flex justify-center text-xs">
                                        <span className="bg-white px-3 text-slate-400 font-medium">{t('mfa.orUse', '或使用')}</span>
                                    </div>
                                </div>
                            )}

                            {mfaMethods.includes('webauthn') && (
                                <button
                                    type="button"
                                    onClick={handleWebAuthnLogin}
                                    disabled={webauthnLoading}
                                    className="w-full flex items-center justify-center space-x-2 py-3.5 px-6 border border-purple-200 rounded-xl text-sm font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 focus:outline-none focus:ring-4 focus:ring-purple-500/20 transition-all disabled:opacity-70 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    {webauthnLoading ? <Loader2 size={18} className="animate-spin" /> : <><Fingerprint size={18} /><span>{t('mfa.useSecurityKey', '使用安全密钥')}</span></>}
                                </button>
                            )}
                        </form>
                    </div>
                </main>

                <footer className="py-6 text-center text-xs text-slate-400 font-medium tracking-wide mb-4">
                    {footerText}
                </footer>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white relative flex flex-col">
            {/* Top Bar */}
            <header className="w-full max-w-7xl mx-auto p-6 flex justify-between items-center z-10">
                <div className="flex items-center space-x-4">
                    <img src={logoUrl} alt="Logo" className="w-12 h-12 rounded-lg object-contain" />
                    <span className="text-2xl font-bold text-slate-800 tracking-tight">{appName}</span>
                </div>
                <LanguageSwitcher />
            </header>

            {/* Main Content */}
            <main className="flex-1 flex items-center justify-center -mt-20 px-4">
                <div className="max-w-sm w-full space-y-8">
                    {/* Headers */}
                    <div className="text-center space-y-2">
                        <h1 className="text-3xl font-bold text-slate-900">{t('loginPortal.title')}</h1>
                        <p className="text-slate-500 font-medium tracking-wide">{t('loginPortal.subtitle')}</p>
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
                                    placeholder={t('loginPortal.usernamePlaceholder')}
                                    required
                                />
                            </div>
                            <div>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="block w-full px-4 py-3.5 bg-slate-50 border border-transparent rounded-xl text-slate-900 text-sm font-medium placeholder:text-slate-400 focus:bg-white focus:border-blue-500/20 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                                    placeholder={t('loginPortal.passwordPlaceholder')}
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
                                    placeholder={t('loginPortal.captchaPlaceholder')}
                                    required
                                    maxLength={4}
                                />
                                <div
                                    className="h-[52px] min-w-[120px] bg-slate-100 rounded-xl overflow-hidden cursor-pointer hover:opacity-80 transition-opacity border border-slate-200"
                                    onClick={fetchCaptcha}
                                    title={t('loginPortal.captchaRefreshTitle')}
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
                                <label htmlFor="remember-account" className="ml-2 block text-sm text-slate-500 font-medium">{t('loginPortal.rememberAccount')}</label>
                            </div>
                            <div className="text-sm">
                                <a href="#" className="font-bold text-blue-600 hover:text-blue-700">{t('loginPortal.forgotPassword')}</a>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full flex items-center justify-center py-3.5 px-6 border border-transparent rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/20 transition-all shadow-lg shadow-blue-500/30 disabled:opacity-70 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
                        >
                            {isLoading ? <Loader2 size={18} className="animate-spin" /> : t('loginPortal.submit')}
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
