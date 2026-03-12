import React, { Suspense, lazy, useEffect, useState } from 'react';
import App from 'antd/es/app';
import Form from 'antd/es/form';
import Space from 'antd/es/space';
import Tabs from 'antd/es/tabs';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import ApiClient from '@/services/api';
import { AppPageHeader } from '@/modules/admin/components/ui';

const PlatformDomainSection = lazy(() => import('@/modules/admin/components/platform-settings/PlatformDomainSection'));
const PlatformSslSection = lazy(() => import('@/modules/admin/components/platform-settings/PlatformSslSection'));
const PlatformSnmpSection = lazy(() => import('@/modules/admin/components/platform-settings/PlatformSnmpSection'));
const PlatformNtpSection = lazy(() => import('@/modules/admin/components/platform-settings/PlatformNtpSection'));

const PLATFORM_CONFIG_KEYS = [
    'platform_domain',
    'platform_public_base_url',
    'platform_admin_base_url',
    'platform_ssl_enabled',
    'platform_ssl_certificate',
    'platform_ssl_private_key',
    'platform_snmp_enabled',
    'platform_snmp_host',
    'platform_snmp_port',
    'platform_snmp_version',
    'platform_snmp_community',
    'platform_ntp_enabled',
    'platform_ntp_server',
    'platform_ntp_port',
    'platform_ntp_sync_interval_minutes',
    'platform_ntp_manual_time',
] as const;

const MASKED_VALUE = '__MASKED__';
type PlatformConfigKey = typeof PLATFORM_CONFIG_KEYS[number];
type PlatformConfigFieldValue = string | number | boolean | null | undefined | Dayjs;
type PlatformSettingsFormValues = Partial<Record<PlatformConfigKey, PlatformConfigFieldValue>>;
type PlatformApiError = {
    response?: {
        data?: {
            detail?: {
                message?: string;
            } | string;
        };
    };
};
type FormValidationError = {
    errorFields?: unknown[];
};

const normalizeBoolean = (value: unknown, fallback = false): boolean => {
    if (value === undefined || value === null || value === '') return fallback;
    const text = String(value).trim().toLowerCase();
    return ['1', 'true', 'yes', 'on', 'enabled'].includes(text);
};

