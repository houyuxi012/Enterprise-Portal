import React, { Suspense, lazy, useState } from 'react';
import App from 'antd/es/app';
import { Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import AuthService, { MfaRequiredError } from '@/services/auth';
import ApiClient, { type WebAuthnCredentialDescriptor } from '@/services/api';
import { hasAdminAccess } from '@/shared/utils/adminAccess';
import LanguageSwitcher from '@/shared/components/LanguageSwitcher';
import {
    buildPrivacyConsentHeaders,
    getCachedAdminPrivacyConsent,
    clearStoredAdminPrivacyConsent,
    getStoredAdminPrivacyConsent,
    isPrivacyConsentRequired,
    persistAdminPrivacyConsent,
} from '@/shared/utils/privacyConsent';
import { useTranslation } from 'react-i18next';

const ForgotPasswordModal = lazy(() => import('@/shared/components/ForgotPasswordModal'));
const AdminMfaChallenge = lazy(() => import('@/modules/admin/components/auth/AdminMfaChallenge'));
const AdminPrivacyPolicyModal = lazy(() => import('@/modules/admin/components/auth/AdminPrivacyPolicyModal'));

interface AdminLoginProps {
    onLoginSuccess: () => void;
}

type ErrorDetailPayload = string | { message?: string; code?: string };
type ErrorShape = {
    message?: string;
    response?: {
        status?: number;
        headers?: Record<string, string | undefined>;
        data?: {
            detail?: ErrorDetailPayload;
        };
    };
};

const parseError = (error: unknown) => {
    const normalized = (error as ErrorShape) || {};
    const detailPayload = normalized.response?.data?.detail;
    const detail = typeof detailPayload === 'string'
        ? detailPayload
        : (detailPayload?.message || '');
    const detailCode = typeof detailPayload === 'object' && detailPayload?.code
        ? String(detailPayload.code)
        : '';
    return {
        detail,
        detailCode,
        status: normalized.response?.status,
        requiresCaptchaHeader: normalized.response?.headers?.['x-requires-captcha'] === 'true',
        message: normalized.message || '',
    };
};

const AdminLogin: React.FC<AdminLoginProps> = ({ onLoginSuccess }) => {
    const { t, i18n } = useTranslation();
    const { login, logout, refreshCurrentUser } = useAuth();
    const { message } = App.useApp();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [systemConfig, setSystemConfig] = useState<Record<string, string>>({});
    const [systemConfigLoaded, setSystemConfigLoaded] = useState(false);
    const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
    const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
    const [passwordResetToken, setPasswordResetToken] = useState<string | null>(null);
    const [privacyAccepted, setPrivacyAccepted] = useState(() => getCachedAdminPrivacyConsent());

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
                setPrivacyAccepted(getStoredAdminPrivacyConsent(config));
            } catch (e) {
                console.error("Failed to load system config", e);
            } finally {
                setSystemConfigLoaded(true);
            }
        };
        fetchConfig();
    }, []);

    React.useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const resetToken = params.get('reset_token');
        const audience = params.get('audience');
        if (!resetToken || (audience && audience !== 'admin')) {
            return;
        }
        setPasswordResetToken(resetToken);
        setIsForgotPasswordOpen(true);
    }, []);

    React.useEffect(() => {
        if (!systemConfigLoaded) {
            return;
        }
        persistAdminPrivacyConsent(systemConfig, privacyAccepted);
    }, [privacyAccepted, systemConfig, systemConfigLoaded]);

    const shouldRequirePrivacyConsent = isPrivacyConsentRequired(systemConfig);

    const clearPasswordResetParams = React.useCallback(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete('reset_token');
        url.searchParams.delete('audience');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }, []);

    const handleCloseForgotPassword = React.useCallback(() => {
        if (passwordResetToken) {
            clearPasswordResetParams();
            setPasswordResetToken(null);
        }
        setIsForgotPasswordOpen(false);
    }, [clearPasswordResetParams, passwordResetToken]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            if (shouldRequirePrivacyConsent && !privacyAccepted) {
                throw new Error(t('loginAdmin.privacyConsentRequired', '请先阅读并同意隐私政策'));
            }
            const headers: Record<string, string> = buildPrivacyConsentHeaders(
                systemConfig,
                i18n.language,
                privacyAccepted,
            );
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
        } catch (err: unknown) {
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
            const { detail, detailCode, status, requiresCaptchaHeader, message: errMessage } = parseError(err);
            let msg = errMessage || t('loginAdmin.messages.loginFailedNetwork');
            const isPrivacyConsentError = detailCode === 'PRIVACY_CONSENT_REQUIRED' || detailCode === 'PRIVACY_POLICY_STALE';
            const shouldShowCaptcha =
                (!isPrivacyConsentError && status === 428) ||
                requiresCaptchaHeader ||
                /captcha/i.test(`${detail} ${detailCode}`);

            if (detailCode === 'PRIVACY_CONSENT_REQUIRED') {
                setPrivacyAccepted(false);
                clearStoredAdminPrivacyConsent();
                msg = t('loginAdmin.privacyConsentRequired', '请先阅读并同意隐私政策');
            } else if (detailCode === 'PRIVACY_POLICY_STALE') {
                setPrivacyAccepted(false);
                clearStoredAdminPrivacyConsent();
                msg = t('loginAdmin.messages.privacyPolicyUpdated', '隐私政策已更新，请刷新页面后重新阅读并同意');
            } else if (shouldShowCaptcha) {
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
            } else if (status === 403 && (/concurrent|session limit/i.test(String(detail)))) {
                msg = t('loginAdmin.messages.concurrentExceeded');
            } else if (status === 401) {
                msg = t('loginAdmin.messages.invalidCredentials');
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
            const currentUser = await refreshCurrentUser();
            if (!currentUser) {
                throw new Error(t('loginAdmin.messages.loginFailedNetwork'));
            }
            message.success(t('loginAdmin.messages.loginSuccess'));
            onLoginSuccess();
        } catch (err: unknown) {
            const { detail } = parseError(err);
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
            await ApiClient.sendEmailMfaCode('admin', mfaToken);
            message.success(t('portalSecurity.emailMfa.messages.codeSentSuccess'));
        } catch (err: unknown) {
            const { detail } = parseError(err);
            message.error(detail || t('portalSecurity.emailMfa.messages.sendFailed'));
        } finally {
            setEmailCodeSending(false);
        }
    };

    const handleWebAuthnLogin = async () => {
        setWebauthnLoading(true);
        setError('');
        try {
            const options = await ApiClient.getWebAuthnAuthOptions(mfaToken, 'admin');
            const assertion = await navigator.credentials.get({
                publicKey: {
                    ...options,
                    challenge: Uint8Array.from(atob(options.challenge.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
                    allowCredentials: (options.allowCredentials || []).map((credential: WebAuthnCredentialDescriptor) => ({
                        ...credential,
                        type: credential.type as PublicKeyCredentialType,
                        transports: credential.transports as AuthenticatorTransport[] | undefined,
                        id: Uint8Array.from(
                            atob(credential.id.replace(/-/g, '+').replace(/_/g, '/')),
                            (char) => char.charCodeAt(0),
                        ),
                    })),
                }
            }) as PublicKeyCredential | null;

            if (!assertion) {
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
            const currentUser = await refreshCurrentUser();
            if (!currentUser) {
                throw new Error(t('loginAdmin.messages.loginFailedNetwork'));
            }
            message.success(t('loginAdmin.messages.loginSuccess'));
            onLoginSuccess();
        } catch (err: unknown) {
            const { detail } = parseError(err);
            const msg = detail || t('mfa.webauthnFailed', '安全密钥验证失败');
            setError(msg);
            message.error(msg);
        } finally {
            setWebauthnLoading(false);
        }
    };

    // MFA verification step UI
    if (mfaStep) {
        return (
            <Suspense fallback={null}>
                <AdminMfaChallenge
                    systemConfig={systemConfig}
                    mfaMode={mfaMode}
                    mfaMethods={mfaMethods}
                    totpCode={totpCode}
                    error={error}
                    isLoading={isLoading}
                    webauthnLoading={webauthnLoading}
                    emailCodeSending={emailCodeSending}
                    onTotpCodeChange={setTotpCode}
                    onSubmit={handleMfaSubmit}
                    onBack={() => {
                        setMfaStep(false);
                        setMfaToken('');
                        setMfaMethods([]);
                        setMfaMode('totp');
                        setTotpCode('');
                        setError('');
                    }}
                    onSendEmailCode={handleSendMfaEmailCode}
                    onToggleMode={() => setMfaMode((prev) => (prev === 'totp' ? 'email' : 'totp'))}
                    onWebAuthnLogin={handleWebAuthnLogin}
                />
            </Suspense>
        );
    }

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
                        {t('loginAdmin.heroTitleLine1')}<br />
                        <span className="text-blue-400">{t('loginAdmin.heroTitleLine2')}</span><br />
                        {t('loginAdmin.heroTitleLine3')}
                    </h1>

                    <p className="text-slate-400 text-lg leading-relaxed max-w-md">
                        {t('loginAdmin.heroDescription')}
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
                                <a
                                    href="#"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setPasswordResetToken(null);
                                        setIsForgotPasswordOpen(true);
                                    }}
                                    className="text-xs font-bold text-blue-600 hover:text-blue-700"
                                >
                                    {t('loginAdmin.forgotPassword')}
                                </a>
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

                        <div className="flex items-start gap-2 text-xs text-slate-500">
                            <input
                                id="privacy-consent-admin"
                                type="checkbox"
                                checked={privacyAccepted}
                                onChange={(e) => setPrivacyAccepted(e.target.checked)}
                                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <label htmlFor="privacy-consent-admin" className="leading-5">
                                {t('loginAdmin.privacyConsentLabel', '阅读并同意')}
                                <a
                                    href="#"
                                    onClick={(e) => { e.preventDefault(); setIsPrivacyOpen(true); }}
                                    className="mx-1 text-blue-600 hover:text-blue-700"
                                >
                                    {t('loginAdmin.privacyPolicy')}
                                </a>
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
                                    <span className="mr-2">{t('loginAdmin.submit')}</span>
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-12 flex items-center text-[10px] text-slate-300 font-medium uppercase tracking-widest">
                        <div className="flex items-center space-x-1">
                            <span>{t('loginAdmin.footer')}</span>
                        </div>
                    </div>

                </div>
            </div>

            {isPrivacyOpen ? (
                <Suspense fallback={null}>
                    <AdminPrivacyPolicyModal
                        open={isPrivacyOpen}
                        systemConfig={systemConfig}
                        onClose={() => setIsPrivacyOpen(false)}
                    />
                </Suspense>
            ) : null}
            {isForgotPasswordOpen ? (
                <Suspense fallback={null}>
                    <ForgotPasswordModal
                        open={isForgotPasswordOpen}
                        audience="admin"
                        resetToken={passwordResetToken}
                        initialIdentifier={username}
                        onClose={handleCloseForgotPassword}
                    />
                </Suspense>
            ) : null}
        </div>
    );
};


// Start Icon Helper (since I used MailIcon above but didn't import distinct one, usually just Mail)
const MailIcon: React.FC<{ size?: number }> = ({ size }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
);


export default AdminLogin;
