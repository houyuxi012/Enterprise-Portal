import axios from 'axios';
import { API_BASE_URL as API_URL } from './apiBase';
import { getPreferredAuthPlane, setPreferredAuthPlane } from '@/shared/utils/authPlane';

export interface User {
    id: number;
    username: string;
    email: string | null;
    account_type?: 'PORTAL' | 'SYSTEM';
    name?: string;
    avatar?: string;
    locale?: 'zh-CN' | 'en-US' | null;
    auth_source?: string;
    roles: { id: number; code: string; name?: string; app_id?: string }[];
    permissions: string[];
    password_violates_policy?: boolean;
    password_change_required?: boolean;
}

interface AuthResponse {
    access_token: string;
    token_type: string;
    mfa_required?: boolean;
    mfa_token?: string;
    mfa_methods?: string[];
    mfa_setup_required?: boolean;
}

type ErrorCodeDetail = {
    code?: string;
};

type ErrorWithDetail = {
    response?: {
        data?: {
            detail?: string | ErrorCodeDetail;
        };
    };
};

export interface WebAuthnAssertionPayload {
    id: string;
    rawId: string;
    type: string;
    response: {
        authenticatorData: string;
        clientDataJSON: string;
        signature: string;
        userHandle?: string | null;
    };
}

export class MfaRequiredError extends Error {
    mfaToken: string;
    mfaMethods: string[];
    constructor(mfaToken: string, mfaMethods: string[] = []) {
        super('MFA verification required');
        this.name = 'MfaRequiredError';
        this.mfaToken = mfaToken;
        this.mfaMethods = mfaMethods;
    }
}

const resolveErrorCode = (error: unknown): string => {
    const detail = (error as ErrorWithDetail)?.response?.data?.detail;
    if (detail && typeof detail === 'object' && detail.code) {
        return String(detail.code).toUpperCase();
    }
    return '';
};

const resolveExtraHeaderValue = (
    extraHeaders: Record<string, string> | undefined,
    headerName: string,
): string => {
    if (!extraHeaders) {
        return '';
    }

    const matchedEntry = Object.entries(extraHeaders).find(
        ([key]) => key.toLowerCase() === headerName.toLowerCase(),
    );
    return String(matchedEntry?.[1] ?? '').trim();
};

const appendPrivacyConsentParams = (
    params: URLSearchParams,
    extraHeaders?: Record<string, string>,
): void => {
    const consentAccepted = resolveExtraHeaderValue(extraHeaders, 'X-Privacy-Consent-Accepted');
    if (!consentAccepted) {
        return;
    }

    params.set('privacy_consent_accepted', consentAccepted);

    const policyVersion = resolveExtraHeaderValue(extraHeaders, 'X-Privacy-Policy-Version');
    const policyHash = resolveExtraHeaderValue(extraHeaders, 'X-Privacy-Policy-Hash');
    const consentLocale = resolveExtraHeaderValue(extraHeaders, 'X-Privacy-Consent-Locale');

    if (policyVersion) {
        params.set('privacy_policy_version', policyVersion);
    }
    if (policyHash) {
        params.set('privacy_policy_hash', policyHash);
    }
    if (consentLocale) {
        params.set('privacy_consent_locale', consentLocale);
    }
};

class AuthService {
    async login(username: string, password: string, type: 'portal' | 'admin' = 'portal', extraHeaders?: Record<string, string>): Promise<User> {
        setPreferredAuthPlane(type);
        const params = new URLSearchParams();
        params.append('username', username);
        params.append('password', password);
        appendPrivacyConsentParams(params, extraHeaders);
        const captchaId = extraHeaders?.['X-Captcha-ID'] || extraHeaders?.['x-captcha-id'];
        const captchaCode = extraHeaders?.['X-Captcha-Code'] || extraHeaders?.['x-captcha-code'];
        if (captchaId) {
            params.append('client_id', captchaId);
        }
        if (captchaCode) {
            params.append('client_secret', captchaCode);
        }

        let response: { data: AuthResponse };

        if (type === 'admin') {
            response = await axios.post<AuthResponse>(`${API_URL}/iam/auth/admin/token`, params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    ...extraHeaders,
                },
                withCredentials: true
            });
        } else {
            const portalProvider = String(import.meta.env.VITE_PORTAL_AUTH_PROVIDER || 'ldap')
                .trim()
                .toLowerCase() || 'ldap';
            const portalParams = new URLSearchParams(params);
            portalParams.append('provider', portalProvider);

            try {
                response = await axios.post<AuthResponse>(`${API_URL}/portal/auth/token`, portalParams, {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        ...extraHeaders,
                    },
                    withCredentials: true
                });
            } catch (error: unknown) {
                const code = resolveErrorCode(error);
                const canFallbackToLocal = portalProvider !== 'local'
                    && ['DIRECTORY_NOT_CONFIGURED', 'LICENSE_REQUIRED', 'LDAP_RUNTIME_MISSING'].includes(code);
                if (!canFallbackToLocal) {
                    throw error;
                }

                response = await axios.post<AuthResponse>(`${API_URL}/iam/auth/portal/token`, params, {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        ...extraHeaders,
                    },
                    withCredentials: true
                });
            }
        }

        // Check for MFA challenge response
        if (response.data.mfa_required && response.data.mfa_token) {
            throw new MfaRequiredError(response.data.mfa_token, response.data.mfa_methods || []);
        }

        // If we get here, login was successful - cookie is set by backend
        if (response.data.mfa_setup_required) {
            localStorage.setItem('mfa_setup_required', 'true');
        } else {
            localStorage.removeItem('mfa_setup_required');
        }
        return this.getCurrentUser(type);
    }

    async verifyMfa(mfaToken: string, totpCode: string): Promise<User> {
        await axios.post(`${API_URL}/mfa/verify`, {
            mfa_token: mfaToken,
            totp_code: totpCode,
        }, {
            withCredentials: true,
        });
        // MFA verify succeeded, session cookie is now set
        return this.getCurrentUser();
    }

    async verifyMfaWebAuthn(mfaToken: string, webauthnResponse: WebAuthnAssertionPayload): Promise<User> {
        await axios.post(`${API_URL}/mfa/verify`, {
            mfa_token: mfaToken,
            webauthn_response: webauthnResponse,
        }, {
            withCredentials: true,
        });
        return this.getCurrentUser();
    }

    async verifyMfaEmail(mfaToken: string, emailCode: string): Promise<User> {
        await axios.post(`${API_URL}/mfa/verify`, {
            mfa_token: mfaToken,
            email_code: emailCode,
        }, {
            withCredentials: true,
        });
        return this.getCurrentUser();
    }

    async logout(redirectUrl: string = '/') {
        setPreferredAuthPlane(redirectUrl.startsWith('/admin') ? 'admin' : 'portal');
        try {
            await axios.post(`${API_URL}/iam/auth/logout`, {}, { withCredentials: true });
        } catch (e) {
            console.error("Logout failed", e);
        }
        window.location.href = redirectUrl;
    }

    async getCurrentUser(type?: 'portal' | 'admin'): Promise<User> {
        const runtimeType = type || getPreferredAuthPlane();

        const response = await axios.get<User>(`${API_URL}/iam/auth/me`, {
            withCredentials: true,
            params: { audience: runtimeType }
        });
        return response.data;
    }

    isAuthenticated() {
        return false;
    }
}

export default new AuthService();
