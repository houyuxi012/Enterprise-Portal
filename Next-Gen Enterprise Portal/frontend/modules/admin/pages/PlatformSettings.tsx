import React, { useEffect, useState } from 'react';
import { Button, Card, Divider, Form, Input, InputNumber, Select, Space, Switch, Tabs, Upload, message } from 'antd';
import { ApiOutlined, ClockCircleOutlined, GlobalOutlined, SaveOutlined, SafetyCertificateOutlined, UploadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient from '@/services/api';

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
] as const;

const normalizeBoolean = (value: unknown, fallback = false): boolean => {
    if (value === undefined || value === null || value === '') return fallback;
    const text = String(value).trim().toLowerCase();
    return ['1', 'true', 'yes', 'on', 'enabled'].includes(text);
};

const normalizeNumber = (value: unknown, fallback: number): number => {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const PlatformSettings: React.FC = () => {
    const { t } = useTranslation();
    const [form] = Form.useForm();
    const [applying, setApplying] = useState(false);
    const [ntpTesting, setNtpTesting] = useState(false);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const config = await ApiClient.getPlatformConfig();
                form.setFieldsValue({
                    ...config,
                    platform_ssl_enabled: normalizeBoolean(config.platform_ssl_enabled, false),
                    platform_snmp_enabled: normalizeBoolean(config.platform_snmp_enabled, false),
                    platform_ntp_enabled: normalizeBoolean(config.platform_ntp_enabled, false),
                    platform_snmp_port: normalizeNumber(config.platform_snmp_port, 162),
                    platform_ntp_port: normalizeNumber(config.platform_ntp_port, 123),
                    platform_ntp_sync_interval_minutes: normalizeNumber(config.platform_ntp_sync_interval_minutes, 60),
                });
            } catch {
                message.error(t('platformSettingsPage.messages.loadFailed'));
            }
        };
        fetchConfig();
    }, [form, t]);

    const handleUploadTextToField = async (field: string, file: File) => {
        try {
            const content = await file.text();
            form.setFieldValue(field, content);
            message.success(t('platformSettingsPage.messages.uploadSuccess'));
        } catch {
            message.error(t('platformSettingsPage.messages.uploadFailed'));
        }
    };

    const buildPayload = (values: Record<string, any>): Record<string, string> => {
        return PLATFORM_CONFIG_KEYS.reduce((acc, key) => {
            const raw = values[key];
            if (raw === undefined || raw === null) return acc;
            if (typeof raw === 'boolean') {
                acc[key] = raw ? 'true' : 'false';
                return acc;
            }
            acc[key] = String(raw);
            return acc;
        }, {} as Record<string, string>);
    };

    const handleSaveAndApply = async () => {
        try {
            const values = await form.validateFields();
            setApplying(true);
            await ApiClient.updateSystemConfig(buildPayload(values));
            const applyResult = await ApiClient.applyPlatformSettings();
            if (applyResult.reload_required) {
                message.warning(t('platformSettingsPage.messages.applySuccessNeedReload'));
            } else {
                message.success(t('platformSettingsPage.messages.applySuccess'));
            }
        } catch (error: any) {
            if (error?.errorFields) return;
            const detail = error?.response?.data?.detail;
            message.error(detail?.message || t('platformSettingsPage.messages.applyFailed'));
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
        } catch (error: any) {
            if (error?.errorFields) return;
            const detail = error?.response?.data?.detail;
            message.error(detail?.message || t('platformSettingsPage.messages.ntpTestFailed'));
        } finally {
            setNtpTesting(false);
        }
    };

    return (
        <div>
            <div className="mb-6">
                <div>
                    <h2 className="text-xl font-bold text-slate-800">{t('platformSettingsPage.page.title')}</h2>
                    <p className="text-sm text-slate-500 mt-1">{t('platformSettingsPage.page.subtitle')}</p>
                </div>
            </div>

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
                <Tabs
                    items={[
                        {
                            key: 'domain',
                            label: (
                                <span className="flex items-center space-x-2">
                                    <GlobalOutlined />
                                    <span>{t('platformSettingsPage.sections.domain')}</span>
                                </span>
                            ),
                            children: (
                                <Card className="shadow-sm border-slate-200">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6">
                                        <Form.Item
                                            name="platform_domain"
                                            label={<span className="font-semibold">{t('platformSettingsPage.form.platformDomain')}</span>}
                                        >
                                            <Input placeholder={t('platformSettingsPage.form.placeholders.platformDomain')} />
                                        </Form.Item>
                                        <Form.Item
                                            name="platform_public_base_url"
                                            label={<span className="font-semibold">{t('platformSettingsPage.form.publicBaseUrl')}</span>}
                                        >
                                            <Input placeholder={t('platformSettingsPage.form.placeholders.publicBaseUrl')} />
                                        </Form.Item>
                                        <Form.Item
                                            name="platform_admin_base_url"
                                            label={<span className="font-semibold">{t('platformSettingsPage.form.adminBaseUrl')}</span>}
                                        >
                                            <Input placeholder={t('platformSettingsPage.form.placeholders.adminBaseUrl')} />
                                        </Form.Item>
                                    </div>
                                    <Divider />
                                    <Space>
                                        <Button
                                            type="primary"
                                            icon={<SaveOutlined />}
                                            onClick={handleSaveOnly}
                                            loading={applying}
                                            disabled={ntpTesting}
                                        >
                                            {t('platformSettingsPage.page.saveButton')}
                                        </Button>
                                    </Space>
                                </Card>
                            ),
                        },
                        {
                            key: 'ssl',
                            label: (
                                <span className="flex items-center space-x-2">
                                    <SafetyCertificateOutlined />
                                    <span>{t('platformSettingsPage.sections.ssl')}</span>
                                </span>
                            ),
                            children: (
                                <Card className="shadow-sm border-slate-200">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6">
                                        <Form.Item
                                            name="platform_ssl_enabled"
                                            label={<span className="font-semibold">{t('platformSettingsPage.form.sslEnabled')}</span>}
                                            valuePropName="checked"
                                        >
                                            <Switch size="small" />
                                        </Form.Item>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                                        <Form.Item
                                            name="platform_ssl_certificate"
                                            label={<span className="font-semibold">{t('platformSettingsPage.form.sslCertificate')}</span>}
                                        >
                                            <Input.TextArea rows={7} placeholder={t('platformSettingsPage.form.placeholders.sslCertificate')} />
                                        </Form.Item>
                                        <Form.Item
                                            name="platform_ssl_private_key"
                                            label={<span className="font-semibold">{t('platformSettingsPage.form.sslPrivateKey')}</span>}
                                        >
                                            <Input.TextArea rows={7} placeholder={t('platformSettingsPage.form.placeholders.sslPrivateKey')} />
                                        </Form.Item>
                                    </div>

                                    <Space wrap>
                                        <Upload
                                            showUploadList={false}
                                            beforeUpload={async (file) => {
                                                await handleUploadTextToField('platform_ssl_certificate', file);
                                                return false;
                                            }}
                                        >
                                            <Button icon={<UploadOutlined />}>
                                                {t('platformSettingsPage.actions.uploadCert')}
                                            </Button>
                                        </Upload>
                                        <Upload
                                            showUploadList={false}
                                            beforeUpload={async (file) => {
                                                await handleUploadTextToField('platform_ssl_private_key', file);
                                                return false;
                                            }}
                                        >
                                            <Button icon={<UploadOutlined />}>
                                                {t('platformSettingsPage.actions.uploadKey')}
                                            </Button>
                                        </Upload>
                                    </Space>
                                    <Divider />
                                    <Space>
                                        <Button
                                            type="primary"
                                            icon={<SaveOutlined />}
                                            onClick={handleSaveOnly}
                                            loading={applying}
                                            disabled={ntpTesting}
                                        >
                                            {t('platformSettingsPage.page.saveButton')}
                                        </Button>
                                    </Space>
                                </Card>
                            ),
                        },
                        {
                            key: 'snmp',
                            label: (
                                <span className="flex items-center space-x-2">
                                    <ApiOutlined />
                                    <span>{t('platformSettingsPage.sections.snmp')}</span>
                                </span>
                            ),
                            children: (
                                <Card className="shadow-sm border-slate-200">
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-x-6">
                                        <Form.Item
                                            name="platform_snmp_enabled"
                                            label={<span className="font-semibold">{t('platformSettingsPage.form.snmpEnabled')}</span>}
                                            valuePropName="checked"
                                        >
                                            <Switch size="small" />
                                        </Form.Item>
                                        <Form.Item
                                            name="platform_snmp_host"
                                            label={<span className="font-semibold">{t('platformSettingsPage.form.snmpHost')}</span>}
                                        >
                                            <Input placeholder={t('platformSettingsPage.form.placeholders.snmpHost')} />
                                        </Form.Item>
                                        <Form.Item
                                            name="platform_snmp_port"
                                            label={<span className="font-semibold">{t('platformSettingsPage.form.snmpPort')}</span>}
                                        >
                                            <InputNumber min={1} max={65535} className="w-full" />
                                        </Form.Item>
                                        <Form.Item
                                            name="platform_snmp_version"
                                            label={<span className="font-semibold">{t('platformSettingsPage.form.snmpVersion')}</span>}
                                        >
                                            <Select
                                                options={[
                                                    { value: 'v2c', label: 'SNMP v2c' },
                                                    { value: 'v3', label: 'SNMP v3' },
                                                ]}
                                            />
                                        </Form.Item>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                                        <Form.Item
                                            name="platform_snmp_community"
                                            label={<span className="font-semibold">{t('platformSettingsPage.form.snmpCommunity')}</span>}
                                            help={t('platformSettingsPage.form.snmpCommunityHelp')}
                                        >
                                            <Input.Password placeholder={t('platformSettingsPage.form.placeholders.snmpCommunity')} />
                                        </Form.Item>
                                    </div>
                                    <Divider />
                                    <Space>
                                        <Button
                                            type="primary"
                                            icon={<SaveOutlined />}
                                            onClick={handleSaveOnly}
                                            loading={applying}
                                            disabled={ntpTesting}
                                        >
                                            {t('platformSettingsPage.page.saveButton')}
                                        </Button>
                                    </Space>
                                </Card>
                            ),
                        },
                        {
                            key: 'ntp',
                            label: (
                                <span className="flex items-center space-x-2">
                                    <ClockCircleOutlined />
                                    <span>{t('platformSettingsPage.sections.ntp')}</span>
                                </span>
                            ),
                            children: (
                                <Card className="shadow-sm border-slate-200">
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-x-6">
                                        <Form.Item
                                            name="platform_ntp_enabled"
                                            label={<span className="font-semibold">{t('platformSettingsPage.form.ntpEnabled')}</span>}
                                            valuePropName="checked"
                                        >
                                            <Switch size="small" />
                                        </Form.Item>
                                        <Form.Item
                                            name="platform_ntp_server"
                                            label={<span className="font-semibold">{t('platformSettingsPage.form.ntpServer')}</span>}
                                        >
                                            <Input placeholder={t('platformSettingsPage.form.placeholders.ntpServer')} />
                                        </Form.Item>
                                        <Form.Item
                                            name="platform_ntp_port"
                                            label={<span className="font-semibold">{t('platformSettingsPage.form.ntpPort')}</span>}
                                        >
                                            <InputNumber min={1} max={65535} className="w-full" />
                                        </Form.Item>
                                        <Form.Item
                                            name="platform_ntp_sync_interval_minutes"
                                            label={<span className="font-semibold">{t('platformSettingsPage.form.ntpSyncInterval')}</span>}
                                        >
                                            <InputNumber min={1} max={10080} className="w-full" />
                                        </Form.Item>
                                    </div>
                                    <Divider />
                                    <Space>
                                        <Button
                                            onClick={handleTestNtpConnectivity}
                                            loading={ntpTesting}
                                            disabled={applying}
                                        >
                                            {t('platformSettingsPage.actions.testNtp')}
                                        </Button>
                                        <Button
                                            type="primary"
                                            icon={<SaveOutlined />}
                                            onClick={handleSaveOnly}
                                            loading={applying}
                                            disabled={ntpTesting}
                                        >
                                            {t('platformSettingsPage.page.saveButton')}
                                        </Button>
                                    </Space>
                                </Card>
                            ),
                        },
                    ]}
                />
            </Form>
        </div>
    );
};

export default PlatformSettings;
