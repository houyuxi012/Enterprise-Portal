import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import App from 'antd/es/app';
import Card from 'antd/es/card';
import Col from 'antd/es/grid/col';
import Descriptions from 'antd/es/descriptions';
import Row from 'antd/es/grid/row';
import Space from 'antd/es/space';
import Tag from 'antd/es/tag';
import Typography from 'antd/es/typography';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import ApiClient from '@/services/api';
import AuthService from '@/services/auth';
import { LicenseClaimsResponse, LicenseEventItem, LicenseStatus } from '@/types';
import { useTranslation } from 'react-i18next';
import { AppButton, AppPageHeader, AppTable } from '@/modules/admin/components/ui';

const UploadTriggerButton = lazy(() => import('@/modules/admin/components/upload/UploadTriggerButton'));

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

const parseRevocationDocument = (raw: string, t: (key: string) => string) => {
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

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.revoked)) {
        throw new Error(t('license.upload.revocationInvalidFormat'));
    }
    return parsed as Record<string, any>;
};

const LicenseManagement: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { message, modal } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [statusData, setStatusData] = useState<LicenseStatus | null>(null);
    const [claimsData, setClaimsData] = useState<LicenseClaimsResponse | null>(null);
    const [licenseEvents, setLicenseEvents] = useState<LicenseEventItem[]>([]);
    const [eventPage, setEventPage] = useState(1);
    const [eventPageSize, setEventPageSize] = useState(10);
    const [eventTotal, setEventTotal] = useState(0);
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

    const eventReasonLabel = (reason?: string | null) => {
        const code = String(reason || '').trim();
        if (!code) return '-';
        return t(`license.errors.${code}`, { defaultValue: code });
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

    const featureLabel = useCallback((featureCode: string) => {
        const normalized = String(featureCode || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');
        return t(`license.featureLabels.${normalized}`, { defaultValue: featureCode });
    }, [t]);

    const fetchLicenseEvents = useCallback(
        async (page: number, pageSize: number) => {
            const normalizedPage = Math.max(1, page || 1);
            const normalizedPageSize = Math.max(1, pageSize || 10);
            const offset = (normalizedPage - 1) * normalizedPageSize;
            const events = await ApiClient.getLicenseEvents(normalizedPageSize, offset, true);
            setLicenseEvents(events.items || []);
            setEventTotal(Number(events.total || 0));
        },
        [],
    );

    const fetchLicenseData = useCallback(async (page = 1, pageSize = 10) => {
        try {
            const [status, claims] = await Promise.all([
                ApiClient.getLicenseStatus(),
                ApiClient.getLicenseClaims(),
            ]);
            setStatusData(status);
            setClaimsData(claims);
            await fetchLicenseEvents(page, pageSize);
        } catch (error: any) {
            console.error('Failed to load license info', error);
            message.error(error?.response?.data?.detail?.message || t('license.errors.loadFailed'));
        }
    }, [fetchLicenseEvents, t]);

    useEffect(() => {
        fetchLicenseData(1, eventPageSize);
    }, [eventPageSize, fetchLicenseData]);

    const importLicenseDocument = async (payload: Record<string, any>, signature: string, fileName?: string) => {
        setLoading(true);
        try {
            await ApiClient.installLicense({
                payload,
                signature,
            });
            message.success(fileName ? t('license.upload.successWithFile', { fileName }) : t('license.upload.success'));
            setEventPage(1);
            await fetchLicenseData(1, eventPageSize);
            modal.confirm({
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

    const importRevocationDocument = async (payload: Record<string, any>, fileName?: string) => {
        setLoading(true);
        try {
            const result = await ApiClient.installLicenseRevocations({ payload });
            const revokedCount = Number(result?.revoked_count || 0);
            message.success(
                t('license.upload.revocationSuccess', {
                    fileName: fileName || '-',
                    count: revokedCount,
                }),
            );
            await fetchLicenseData(eventPage, eventPageSize);
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
        <div className="admin-page admin-page-spaced">
            <AppPageHeader
                title={t('license.title')}
                subtitle={t('license.subtitle')}
                action={
                    <Space>
                        <Suspense fallback={null}>
                            <UploadTriggerButton
                                accept=".bin,.json,application/octet-stream,application/json,text/plain"
                                buttonLabel={t('license.upload.revocationButton')}
                                disabled={loading}
                                intent="secondary"
                                loading={loading}
                                onSelect={async (file) => {
                                    try {
                                        const buffer = await file.arrayBuffer();
                                        const text = new TextDecoder('utf-8').decode(buffer);
                                        const parsed = parseRevocationDocument(text, t);
                                        await importRevocationDocument(parsed, file.name);
                                    } catch {
                                        message.error(t('license.upload.revocationParseFailed'));
                                    }
                                }}
                            />
                        </Suspense>
                        <Suspense fallback={null}>
                            <UploadTriggerButton
                                accept=".bin,.json,application/octet-stream,application/json,text/plain"
                                buttonLabel={t('license.upload.button')}
                                disabled={loading}
                                intent="primary"
                                loading={loading}
                                onSelect={async (file) => {
                                    try {
                                        const buffer = await file.arrayBuffer();
                                        const text = new TextDecoder('utf-8').decode(buffer);
                                        const parsed = parseLicenseDocument(text, t);
                                        await importLicenseDocument(parsed.payload, parsed.signature, file.name);
                                    } catch {
                                        message.error(t('license.upload.parseFailed'));
                                    }
                                }}
                            />
                        </Suspense>
                    </Space>
                }
            />

            <Card
                title={
                    <Space size={8}>
                        <SafetyCertificateOutlined />
                        <span>{t('license.statusCard.title')}</span>
                    </Space>
                }
                className="admin-card"
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

            <Card title={t('license.claimsCard.title')} className="admin-card">
                    <Row gutter={[16, 16]}>
                        <Col span={24}>
                            <Text type="secondary">{t('license.claimsCard.featureCount')}</Text>
                            <div className="text-base font-semibold">
                                {statusData?.features_count ?? featuresView.length}
                            </div>
                        </Col>
                        <Col span={24}>
                            <div className="mb-2"><Text type="secondary">{t('license.claimsCard.enabledFeatures')}</Text></div>
                            <div className="flex flex-wrap gap-2">
                                {featuresView.length > 0 ? (
                                    featuresView.map((feature) => (
                                        <Tag key={feature} color="blue">{featureLabel(feature)}</Tag>
                                    ))
                                ) : (
                                    <Text type="secondary">{t('license.claimsCard.noEnabledFeatures')}</Text>
                                )}
                            </div>
                        </Col>
                    </Row>
            </Card>

            <Card title={t('license.eventsCard.title')} className="admin-card">
                    <AppTable<LicenseEventItem>
                        rowKey="id"
                        size="middle"
                        pagination={{
                            current: eventPage,
                            pageSize: eventPageSize,
                            total: eventTotal,
                            showSizeChanger: false,
                            hideOnSinglePage: true,
                            onChange: async (page, pageSize) => {
                                const normalizedPageSize = pageSize || eventPageSize;
                                setEventPage(page);
                                if (normalizedPageSize !== eventPageSize) {
                                    setEventPageSize(normalizedPageSize);
                                }
                                try {
                                    await fetchLicenseEvents(page, normalizedPageSize);
                                } catch (error: any) {
                                    message.error(error?.response?.data?.detail?.message || t('license.errors.loadFailed'));
                                }
                            },
                        }}
                        dataSource={licenseEvents}
                        locale={{ emptyText: t('license.eventsCard.empty') }}
                        columns={[
                            {
                                title: t('license.eventsCard.columns.time'),
                                dataIndex: 'created_at',
                                key: 'created_at',
                                width: 220,
                                render: (value: string) => <Text type="secondary">{formatDateTime(value)}</Text>,
                            },
                            {
                                title: t('license.eventsCard.columns.licenseId'),
                                dataIndex: 'license_id',
                                key: 'license_id',
                                width: 260,
                                render: (value: string | null | undefined) => (
                                    <Text>{formatLicenseId(value)}</Text>
                                ),
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
                                    <Text type="secondary">{eventReasonLabel(value)}</Text>
                                ),
                            },
                        ]}
                    />
            </Card>
        </div>
    );
};

export default LicenseManagement;
