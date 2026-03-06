const normalizeConfigValue = (value?: string | null): string => String(value ?? '').trim();

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
