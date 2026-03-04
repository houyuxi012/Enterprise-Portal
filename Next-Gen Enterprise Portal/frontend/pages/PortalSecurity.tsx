import React, { useState, useEffect, useRef } from 'react';
import { App, Modal, Input, Form } from 'antd';
import { ShieldCheck, ShieldOff, Loader2, Copy, CheckCircle2, Lock, KeyRound, Mail, Key, Trash2, Plus, Fingerprint } from 'lucide-react';
import ApiClient from '../services/api';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';

const PortalSecurity: React.FC = () => {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const { user } = useAuth();

    const [loading, setLoading] = useState(true);
    const [totpEnabled, setTotpEnabled] = useState(false);

    // Password change state
    const [pwdForm] = Form.useForm();
    const [changingPwd, setChangingPwd] = useState(false);
    const isManagedExternally = ['ldap', 'ad', 'oidc'].includes(user?.auth_source || 'local');

    // Setup flow state
    const [setupStep, setSetupStep] = useState<'idle' | 'scanning' | 'verifying'>('idle');
    const [qrCode, setQrCode] = useState('');
    const [secret, setSecret] = useState('');
    const [verifyCode, setVerifyCode] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [secretCopied, setSecretCopied] = useState(false);

    // Email MFA state
    const [emailMfaEnabled, setEmailMfaEnabled] = useState(false);
    const [emailAddress, setEmailAddress] = useState('');
    const [hasEmail, setHasEmail] = useState(false);
    const [emailSetupStep, setEmailSetupStep] = useState<'idle' | 'verifying'>('idle');
    const [emailVerifyCode, setEmailVerifyCode] = useState('');
    const [emailVerifying, setEmailVerifying] = useState(false);
    const [emailSending, setEmailSending] = useState(false);
    const [emailDisableModalOpen, setEmailDisableModalOpen] = useState(false);
    const [emailDisabling, setEmailDisabling] = useState(false);
    const [emailDisablePassword, setEmailDisablePassword] = useState('');

    // Disable flow state
    const [disableModalOpen, setDisableModalOpen] = useState(false);
    const [disabling, setDisabling] = useState(false);
    const disablePasswordRef = useRef('');
    const disableTotpRef = useRef('');
    const [disablePasswordVal, setDisablePasswordVal] = useState('');
    const [disableTotpVal, setDisableTotpVal] = useState('');

    // WebAuthn state
    const [webauthnCredentials, setWebauthnCredentials] = useState<Array<{ id: number; name: string; created_at: string | null; transports: string[] | null }>>([]);
    const [webauthnRegistering, setWebauthnRegistering] = useState(false);
    const [webauthnNameModalOpen, setWebauthnNameModalOpen] = useState(false);
    const [webauthnKeyName, setWebauthnKeyName] = useState('');
    const [webauthnDeleteModalOpen, setWebauthnDeleteModalOpen] = useState(false);
    const [webauthnDeleteId, setWebauthnDeleteId] = useState<number | null>(null);
    const [webauthnDeletePassword, setWebauthnDeletePassword] = useState('');
    const [webauthnDeleting, setWebauthnDeleting] = useState(false);

    useEffect(() => {
        loadStatus();
    }, []);

    const loadStatus = async () => {
        setLoading(true);
        try {
            const [mfaStatus, emailStatus, webauthnStatus] = await Promise.all([
                ApiClient.getMfaStatus('portal'),
                ApiClient.getEmailMfaStatus('portal').catch(() => null),
                ApiClient.getWebAuthnStatus('portal').catch(() => null),
            ]);
            setTotpEnabled(mfaStatus.totp_enabled);
            if (emailStatus) {
                setEmailMfaEnabled(emailStatus.email_mfa_enabled);
                setEmailAddress(emailStatus.email || emailStatus.email_masked || user?.email || '');
                setHasEmail(emailStatus.has_email);
            }
            if (webauthnStatus) {
                setWebauthnCredentials(webauthnStatus.credentials);
            }
        } catch {
            // ignore
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordChange = async (values: any) => {
        if (values.newPassword !== values.confirmPassword) {
            message.error(t('changePasswordModal.messages.passwordMismatch', '两次密码不一致'));
            return;
        }
        setChangingPwd(true);
        try {
            await ApiClient.changeMyPassword({
                old_password: values.oldPassword,
                new_password: values.newPassword,
            });
            message.success(t('changePasswordModal.messages.changeSuccess', '密码修改成功'));
            pwdForm.resetFields();
        } catch (error: any) {
            const detail = error?.response?.data?.detail;
            const errorMsg = typeof detail === 'string' ? detail : detail?.message || t('changePasswordModal.messages.changeFailed', '密码修改失败');
            message.error(errorMsg);
        } finally {
            setChangingPwd(false);
        }
    };

    // Email MFA handlers
    const handleEnableEmailMfa = async () => {
        setEmailSending(true);
        try {
            await ApiClient.enableEmailMfa('portal');
            message.success(t('portalSecurity.emailMfa.messages.codeSentSuccess'));
            setEmailSetupStep('verifying');
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            message.error(detail?.message || t('portalSecurity.emailMfa.messages.sendFailed'));
        } finally {
            setEmailSending(false);
        }
    };

    const handleVerifyEmailMfa = async () => {
        if (emailVerifyCode.length !== 6) return;
        setEmailVerifying(true);
        try {
            await ApiClient.verifyEnableEmailMfa(emailVerifyCode, 'portal');
            message.success(t('portalSecurity.emailMfa.messages.enabled'));
            setEmailMfaEnabled(true);
            setEmailSetupStep('idle');
            setEmailVerifyCode('');
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            message.error(detail?.message || t('portalSecurity.emailMfa.messages.invalidCode'));
            setEmailVerifyCode('');
        } finally {
            setEmailVerifying(false);
        }
    };

    const handleDisableEmailMfa = async () => {
        if (!emailDisablePassword) {
            message.error(t('portalSecurity.emailMfa.messages.passwordRequired'));
            return;
        }
        setEmailDisabling(true);
        try {
            await ApiClient.disableEmailMfa(emailDisablePassword, 'portal');
            message.success(t('portalSecurity.emailMfa.messages.disabled'));
            setEmailMfaEnabled(false);
            setEmailDisableModalOpen(false);
            setEmailDisablePassword('');
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            message.error(detail?.message || t('portalSecurity.messages.actionFailed'));
        } finally {
            setEmailDisabling(false);
        }
    };

    const handleStartSetup = async () => {
        try {
            const data = await ApiClient.setupMfa('portal');
            setQrCode(data.qr_code);
            setSecret(data.secret);
            setSetupStep('scanning');
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            message.error(detail?.message || t('portalSecurity.messages.setupFailed'));
        }
    };

    const handleVerifySetup = async () => {
        if (verifyCode.length !== 6) return;
        setVerifying(true);
        try {
            await ApiClient.verifyMfaSetup(verifyCode, 'portal');
            message.success(t('mfa.bindSuccess', 'TOTP 验证器绑定成功'));
            setTotpEnabled(true);
            setSetupStep('idle');
            setQrCode('');
            setSecret('');
            setVerifyCode('');
            // If this was a forced MFA setup, clear the flag and reload
            if (localStorage.getItem('mfa_setup_required') === 'true') {
                localStorage.removeItem('mfa_setup_required');
                window.location.reload();
            }
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            message.error(detail?.message || t('mfa.invalidCode', '验证码错误'));
            setVerifyCode('');
        } finally {
            setVerifying(false);
        }
    };

    const handleDisableConfirm = async () => {
        const pwd = disablePasswordRef.current;
        const code = disableTotpRef.current;
        if (!pwd) {
            message.error(t('portalSecurity.messages.passwordRequired'));
            return;
        }
        if (!code || code.length !== 6) {
            message.error(t('portalSecurity.messages.codeRequired'));
            return;
        }
        setDisabling(true);
        try {
            await ApiClient.disableMfa(pwd, code, 'portal');
            message.success(t('mfa.unbindSuccess', 'TOTP 验证器已解绑'));
            setTotpEnabled(false);
            setDisableModalOpen(false);
            disablePasswordRef.current = '';
            disableTotpRef.current = '';
            setDisablePasswordVal('');
            setDisableTotpVal('');
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            message.error(detail?.message || t('portalSecurity.messages.actionFailed'));
        } finally {
            setDisabling(false);
        }
    };

    const copySecret = () => {
        navigator.clipboard.writeText(secret);
        setSecretCopied(true);
        setTimeout(() => setSecretCopied(false), 2000);
    };

    // WebAuthn handlers
    const handleWebAuthnRegister = async () => {
        setWebauthnRegistering(true);
        try {
            const options = await ApiClient.getWebAuthnRegisterOptions('portal');
            // Call browser WebAuthn API
            const credential = await navigator.credentials.create({
                publicKey: {
                    ...options,
                    challenge: Uint8Array.from(atob(options.challenge.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
                    user: {
                        ...options.user,
                        id: Uint8Array.from(atob(options.user.id.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
                    },
                    excludeCredentials: (options.excludeCredentials || []).map((c: any) => ({
                        ...c,
                        id: Uint8Array.from(atob(c.id.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
                    })),
                }
            }) as PublicKeyCredential | null;

            if (!credential) {
                message.info(t('portalSecurity.webauthn.cancelled', '操作已取消'));
                setWebauthnRegistering(false);
                return;
            }

            // Show name input modal
            setWebauthnKeyName('');
            setWebauthnNameModalOpen(true);

            // Store credential temporarily for submission after naming
            (window as any).__pendingWebAuthnCredential = credential;
        } catch (err: any) {
            console.error('WebAuthn registration error:', err);
            let errorMsg: string;
            if (err instanceof DOMException) {
                // Browser WebAuthn errors
                if (err.name === 'NotAllowedError') {
                    errorMsg = t('portalSecurity.webauthn.cancelled', '操作已取消');
                    message.info(errorMsg);
                    setWebauthnRegistering(false);
                    return;
                }
                errorMsg = `WebAuthn: ${err.message}`;
            } else {
                errorMsg = err?.response?.data?.detail?.message || err?.message || t('portalSecurity.webauthn.registerFailed', '注册安全密钥失败');
            }
            message.error(errorMsg);
            setWebauthnRegistering(false);
        }
    };

    const handleWebAuthnRegisterConfirm = async () => {
        const credential = (window as any).__pendingWebAuthnCredential as PublicKeyCredential;
        if (!credential) return;

        try {
            const response = credential.response as AuthenticatorAttestationResponse;
            const credentialData = {
                id: credential.id,
                rawId: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
                type: credential.type,
                response: {
                    attestationObject: btoa(String.fromCharCode(...new Uint8Array(response.attestationObject))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
                    clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(response.clientDataJSON))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
                    transports: response.getTransports?.() || [],
                },
            };

            await ApiClient.verifyWebAuthnRegister(credentialData, webauthnKeyName || 'Security Key', 'portal');
            message.success(t('portalSecurity.webauthn.registerSuccess', '安全密钥注册成功'));
            setWebauthnNameModalOpen(false);
            await loadStatus();
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            message.error(detail?.message || t('portalSecurity.webauthn.registerFailed', '注册安全密钥失败'));
        } finally {
            delete (window as any).__pendingWebAuthnCredential;
            setWebauthnRegistering(false);
        }
    };

    const handleWebAuthnDelete = async () => {
        if (!webauthnDeleteId || !webauthnDeletePassword) return;
        setWebauthnDeleting(true);
        try {
            await ApiClient.deleteWebAuthnCredential(webauthnDeleteId, webauthnDeletePassword, 'portal');
            message.success(t('portalSecurity.webauthn.deleteSuccess', '安全密钥已删除'));
            setWebauthnDeleteModalOpen(false);
            setWebauthnDeleteId(null);
            setWebauthnDeletePassword('');
            await loadStatus();
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            message.error(detail?.message || t('portalSecurity.messages.actionFailed'));
        } finally {
            setWebauthnDeleting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-32">
                <Loader2 size={24} className="animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-700 slide-in-from-bottom-8 pb-20">
            <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                    {t('navbar.profile.security', '安全设置')}
                </h1>
                <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm font-medium">
                    {t('portalSecurity.subtitle', '管理您的账户安全选项')}
                </p>
            </div>

            {/* Forced MFA Setup Banner */}
            {localStorage.getItem('mfa_setup_required') === 'true' && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex items-start space-x-3">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500 mt-0.5 shrink-0"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
                    <div>
                        <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
                            {t('portalSecurity.forcedMfaTitle', '系统要求绑定多因素认证')}
                        </p>
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                            {t('portalSecurity.forcedMfaDesc', '管理员已开启强制 MFA 认证，请先绑定 TOTP 验证器后方可使用系统。')}
                        </p>
                    </div>
                </div>
            )}

            {/* Password Change Section */}
            <div className="mica rounded-[2rem] p-8 shadow-lg border border-slate-200/50 dark:border-slate-700/50">
                <div className="flex items-start space-x-4 mb-6">
                    <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                        <KeyRound size={24} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                            {t('changePasswordModal.title', '修改密码')}
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            {t('portalSecurity.passwordSubtitle', '定期修改密码有助于保障账户安全')}
                        </p>
                    </div>
                </div>

                {isManagedExternally ? (
                    <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
                        <div className="bg-amber-100 dark:bg-amber-800 text-amber-600 dark:text-amber-400 p-1.5 rounded-full mt-0.5">
                            <Lock size={16} />
                        </div>
                        <div className="text-amber-800 dark:text-amber-300 text-sm leading-relaxed">
                            {t('changePasswordModal.messages.managedExternally', '该账户由目录服务管理，请在 AD/LDAP 中修改密码')}
                        </div>
                    </div>
                ) : (
                    <Form form={pwdForm} layout="vertical" onFinish={handlePasswordChange} requiredMark={false}>
                        <div className="grid md:grid-cols-3 gap-4">
                            <Form.Item
                                label={<span className="font-medium text-slate-700 dark:text-slate-300">{t('changePasswordModal.form.oldPassword', '当前密码')}</span>}
                                name="oldPassword"
                                rules={[{ required: true, message: t('changePasswordModal.validation.oldPasswordRequired', '请输入当前密码') }]}
                            >
                                <Input.Password
                                    prefix={<Lock size={16} className="text-slate-400 mr-1" />}
                                    placeholder={t('changePasswordModal.form.placeholders.oldPassword', '请输入当前密码')}
                                    className="rounded-lg"
                                />
                            </Form.Item>
                            <Form.Item
                                label={<span className="font-medium text-slate-700 dark:text-slate-300">{t('changePasswordModal.form.newPassword', '新密码')}</span>}
                                name="newPassword"
                                rules={[
                                    { required: true, message: t('changePasswordModal.validation.newPasswordRequired', '请输入新密码') },
                                    { min: 6, message: t('changePasswordModal.validation.newPasswordMin', '密码不少于6位') },
                                ]}
                            >
                                <Input.Password
                                    prefix={<Lock size={16} className="text-slate-400 mr-1" />}
                                    placeholder={t('changePasswordModal.form.placeholders.newPassword', '请输入新密码')}
                                    className="rounded-lg"
                                />
                            </Form.Item>
                            <Form.Item
                                label={<span className="font-medium text-slate-700 dark:text-slate-300">{t('changePasswordModal.form.confirmPassword', '确认新密码')}</span>}
                                name="confirmPassword"
                                rules={[{ required: true, message: t('changePasswordModal.validation.confirmPasswordRequired', '请确认新密码') }]}
                            >
                                <Input.Password
                                    prefix={<Lock size={16} className="text-slate-400 mr-1" />}
                                    placeholder={t('changePasswordModal.form.placeholders.confirmPassword', '再次输入新密码')}
                                    className="rounded-lg"
                                />
                            </Form.Item>
                        </div>
                        <div className="flex justify-end mt-2">
                            <button
                                type="submit"
                                disabled={changingPwd}
                                className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {changingPwd ? <Loader2 size={16} className="animate-spin mx-auto" /> : t('portalSecurity.changePasswordBtn', '修改密码')}
                            </button>
                        </div>
                    </Form>
                )}
            </div>

            {/* TOTP Section */}
            <div className="mica rounded-[2rem] p-8 shadow-lg border border-slate-200/50 dark:border-slate-700/50">
                <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4">
                        <div className={`flex items-center justify-center w-12 h-12 rounded-2xl ${totpEnabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                            <ShieldCheck size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                                TOTP {t('mfa.title', '多因素认证')}
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                {t('mfa.setupSubtitle', '使用 Google Authenticator、Microsoft Authenticator 或其他 TOTP 应用扫描二维码')}
                            </p>
                            <div className={`inline-flex items-center space-x-1.5 mt-3 px-3 py-1 rounded-full text-xs font-bold ${totpEnabled ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${totpEnabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                <span>{totpEnabled ? t('mfa.status.enabled', '已启用') : t('mfa.status.disabled', '未启用')}</span>
                            </div>
                        </div>
                    </div>
                    <div>
                        {!totpEnabled && setupStep === 'idle' && (
                            <button
                                onClick={handleStartSetup}
                                className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98]"
                            >
                                {t('mfa.setupTitle', '绑定验证器')}
                            </button>
                        )}
                        {totpEnabled && (
                            <button
                                onClick={() => {
                                    disablePasswordRef.current = '';
                                    disableTotpRef.current = '';
                                    setDisablePasswordVal('');
                                    setDisableTotpVal('');
                                    setDisableModalOpen(true);
                                }}
                                className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-bold hover:bg-rose-50 hover:text-rose-600 transition-all dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-rose-900/20 dark:hover:text-rose-400"
                            >
                                <span className="flex items-center space-x-2">
                                    <ShieldOff size={16} />
                                    <span>{t('mfa.unbindTitle', '解绑')}</span>
                                </span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Setup Flow */}
                {setupStep === 'scanning' && (
                    <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-800">
                        <div className="grid md:grid-cols-2 gap-8">
                            {/* QR Code */}
                            <div className="flex flex-col items-center space-y-4">
                                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                                    {t('mfa.scanQrCode', '扫描二维码')}
                                </h4>
                                <div className="p-4 bg-white rounded-2xl shadow-inner border border-slate-100">
                                    <img
                                        src={`data:image/png;base64,${qrCode}`}
                                        alt="TOTP QR Code"
                                        className="w-48 h-48"
                                    />
                                </div>
                                <div className="w-full max-w-xs">
                                    <p className="text-xs text-slate-400 text-center mb-2">
                                        {t('mfa.manualEntry', '手动输入密钥')}
                                    </p>
                                    <div className="flex items-center bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2 border border-slate-200 dark:border-slate-700">
                                        <code className="text-xs font-mono text-slate-600 dark:text-slate-300 flex-1 break-all select-all">
                                            {secret}
                                        </code>
                                        <button
                                            onClick={copySecret}
                                            className="ml-2 p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                        >
                                            {secretCopied ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Copy size={14} className="text-slate-400" />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Verify Code */}
                            <div className="flex flex-col items-center justify-center space-y-4">
                                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                                    {t('mfa.enterCode', '输入验证码')}
                                </h4>
                                <p className="text-xs text-slate-400 text-center max-w-xs">
                                    {t('mfa.subtitle', '请输入您的验证器应用中的 6 位验证码')}
                                </p>
                                <input
                                    type="text"
                                    value={verifyCode}
                                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    className="w-48 px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-2xl font-bold text-center tracking-[0.5em] placeholder:text-slate-300 placeholder:text-base placeholder:font-medium placeholder:tracking-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                    placeholder="000000"
                                    maxLength={6}
                                    autoFocus
                                    autoComplete="one-time-code"
                                    inputMode="numeric"
                                />
                                <div className="flex space-x-3 w-full max-w-xs">
                                    <button
                                        onClick={() => { setSetupStep('idle'); setQrCode(''); setSecret(''); setVerifyCode(''); }}
                                        className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-bold hover:bg-slate-200 transition-all dark:bg-slate-800 dark:text-slate-400"
                                    >
                                        {t('common.cancel', '取消')}
                                    </button>
                                    <button
                                        onClick={handleVerifySetup}
                                        disabled={verifying || verifyCode.length !== 6}
                                        className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {verifying ? <Loader2 size={16} className="animate-spin mx-auto" /> : t('mfa.verify', '验证')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Email MFA Section */}
            <div className="mica rounded-[2rem] p-8 shadow-lg border border-slate-200/50 dark:border-slate-700/50">
                <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4">
                        <div className={`flex items-center justify-center w-12 h-12 rounded-2xl ${emailMfaEnabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                            <Mail size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                                {t('portalSecurity.emailMfa.title', '邮箱验证')}
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                {t('portalSecurity.emailMfa.subtitle', '登录时通过邮箱接收一次性验证码进行身份验证')}
                            </p>
                            {hasEmail && emailAddress && (
                                <p className="text-xs text-slate-400 mt-1">
                                    {t('portalSecurity.emailMfa.boundEmail', '绑定邮箱')}：{emailAddress}
                                </p>
                            )}
                            <div className={`inline-flex items-center space-x-1.5 mt-3 px-3 py-1 rounded-full text-xs font-bold ${emailMfaEnabled ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${emailMfaEnabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                <span>{emailMfaEnabled ? t('mfa.status.enabled', '已启用') : t('mfa.status.disabled', '未启用')}</span>
                            </div>
                        </div>
                    </div>
                    <div>
                        {!emailMfaEnabled && emailSetupStep === 'idle' && (
                            <button
                                onClick={handleEnableEmailMfa}
                                disabled={emailSending || !hasEmail}
                                className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {emailSending ? <Loader2 size={16} className="animate-spin" /> : t('portalSecurity.emailMfa.enable', '开启验证')}
                            </button>
                        )}
                        {emailMfaEnabled && (
                            <button
                                onClick={() => { setEmailDisablePassword(''); setEmailDisableModalOpen(true); }}
                                className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-bold hover:bg-rose-50 hover:text-rose-600 transition-all dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-rose-900/20 dark:hover:text-rose-400"
                            >
                                <span className="flex items-center space-x-2">
                                    <ShieldOff size={16} />
                                    <span>{t('portalSecurity.emailMfa.disable', '关闭')}</span>
                                </span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Email verify step */}
                {emailSetupStep === 'verifying' && (
                    <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex flex-col items-center space-y-4">
                            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                                {t('portalSecurity.emailMfa.enterCode', '输入邮箱验证码')}
                            </h4>
                            <p className="text-xs text-slate-400 text-center max-w-xs">
                                {t('portalSecurity.emailMfa.codeSent', '验证码已发送到您的邮箱，请在 5 分钟内输入')}
                            </p>
                            <input
                                type="text"
                                value={emailVerifyCode}
                                onChange={(e) => setEmailVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                className="w-48 px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-2xl font-bold text-center tracking-[0.5em] placeholder:text-slate-300 placeholder:text-base placeholder:font-medium placeholder:tracking-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                placeholder="000000"
                                maxLength={6}
                                autoFocus
                                inputMode="numeric"
                            />
                            <div className="flex space-x-3 w-full max-w-xs">
                                <button
                                    onClick={() => { setEmailSetupStep('idle'); setEmailVerifyCode(''); }}
                                    className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-bold hover:bg-slate-200 transition-all dark:bg-slate-800 dark:text-slate-400"
                                >
                                    {t('common.cancel', '取消')}
                                </button>
                                <button
                                    onClick={handleVerifyEmailMfa}
                                    disabled={emailVerifying || emailVerifyCode.length !== 6}
                                    className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {emailVerifying ? <Loader2 size={16} className="animate-spin mx-auto" /> : t('mfa.verify', '验证')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {!hasEmail && (
                    <div className="mt-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300">
                        {t('portalSecurity.emailMfa.noEmail', '您的账户尚未绑定邮箱，请联系管理员在用户管理中设置邮箱后再开启此功能。')}
                    </div>
                )}
            </div>

            {/* WebAuthn Hardware Security Key Section */}
            <div className="mica rounded-[2rem] p-8 shadow-lg border border-slate-200/50 dark:border-slate-700/50">
                <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4">
                        <div className={`flex items-center justify-center w-12 h-12 rounded-2xl ${webauthnCredentials.length > 0 ? 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400' : 'bg-slate-100 text-slate-400'}`}>
                            <Fingerprint size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                                {t('portalSecurity.webauthn.title', '硬件安全密钥')}
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                {t('portalSecurity.webauthn.subtitle', '使用 FIDO2/WebAuthn 兼容的硬件安全密钥（如 YubiKey）或平台认证器（Touch ID / Windows Hello）')}
                            </p>
                            <div className={`inline-flex items-center space-x-1.5 mt-3 px-3 py-1 rounded-full text-xs font-bold ${webauthnCredentials.length > 0 ? 'bg-purple-50 text-purple-600 dark:bg-purple-900/20' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${webauthnCredentials.length > 0 ? 'bg-purple-500' : 'bg-slate-400'}`} />
                                <span>
                                    {webauthnCredentials.length > 0
                                        ? t('portalSecurity.webauthn.keyCount', '已注册 {{count}} 个密钥', { count: webauthnCredentials.length })
                                        : t('mfa.status.disabled', '未启用')}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div>
                        <button
                            onClick={handleWebAuthnRegister}
                            disabled={webauthnRegistering}
                            className="px-5 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-bold hover:bg-purple-700 transition-all shadow-lg shadow-purple-500/20 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {webauthnRegistering
                                ? <Loader2 size={16} className="animate-spin" />
                                : <span className="flex items-center space-x-2"><Plus size={16} /><span>{t('portalSecurity.webauthn.addKey', '添加安全密钥')}</span></span>}
                        </button>
                    </div>
                </div>

                {/* Registered keys list */}
                {webauthnCredentials.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 space-y-3">
                        {webauthnCredentials.map((cred) => (
                            <div key={cred.id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 rounded-xl px-4 py-3 border border-slate-200/50 dark:border-slate-700/50">
                                <div className="flex items-center space-x-3">
                                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                                        <Key size={16} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{cred.name}</p>
                                        <p className="text-xs text-slate-400">
                                            {cred.created_at ? new Date(cred.created_at).toLocaleDateString() : '-'}
                                            {cred.transports && cred.transports.length > 0 && (
                                                <span className="ml-2 text-slate-300 dark:text-slate-600">
                                                    {cred.transports.join(', ')}
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        setWebauthnDeleteId(cred.id);
                                        setWebauthnDeletePassword('');
                                        setWebauthnDeleteModalOpen(true);
                                    }}
                                    className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all"
                                    title={t('common.delete', '删除')}
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* WebAuthn Name Modal */}
            <Modal
                title={t('portalSecurity.webauthn.namingTitle', '为安全密钥命名')}
                open={webauthnNameModalOpen}
                onCancel={() => {
                    setWebauthnNameModalOpen(false);
                    delete (window as any).__pendingWebAuthnCredential;
                    setWebauthnRegistering(false);
                }}
                onOk={handleWebAuthnRegisterConfirm}
                okText={t('common.confirm', '确认')}
                cancelText={t('common.cancel', '取消')}
            >
                <div className="space-y-3 pt-2">
                    <p className="text-sm text-slate-500">{t('portalSecurity.webauthn.namingDesc', '给您的安全密钥起个名字，方便后续管理')}</p>
                    <Input
                        placeholder={t('portalSecurity.webauthn.namePlaceholder', '例如: 我的 YubiKey')}
                        value={webauthnKeyName}
                        onChange={(e) => setWebauthnKeyName(e.target.value)}
                        maxLength={128}
                        autoFocus
                    />
                </div>
            </Modal>

            {/* WebAuthn Delete Modal */}
            <Modal
                title={t('portalSecurity.webauthn.deleteTitle', '删除安全密钥')}
                open={webauthnDeleteModalOpen}
                onCancel={() => { if (!webauthnDeleting) setWebauthnDeleteModalOpen(false); }}
                onOk={handleWebAuthnDelete}
                confirmLoading={webauthnDeleting}
                okText={t('common.confirm', '确认删除')}
                cancelText={t('common.cancel', '取消')}
                okButtonProps={{ danger: true, disabled: !webauthnDeletePassword }}
            >
                <div className="space-y-4 pt-2">
                    <p className="text-sm text-slate-500">{t('portalSecurity.webauthn.deleteConfirm', '删除后该安全密钥将无法用于登录验证，确认删除？')}</p>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5">{t('mfa.unbindPassword', '账户密码')}</label>
                        <Input.Password
                            placeholder={t('changePasswordModal.form.placeholders.oldPassword')}
                            value={webauthnDeletePassword}
                            onChange={(e) => setWebauthnDeletePassword(e.target.value)}
                            autoFocus
                        />
                    </div>
                </div>
            </Modal>

            {/* Disable Email MFA Modal */}
            <Modal
                title={t('portalSecurity.emailMfa.disableTitle', '关闭邮箱验证')}
                open={emailDisableModalOpen}
                onCancel={() => { if (!emailDisabling) setEmailDisableModalOpen(false); }}
                onOk={handleDisableEmailMfa}
                confirmLoading={emailDisabling}
                okText={t('common.confirm', '确认关闭')}
                cancelText={t('common.cancel', '取消')}
                okButtonProps={{ danger: true, disabled: !emailDisablePassword }}
            >
                <div className="space-y-4 pt-2">
                    <p className="text-sm text-slate-500">{t('portalSecurity.emailMfa.disableConfirm', '关闭后登录将不再通过邮箱验证，确认关闭？')}</p>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5">{t('mfa.unbindPassword', '账户密码')}</label>
                        <Input.Password
                            placeholder={t('changePasswordModal.form.placeholders.oldPassword')}
                            value={emailDisablePassword}
                            onChange={(e) => setEmailDisablePassword(e.target.value)}
                            autoFocus
                        />
                    </div>
                </div>
            </Modal>

            {/* Disable MFA Modal */}
            <Modal
                title={t('mfa.unbindTitle', '解绑 TOTP 验证器')}
                open={disableModalOpen}
                onCancel={() => {
                    if (disabling) return;
                    setDisableModalOpen(false);
                }}
                onOk={handleDisableConfirm}
                confirmLoading={disabling}
                okText={t('common.confirm', '确认解绑')}
                cancelText={t('common.cancel', '取消')}
                okButtonProps={{ danger: true, disabled: disablePasswordVal.length === 0 || disableTotpVal.length !== 6 }}
            >
                <div className="space-y-4 pt-2">
                    <p className="text-sm text-slate-500">{t('mfa.unbindConfirm', '解绑后登录将不再需要验证码，确认解绑？')}</p>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5">{t('mfa.unbindPassword', '账户密码')}</label>
                        <Input.Password
                            placeholder={t('changePasswordModal.form.placeholders.oldPassword')}
                            value={disablePasswordVal}
                            onChange={(e) => {
                                setDisablePasswordVal(e.target.value);
                                disablePasswordRef.current = e.target.value;
                            }}
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5">{t('mfa.enterCode', '当前验证码')}</label>
                        <Input
                            placeholder={t('portalSecurity.placeholders.code6')}
                            maxLength={6}
                            value={disableTotpVal}
                            onChange={(e) => {
                                const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                                setDisableTotpVal(v);
                                disableTotpRef.current = v;
                            }}
                        />
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default PortalSecurity;
