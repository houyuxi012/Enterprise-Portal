import React from 'react';
import { Fingerprint, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AdminMfaChallengeProps {
  systemConfig: Record<string, string>;
  mfaMode: 'totp' | 'email';
  mfaMethods: string[];
  totpCode: string;
  error: string;
  isLoading: boolean;
  webauthnLoading: boolean;
  emailCodeSending: boolean;
  onTotpCodeChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
  onSendEmailCode: () => void;
  onToggleMode: () => void;
  onWebAuthnLogin: () => void;
}

const AdminMfaChallenge: React.FC<AdminMfaChallengeProps> = ({
  systemConfig,
  mfaMode,
  mfaMethods,
  totpCode,
  error,
  isLoading,
  webauthnLoading,
  emailCodeSending,
  onTotpCodeChange,
  onSubmit,
  onBack,
  onSendEmailCode,
  onToggleMode,
  onWebAuthnLogin,
}) => {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-900">
      <div className="hidden lg:flex lg:w-1/2 bg-[#0A1A3B] relative flex-col justify-between p-16 overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-3xl" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-3xl" />
        <div className="relative z-10">
          <div className="flex items-center space-x-3 mb-12">
            <img src={systemConfig.logo_url || '/images/logo.png'} className="w-10 h-10 rounded-xl object-cover shadow-lg shadow-blue-500/50" alt="Logo" />
            <span className="text-white font-bold text-xl tracking-wide">{systemConfig.app_name || t('loginAdmin.fallbackAppName')}</span>
          </div>
          <h1 className="text-5xl font-black text-white leading-tight tracking-tight mb-8">
            Security<br />
            <span className="text-blue-400">Verification</span>
          </h1>
        </div>
        <div className="relative z-10" />
      </div>
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="max-w-md w-full">
          <div className="mb-10 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 mb-4">
              <ShieldCheck size={32} />
            </div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">{t('mfa.title', '多因素认证')}</h2>
            <p className="text-slate-500 text-sm">
              {mfaMode === 'email'
                ? t('portalSecurity.emailMfa.codeSent', '验证码已发送到您的邮箱，请在 5 分钟内输入')
                : t('mfa.subtitle', '请输入您的验证器应用中的 6 位验证码')}
            </p>
          </div>
          <form onSubmit={onSubmit} className="space-y-6">
            <div>
              <input
                type="text"
                value={totpCode}
                onChange={(e) => onTotpCodeChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="block w-full px-4 py-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-2xl font-bold text-center tracking-[0.5em] placeholder:text-slate-300 placeholder:tracking-[0.3em] placeholder:text-base placeholder:font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                placeholder="000000"
                required
                maxLength={6}
                autoFocus
                autoComplete="one-time-code"
                inputMode="numeric"
              />
            </div>
            {error && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold text-center">{error}</div>
            )}
            <button
              type="submit"
              disabled={isLoading || totpCode.length !== 6 || (!mfaMethods.includes('totp') && !mfaMethods.includes('email'))}
              className="w-full flex items-center justify-center py-4 px-6 border border-transparent rounded-2xl text-sm font-black text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-xl shadow-blue-500/20 transition-all disabled:opacity-70 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
            >
              {isLoading ? <Loader2 size={20} className="animate-spin" /> : t('mfa.verify', '验证')}
            </button>
            <button
              type="button"
              onClick={onBack}
              className="w-full text-center text-sm text-slate-500 hover:text-slate-700 font-medium"
            >
              {t('mfa.backToLogin', '返回登录')}
            </button>

            {mfaMethods.includes('email') && (
              <button
                type="button"
                onClick={onSendEmailCode}
                disabled={emailCodeSending}
                className="w-full text-center text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-60"
              >
                {emailCodeSending ? t('common.loading', '加载中...') : t('portalSecurity.emailMfa.sendCode', '发送验证码')}
              </button>
            )}

            {mfaMethods.includes('totp') && mfaMethods.includes('email') && (
              <button
                type="button"
                onClick={onToggleMode}
                className="w-full text-center text-sm text-slate-500 hover:text-slate-700 font-medium"
              >
                {mfaMode === 'totp'
                  ? t('portalSecurity.emailMfa.title', '邮箱验证')
                  : 'TOTP'}
              </button>
            )}

            {mfaMethods.includes('webauthn') && (
              <button
                type="button"
                onClick={onWebAuthnLogin}
                disabled={webauthnLoading}
                className="w-full flex items-center justify-center space-x-2 py-3.5 px-6 border border-purple-200 rounded-xl text-sm font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 focus:outline-none focus:ring-4 focus:ring-purple-500/20 transition-all disabled:opacity-70 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
              >
                {webauthnLoading ? <Loader2 size={18} className="animate-spin" /> : <><Fingerprint size={18} /><span>{t('mfa.useSecurityKey', '使用安全密钥')}</span></>}
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

export default AdminMfaChallenge;