const normalizeNumber = (value: unknown, fallback: number): number => {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const isFormValidationError = (error: unknown): error is FormValidationError =>
    Boolean(error && typeof error === 'object' && 'errorFields' in error);

const resolveApiDetailMessage = (error: unknown): string | undefined => {
    const detail = (error as PlatformApiError)?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    return detail?.message;
};

const PlatformSettings: React.FC = () => {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [form] = Form.useForm<PlatformSettingsFormValues>();
    const [activeSection, setActiveSection] = useState<'domain' | 'ssl' | 'snmp' | 'ntp'>('domain');
    const [applying, setApplying] = useState(false);
    const [ntpTesting, setNtpTesting] = useState(false);
    const [hasStoredPrivateKey, setHasStoredPrivateKey] = useState(false);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const config = await ApiClient.getPlatformConfig();
                const privateKeyMasked = String(config.platform_ssl_private_key || '').trim() === MASKED_VALUE;
                setHasStoredPrivateKey(privateKeyMasked || Boolean(config.platform_ssl_private_key));
                form.setFieldsValue({
                    ...config,
                    platform_ssl_private_key: privateKeyMasked ? '' : (config.platform_ssl_private_key || ''),
                    platform_ssl_enabled: normalizeBoolean(config.platform_ssl_enabled, false),
                    platform_snmp_enabled: normalizeBoolean(config.platform_snmp_enabled, false),
                    platform_ntp_enabled: normalizeBoolean(config.platform_ntp_enabled, false),
                    platform_snmp_port: normalizeNumber(config.platform_snmp_port, 162),
                    platform_ntp_port: normalizeNumber(config.platform_ntp_port, 123),
                    platform_ntp_sync_interval_minutes: normalizeNumber(config.platform_ntp_sync_interval_minutes, 60),
                    platform_ntp_manual_time: config.platform_ntp_manual_time ? dayjs(config.platform_ntp_manual_time) : undefined,
                });
            } catch {
                message.error(t('platformSettingsPage.messages.loadFailed'));
            }
        };
        fetchConfig();
    }, [form, t]);

    const handleUploadTextToField = async (field: PlatformConfigKey, file: File) => {
        try {
            const content = await file.text();
            form.setFieldValue(field, content);
            message.success(t('platformSettingsPage.messages.uploadSuccess'));
        } catch {
            message.error(t('platformSettingsPage.messages.uploadFailed'));
        }
    };

    const buildPayload = (values: PlatformSettingsFormValues): Record<string, string> => {
        const payload = PLATFORM_CONFIG_KEYS.reduce((acc, key) => {
            const raw = values[key];
            if (raw === undefined || raw === null) return acc;
            if (dayjs.isDayjs(raw)) {
                acc[key] = raw.format('YYYY-MM-DD HH:mm:ss');
                return acc;
            }
            if (typeof raw === 'boolean') {
                acc[key] = raw ? 'true' : 'false';
                return acc;
            }
            acc[key] = String(raw);
            return acc;
        }, {} as Record<string, string>);
        if (!String(values.platform_ssl_private_key || '').trim() && hasStoredPrivateKey) {
            delete payload.platform_ssl_private_key;
        }
        return payload;
    };

    const handleSaveAndApply = async () => {
        try {
            const values = await form.validateFields();
            setApplying(true);
            await ApiClient.updateSystemConfig(buildPayload(values));
            if (String(values.platform_ssl_private_key || '').trim()) {
                setHasStoredPrivateKey(true);
            }
            const applyResult = await ApiClient.applyPlatformSettings();
            if (applyResult.reload_required) {
                message.warning(t('platformSettingsPage.messages.applySuccessNeedReload'));
            } else {
                message.success(t('platformSettingsPage.messages.applySuccess'));
            }
        } catch (error: unknown) {
            if (isFormValidationError(error)) return;
            message.error(resolveApiDetailMessage(error) || t('platformSettingsPage.messages.applyFailed'));
        } finally {
            setApplying(false);
        }
    };

    const handleSaveOnly = async () => {
        await handleSaveAndApply();
    };

    const handleTestNtpConnectivity = async () => {
        try {
            const values = await form.validateFields(['platform_ntp_server', 'platform_ntp_port']);
            const server = String(values.platform_ntp_server || '').trim();
            const port = Number(values.platform_ntp_port || 123);
            if (!server) {
                message.warning(t('platformSettingsPage.messages.ntpServerRequired'));
                return;
            }

            setNtpTesting(true);
            const result = await ApiClient.testPlatformNtpConnectivity({
                platform_ntp_server: server,
                platform_ntp_port: port,
            });
            message.success(
                t('platformSettingsPage.messages.ntpTestSuccess', {
                    latency: result.latency_ms,
                    stratum: result.stratum,
                }),
            );
        } catch (error: unknown) {
            if (isFormValidationError(error)) return;
            message.error(resolveApiDetailMessage(error) || t('platformSettingsPage.messages.ntpTestFailed'));
        } finally {
            setNtpTesting(false);
        }
    };

    const sectionItems = [
        {
            key: 'domain' as const,
            label: t('platformSettingsPage.sections.domain'),
            children: (
                <PlatformDomainSection
                    applying={applying}
                    ntpTesting={ntpTesting}
                    onSave={handleSaveOnly}
                />
            ),
        },
        {
            key: 'ssl' as const,
            label: t('platformSettingsPage.sections.ssl'),
            children: (
                <PlatformSslSection
                    applying={applying}
                    ntpTesting={ntpTesting}
                    onSave={handleSaveOnly}
                    onUploadCert={(file) => handleUploadTextToField('platform_ssl_certificate', file)}
                    onUploadKey={(file) => handleUploadTextToField('platform_ssl_private_key', file)}
                />
            ),
        },
        {
            key: 'snmp' as const,
            label: t('platformSettingsPage.sections.snmp'),
            children: (
                <PlatformSnmpSection
                    applying={applying}
                    ntpTesting={ntpTesting}
                    onSave={handleSaveOnly}
                />
            ),
        },
        {
            key: 'ntp' as const,
            label: t('platformSettingsPage.sections.ntp'),
            children: (
                <PlatformNtpSection
                    applying={applying}
                    ntpTesting={ntpTesting}
                    onSave={handleSaveOnly}
                    onTest={handleTestNtpConnectivity}
                />
            ),
        },
    ];

    return (
        <div className="admin-page admin-page-spaced">
            <AppPageHeader
                title={t('platformSettingsPage.page.title')}
                subtitle={t('platformSettingsPage.page.subtitle')}
            />

            <Form
                form={form}
                layout="vertical"
                initialValues={{
                    platform_ssl_enabled: false,
                    platform_snmp_enabled: false,
                    platform_ntp_enabled: false,
                    platform_snmp_port: 162,
                    platform_ntp_port: 123,
                    platform_ntp_sync_interval_minutes: 60,
                    platform_snmp_version: 'v2c',
                }}
            >
                <Space direction="vertical" size={16} className="w-full">
                    <Tabs
                        activeKey={activeSection}
                        onChange={(value) => setActiveSection(value as 'domain' | 'ssl' | 'snmp' | 'ntp')}
                        destroyOnHidden
                        items={sectionItems.map((item) => ({
                            key: item.key,
                            label: item.label,
                            children: (
                                <Suspense fallback={null}>
                                    {item.children}
                                </Suspense>
                            ),
                        }))}
                    />
                </Space>
            </Form>
        </div>
    );
};

export default PlatformSettings;
