import React, { useEffect, useMemo, useState } from 'react';
import { Card, Col, Descriptions, message, Modal, Row, Table, Tag, Typography, Upload } from 'antd';
import { UploadOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import ApiClient from '../../services/api';
import AppButton from '../../components/AppButton';
import AuthService from '../../services/auth';
import { LicenseClaimsResponse, LicenseEventItem, LicenseStatus } from '../../types';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;
const PRODUCT_MODEL = 'NGEPv3.0-HYX-PS';
const LICENSE_ID_PATTERN = /^HYX(?:-[A-Z0-9]{5}){5}$/;

const formatLicenseId = (value?: string | null) => {
    if (!value) return '-';
    const upper = String(value).trim().toUpperCase();
    if (LICENSE_ID_PATTERN.test(upper)) return upper;

    const compact = upper.replace(/[^A-Z0-9]/g, '');
    if (compact.startsWith('HYX') && compact.length >= 28) {
        const body = compact.slice(3, 28);
        const groups = body.match(/.{1,5}/g);
        if (groups && groups.length === 5 && groups.every((g) => g.length === 5)) {
            return `HYX-${groups.join('-')}`;
        }
    }
    return upper;
};

const parseLicenseDocument = (raw: string, t: (key: string) => string) => {
    const text = (raw || '').trim();
    if (!text) {
        throw new Error(t('license.upload.emptyContent'));
    }

    let parsed: any;
    try {
        parsed = JSON.parse(text);
    } catch {
        try {
            const decoded = atob(text);
            parsed = JSON.parse(decoded);
        } catch {
            throw new Error(t('license.upload.invalidJson'));
        }
    }

    const payload = parsed?.payload;
    const signature = parsed?.signature;
    if (!payload || typeof payload !== 'object' || typeof signature !== 'string' || !signature.trim()) {
        throw new Error(t('license.upload.invalidFormat'));
    }

    return {
        payload,
        signature: signature.trim(),
    };
};

const LicenseManagement: React.FC = () => {
    const { t, i18n } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [statusData, setStatusData] = useState<LicenseStatus | null>(null);
    const [claimsData, setClaimsData] = useState<LicenseClaimsResponse | null>(null);
    const [licenseEvents, setLicenseEvents] = useState<LicenseEventItem[]>([]);
    const displayLicenseId = formatLicenseId(statusData?.license_id);

    const grantTypeLabel = (grantType?: string | null) => {
        const value = (grantType || '').toLowerCase();
        if (value === 'formal') return t('license.grantType.formal');
        if (value === 'trial') return t('license.grantType.trial');
        if (value === 'learning') return t('license.grantType.learning');
        return grantType || t('license.grantType.unset');
    };

    const grantTypeColor = (grantType?: string | null) => {
        const value = (grantType || '').toLowerCase();
        if (value === 'formal') return 'green';
        if (value === 'trial') return 'gold';
        if (value === 'learning') return 'blue';
        return 'default';
    };

    const statusLabel = (status?: string | null) => {
        const value = (status || '').toLowerCase();
        if (value === 'active') return t('license.status.active');
        if (value === 'expired') return t('license.status.expired');
        if (value === 'invalid') return t('license.status.invalid');
        if (value === 'missing') return t('license.status.missing');
        return status || t('license.status.unknown');
    };

    const statusColor = (status?: string | null) => {
        const value = (status || '').toLowerCase();
        if (value === 'active') return 'green';
        if (value === 'expired') return 'red';
        if (value === 'invalid') return 'red';
        if (value === 'missing') return 'default';
        return 'default';
    };

    const eventStatusLabel = (status?: string | null) => {
        const value = String(status || '').toLowerCase();
        if (value === 'success') return t('license.eventStatus.success');
        if (value === 'failed') return t('license.eventStatus.failed');
        return status || t('license.eventStatus.unknown');
    };

    const eventStatusColor = (status?: string | null) => {
        const value = String(status || '').toLowerCase();
        if (value === 'success') return 'green';
        if (value === 'failed') return 'red';
        return 'default';
    };

    const formatDateTime = (value?: string | null) => {
        if (!value) return '-';
        const dt = new Date(value);
        if (Number.isNaN(dt.getTime())) return value;
        return dt.toLocaleString(i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US', { hour12: false });
    };

    const featuresView = useMemo(() => {
        const features = claimsData?.claims?.features;
        if (Array.isArray(features)) return features.map((it) => String(it));
        if (features && typeof features === 'object') {
            return Object.keys(features).filter((key) => {
                const value = (features as Record<string, any>)[key];
                if (typeof value === 'boolean') return value;
                if (typeof value === 'number') return value > 0;
                if (typeof value === 'string') return ['1', 'true', 'yes', 'on', 'enabled'].includes(value.toLowerCase());
                return !!value;
            });
        }
        return [];
    }, [claimsData]);

    const importEvents = useMemo(
        () => licenseEvents.filter((event) => ['license.install', 'license.verify_failed'].includes(String(event.event_type || '').toLowerCase())),
        [licenseEvents],
    );

    const fetchLicenseData = async () => {
        try {
            const [status, claims, events] = await Promise.all([
                ApiClient.getLicenseStatus(),
                ApiClient.getLicenseClaims(),
                ApiClient.getLicenseEvents(20),
            ]);
            setStatusData(status);
            setClaimsData(claims);
            setLicenseEvents(events.items || []);
        } catch (error: any) {
            console.error('Failed to load license info', error);
            message.error(error?.response?.data?.detail?.message || t('license.errors.loadFailed'));
        }
    };

    useEffect(() => {
        fetchLicenseData();
    }, []);

    const importLicenseDocument = async (payload: Record<string, any>, signature: string, fileName?: string) => {
        setLoading(true);
        try {
            await ApiClient.installLicense({
                payload,
                signature,
            });
            message.success(fileName ? t('license.upload.successWithFile', { fileName }) : t('license.upload.success'));
            await fetchLicenseData();
            Modal.confirm({
                title: t('license.effectiveModal.title'),
                content: t('license.effectiveModal.content'),
                okText: t('license.effectiveModal.okText'),
                cancelText: t('license.effectiveModal.cancelText'),
                onOk: () => {
                    AuthService.logout('/admin/login');
                },
            });
        } catch (error: any) {
            const detail = error?.response?.data?.detail;
            const code = String(detail?.code || '');
            const backendMessage = detail?.message || (typeof detail === 'string' ? detail : '') || error?.message;
            const localized = code ? t(`license.errors.${code}`, { defaultValue: backendMessage }) : backendMessage;
            message.error(t('license.upload.failedPrefix', { reason: localized || t('license.upload.unknownError') }));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4 animate-in fade-in duration-700 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-6 min-h-full">
            <div className="flex justify-between items-center mb-2 max-w-[1440px] mx-auto w-full">
                <div>
                    <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{t('license.title')}</h2>
                    <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wide">{t('license.subtitle')}</p>
                </div>
                <Upload
                    showUploadList={false}
                    disabled={loading}
                    accept=".bin,.json,application/octet-stream,application/json,text/plain"
                    beforeUpload={async (file) => {
                        try {
                            const buffer = await file.arrayBuffer();
                            const text = new TextDecoder('utf-8').decode(buffer);
                            const parsed = parseLicenseDocument(text, t);
                            await importLicenseDocument(parsed.payload, parsed.signature, file.name);
                        } catch {
                            message.error(t('license.upload.parseFailed'));
                        }
                        return false;
                    }}
                >
                    <AppButton intent="primary" icon={<UploadOutlined />} loading={loading} disabled={loading}>
                        {t('license.upload.button')}
                    </AppButton>
                </Upload>
            </div>

            <div className="max-w-[1440px] mx-auto">
                <Card
                    title={<span className="font-bold"><SafetyCertificateOutlined className="mr-2" />{t('license.statusCard.title')}</span>}
                    className="rounded-2xl border border-slate-100 shadow-sm"
                >
                    <Descriptions column={3} size="small">
                        <Descriptions.Item label={t('license.statusCard.installStatus')}>
                            <Tag color={statusColor(statusData?.status)}>{statusLabel(statusData?.status)}</Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label={t('license.statusCard.grantType')}>
                            <Tag color={grantTypeColor(statusData?.grant_type)}>{grantTypeLabel(statusData?.grant_type)}</Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label={t('license.statusCard.productModel')}>{statusData?.product_model || PRODUCT_MODEL}</Descriptions.Item>
                        <Descriptions.Item label={t('license.statusCard.licenseId')}>
                            {displayLicenseId !== '-' ? (
                                <Text copyable={{ text: displayLicenseId }} className="font-mono whitespace-nowrap inline-block">
                                    {displayLicenseId}
                                </Text>
                            ) : '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label={t('license.statusCard.serialNumber')}>
                            <Text copyable={{ text: statusData?.installation_id || '' }} className="font-mono whitespace-nowrap inline-block">
                                {statusData?.installation_id || '-'}
                            </Text>
                        </Descriptions.Item>
                        <Descriptions.Item label={t('license.statusCard.customerName')}>{statusData?.customer || '-'}</Descriptions.Item>
                        <Descriptions.Item label={t('license.statusCard.installedAt')}>{formatDateTime(statusData?.installed_at)}</Descriptions.Item>
                        <Descriptions.Item label={t('license.statusCard.expiresAt')}>{formatDateTime(statusData?.expires_at)}</Descriptions.Item>
                        <Descriptions.Item label={t('license.statusCard.limitUsers')}>{statusData?.limits?.users ?? '-'}</Descriptions.Item>
                    </Descriptions>
                </Card>
            </div>

            <div className="max-w-[1440px] mx-auto">
                <Card title={t('license.claimsCard.title')} className="rounded-2xl border border-slate-100 shadow-sm">
                    <Row gutter={[16, 16]}>
                        <Col span={24}>
                            <div className="text-xs text-slate-500">{t('license.claimsCard.featureCount')}</div>
                            <div className="text-base font-semibold text-slate-800 dark:text-white">
                                {statusData?.features_count ?? featuresView.length}
                            </div>
                        </Col>
                        <Col span={24}>
                            <div className="mb-2 text-xs text-slate-500">{t('license.claimsCard.enabledFeatures')}</div>
                            <div className="flex flex-wrap gap-2">
                                {featuresView.length > 0 ? (
                                    featuresView.map((feature) => (
                                        <Tag key={feature} color="blue">{feature}</Tag>
                                    ))
                                ) : (
                                    <Text type="secondary">{t('license.claimsCard.noEnabledFeatures')}</Text>
                                )}
                            </div>
                        </Col>
                    </Row>
                </Card>
            </div>

            <div className="max-w-[1440px] mx-auto">
                <Card title={t('license.eventsCard.title')} className="rounded-2xl border border-slate-100 shadow-sm">
                    <Table<LicenseEventItem>
                        rowKey="id"
                        size="middle"
                        pagination={{
                            pageSize: 10,
                            showSizeChanger: false,
                            hideOnSinglePage: true,
                        }}
                        dataSource={importEvents}
                        locale={{ emptyText: t('license.eventsCard.empty') }}
                        columns={[
                            {
                                title: t('license.eventsCard.columns.time'),
                                dataIndex: 'created_at',
                                key: 'created_at',
                                width: 220,
                                render: (value: string) => <span className="text-xs text-slate-500">{formatDateTime(value)}</span>,
                            },
                            {
                                title: t('license.eventsCard.columns.grantType'),
                                dataIndex: 'grant_type',
                                key: 'grant_type',
                                width: 150,
                                render: (value: string | null | undefined) => (
                                    <Tag color={grantTypeColor(value)}>{grantTypeLabel(value)}</Tag>
                                ),
                            },
                            {
                                title: t('license.eventsCard.columns.customerName'),
                                dataIndex: 'customer',
                                key: 'customer',
                                width: 220,
                                render: (value: string | null | undefined) => value || '-',
                            },
                            {
                                title: t('license.eventsCard.columns.importStatus'),
                                dataIndex: 'status',
                                key: 'status',
                                width: 140,
                                render: (value: string | null | undefined) => (
                                    <Tag color={eventStatusColor(value)}>{eventStatusLabel(value)}</Tag>
                                ),
                            },
                            {
                                title: t('license.eventsCard.columns.reason'),
                                dataIndex: 'reason',
                                key: 'reason',
                                render: (value: string | null | undefined) => (
                                    <span className="text-slate-500">{value || '-'}</span>
                                ),
                            },
                        ]}
                    />
                </Card>
            </div>
        </div>
    );
};

export default LicenseManagement;
