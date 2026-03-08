const normalizeConfigValue = (value?: string | null): string => String(value ?? '').trim();
type PrivacyConsentScope = 'portal' | 'admin';

type StoredPrivacyConsent = {
    accepted: boolean;
    policyHash?: string;
};

const getPrivacyConsentStorageKey = (scope: PrivacyConsentScope): string => `${scope}_privacy_consent`;

const readStoredPrivacyConsent = (
    scope: PrivacyConsentScope,
): StoredPrivacyConsent | null => {
    if (typeof window === 'undefined') {
        return null;
    }

    const rawValue = window.localStorage.getItem(getPrivacyConsentStorageKey(scope));
    if (!rawValue) {
        return null;
    }

    try {
        const parsedValue = JSON.parse(rawValue) as StoredPrivacyConsent | boolean | null;
        if (typeof parsedValue === 'boolean') {
            return { accepted: parsedValue };
        }
        if (!parsedValue || typeof parsedValue !== 'object') {
            return null;
        }
        return {
            accepted: Boolean(parsedValue.accepted),
            policyHash: normalizeConfigValue(parsedValue.policyHash),
        };
    } catch {
        if (rawValue === 'true' || rawValue === 'false') {
            return { accepted: rawValue === 'true' };
        }
        return null;
    }
};

export const isPrivacyConsentRequired = (config: Record<string, string> | undefined): boolean => {
    const policyText = normalizeConfigValue(config?.privacy_policy);
    const policyHash = normalizeConfigValue(config?.privacy_policy_hash);
    const policyRequired = normalizeConfigValue(config?.privacy_policy_required).toLowerCase() !== 'false';
    return policyRequired && Boolean(policyText) && Boolean(policyHash);
};

export const buildPrivacyConsentHeaders = (
    config: Record<string, string> | undefined,
    locale: string,
    accepted: boolean,
): Record<string, string> => {
    if (!accepted) {
        return {};
    }

    const policyText = normalizeConfigValue(config?.privacy_policy);
    const policyHash = normalizeConfigValue(config?.privacy_policy_hash);
    if (!policyText || !policyHash) {
        return {};
    }

    return {
        'X-Privacy-Consent-Accepted': 'true',
        'X-Privacy-Policy-Version': normalizeConfigValue(config?.privacy_policy_version) || 'v1',
        'X-Privacy-Policy-Hash': policyHash,
        'X-Privacy-Consent-Locale': normalizeConfigValue(locale) || 'zh-CN',
    };
};

const getStoredPrivacyConsent = (
    scope: PrivacyConsentScope,
    config: Record<string, string> | undefined,
): boolean => {
    const policyHash = normalizeConfigValue(config?.privacy_policy_hash);
    if (!policyHash) {
        return false;
    }

    const storedValue = readStoredPrivacyConsent(scope);
    if (!storedValue) {
        return false;
    }
    return Boolean(storedValue.accepted) && normalizeConfigValue(storedValue.policyHash) === policyHash;
};

const getCachedPrivacyConsent = (scope: PrivacyConsentScope): boolean => {
    const storedValue = readStoredPrivacyConsent(scope);
    return Boolean(storedValue?.accepted);
};

const persistPrivacyConsent = (
    scope: PrivacyConsentScope,
    config: Record<string, string> | undefined,
    accepted: boolean,
): void => {
    if (typeof window === 'undefined') {
        return;
    }

    const policyHash = normalizeConfigValue(config?.privacy_policy_hash);
    if (!accepted || !policyHash) {
        window.localStorage.removeItem(getPrivacyConsentStorageKey(scope));
        return;
    }

    const value: StoredPrivacyConsent = {
        accepted: true,
        policyHash,
    };
    window.localStorage.setItem(getPrivacyConsentStorageKey(scope), JSON.stringify(value));
};

const clearStoredPrivacyConsent = (scope: PrivacyConsentScope): void => {
    if (typeof window === 'undefined') {
        return;
    }
    window.localStorage.removeItem(getPrivacyConsentStorageKey(scope));
};

export const getStoredPortalPrivacyConsent = (
    config: Record<string, string> | undefined,
): boolean => getStoredPrivacyConsent('portal', config);

export const getCachedPortalPrivacyConsent = (): boolean => getCachedPrivacyConsent('portal');

export const persistPortalPrivacyConsent = (
    config: Record<string, string> | undefined,
    accepted: boolean,
): void => persistPrivacyConsent('portal', config, accepted);

export const clearStoredPortalPrivacyConsent = (): void => clearStoredPrivacyConsent('portal');

export const getStoredAdminPrivacyConsent = (
    config: Record<string, string> | undefined,
): boolean => getStoredPrivacyConsent('admin', config);

export const getCachedAdminPrivacyConsent = (): boolean => getCachedPrivacyConsent('admin');

export const persistAdminPrivacyConsent = (
    config: Record<string, string> | undefined,
    accepted: boolean,
): void => persistPrivacyConsent('admin', config, accepted);

export const clearStoredAdminPrivacyConsent = (): void => clearStoredPrivacyConsent('admin');
