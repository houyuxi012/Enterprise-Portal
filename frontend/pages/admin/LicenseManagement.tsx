import React, { useEffect, useMemo, useState } from 'react';
import { Card, Col, Descriptions, message, Modal, Row, Table, Tag, Typography, Upload } from 'antd';
import { UploadOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import ApiClient from '../../services/api';
import AppButton from '../../components/AppButton';
import AuthService from '../../services/auth';
import { LicenseClaimsResponse, LicenseEventItem, LicenseStatus } from '../../types';

const { Text } = Typography;
const PRODUCT_MODEL = 'NGEPv3.0-HYX-PS';
const LICENSE_ID_PATTERN = /^HYX(?:-[A-Z0-9]{5}){5}$/;

const grantTypeLabel = (grantType?: string | null) => {
    const value = (grantType || '').toLowerCase();
    if (value === 'formal') return '正式授权';
    if (value === 'trial') return '测试授权';
    if (value === 'learning') return '学习授权';
    return grantType || '未设置';
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
    if (value === 'active') return '生效中';
    if (value === 'expired') return '已过期';
    if (value === 'invalid') return '无效';
    if (value === 'missing') return '未安装';
    return status || '未知';
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
    if (value === 'success') return '成功';
    if (value === 'failed') return '失败';
    return status || '未知';
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
    return dt.toLocaleString('zh-CN', { hour12: false });
};

const LICENSE_ERROR_MAP: Record<string, string> = {
    LICENSE_SIGNATURE_INVALID: 'License 签名校验失败',
    LICENSE_INVALID_PAYLOAD: '授权文件格式无效',
    LICENSE_PRODUCT_MISMATCH: '授权产品标识不匹配',
    LICENSE_PRODUCT_MODEL_MISMATCH: '授权产品型号不匹配',
    LICENSE_INSTALLATION_MISMATCH: '授权序列号不匹配',
    LICENSE_NOT_YET_VALID: '授权尚未生效',
    LICENSE_EXPIRED: '授权已过期',
    TIME_ROLLBACK: '检测到系统时间回拨，授权校验失败',
};

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

const parseLicenseDocument = (raw: string) => {
    const text = (raw || '').trim();
    if (!text) {
        throw new Error('授权内容不能为空');
    }

    let parsed: any;
    try {
        parsed = JSON.parse(text);
    } catch {
        // Fallback: some tools may provide base64 text payload.
        try {
            const decoded = atob(text);
            parsed = JSON.parse(decoded);
        } catch {
            throw new Error('授权文件不是有效 JSON/.bin 内容');
        }
    }

    const payload = parsed?.payload;
    const signature = parsed?.signature;
    if (!payload || typeof payload !== 'object' || typeof signature !== 'string' || !signature.trim()) {
        throw new Error('授权格式错误，必须包含 payload 与 signature');
    }

    return {
        payload,
        signature: signature.trim(),
    };
};

const LicenseManagement: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [statusData, setStatusData] = useState<LicenseStatus | null>(null);
    const [claimsData, setClaimsData] = useState<LicenseClaimsResponse | null>(null);
    const [licenseEvents, setLicenseEvents] = useState<LicenseEventItem[]>([]);
    const displayLicenseId = formatLicenseId(statusData?.license_id);

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

    const fetchLicenseData = async (silent = false) => {
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
            message.error(error?.response?.data?.detail?.message || '加载授权信息失败');
        }
    };

    useEffect(() => {
        fetchLicenseData();
    }, []);

    const importLicenseDocument = async (
        payload: Record<string, any>,
        signature: string,
        fileName?: string,
    ) => {
        setLoading(true);
        try {
            await ApiClient.installLicense({
                payload,
                signature,
            });
            message.success(`授权导入成功${fileName ? `：${fileName}` : ''}`);
            await fetchLicenseData(true);
            Modal.confirm({
                title: '授权已生效',
                content: '为确保新授权策略完整生效，请重新登录系统。',
                okText: '立即重新登录',
                cancelText: '稍后',
                onOk: () => {
                    AuthService.logout('/admin/login');
                },
            });
        } catch (error: any) {
            const detail = error?.response?.data?.detail;
            const code = detail?.code;
            const backendMessage = detail?.message || (typeof detail === 'string' ? detail : '') || error?.message;
            const localized = (code && LICENSE_ERROR_MAP[String(code)]) || backendMessage;
            message.error(`授权导入失败：${localized || '未知错误'}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4 animate-in fade-in duration-700 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-6 min-h-full">
            <div className="flex justify-between items-center mb-2 max-w-[1440px] mx-auto w-full">
                <div>
                    <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">授权许可</h2>
                    <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wide">License Management</p>
                </div>
                <Upload
                    showUploadList={false}
                    disabled={loading}
                    accept=".bin,.json,application/octet-stream,application/json,text/plain"
                    beforeUpload={async (file) => {
                        try {
                            const buffer = await file.arrayBuffer();
                            const text = new TextDecoder('utf-8').decode(buffer);
                            const parsed = parseLicenseDocument(text);
                            await importLicenseDocument(parsed.payload, parsed.signature, file.name);
                        } catch {
                            message.error('授权文件解析失败，请确认是生成器导出的 .bin');
                        }
                        return false;
                    }}
                >
                    <AppButton intent="primary" icon={<UploadOutlined />} loading={loading} disabled={loading}>
                        导入授权
                    </AppButton>
                </Upload>
            </div>

            <div className="max-w-[1440px] mx-auto">
                <Card
                    title={<span className="font-bold"><SafetyCertificateOutlined className="mr-2" />当前授权信息</span>}
                    className="rounded-2xl border border-slate-100 shadow-sm"
                >
                    <Descriptions
                        column={3}
                        size="small"
                    >
                        <Descriptions.Item label="安装状态">
                            <Tag color={statusColor(statusData?.status)}>{statusLabel(statusData?.status)}</Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="授权类型">
                            <Tag color={grantTypeColor(statusData?.grant_type)}>{grantTypeLabel(statusData?.grant_type)}</Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="产品型号">{statusData?.product_model || PRODUCT_MODEL}</Descriptions.Item>
                        <Descriptions.Item label="License ID">
                            {displayLicenseId !== '-' ? (
                                <Text copyable={{ text: displayLicenseId }} className="font-mono whitespace-nowrap inline-block">
                                    {displayLicenseId}
                                </Text>
                            ) : (
                                '-'
                            )}
                        </Descriptions.Item>
                        <Descriptions.Item label="序列号">
                            <Text copyable={{ text: statusData?.installation_id || '' }} className="font-mono whitespace-nowrap inline-block">
                                {statusData?.installation_id || '-'}
                            </Text>
                        </Descriptions.Item>
                        <Descriptions.Item label="客户名称">{statusData?.customer || '-'}</Descriptions.Item>
                        <Descriptions.Item label="导入时间">{formatDateTime(statusData?.installed_at)}</Descriptions.Item>
                        <Descriptions.Item label="过期时间">{formatDateTime(statusData?.expires_at)}</Descriptions.Item>
                        <Descriptions.Item label="授权人数">{statusData?.limits?.users ?? '-'}</Descriptions.Item>
                    </Descriptions>
                </Card>
            </div>

            <div className="max-w-[1440px] mx-auto">
                <Card
                    title="授权详情（Claims）"
                    className="rounded-2xl border border-slate-100 shadow-sm"
                >
                    <Row gutter={[16, 16]}>
                        <Col span={24}>
                            <div className="text-xs text-slate-500">功能数量</div>
                            <div className="text-base font-semibold text-slate-800 dark:text-white">
                                {statusData?.features_count ?? featuresView.length}
                            </div>
                        </Col>
                        <Col span={24}>
                            <div className="mb-2 text-xs text-slate-500">已启用功能</div>
                            <div className="flex flex-wrap gap-2">
                                {featuresView.length > 0 ? (
                                    featuresView.map((feature) => (
                                        <Tag key={feature} color="blue">{feature}</Tag>
                                    ))
                                ) : (
                                    <Text type="secondary">暂无已启用功能</Text>
                                )}
                            </div>
                        </Col>
                    </Row>
                </Card>
            </div>

            <div className="max-w-[1440px] mx-auto">
                <Card
                    title="授权导入记录"
                    className="rounded-2xl border border-slate-100 shadow-sm"
                >
                    <Table<LicenseEventItem>
                        rowKey="id"
                        size="middle"
                        pagination={{
                            pageSize: 10,
                            showSizeChanger: false,
                            hideOnSinglePage: true,
                        }}
                        dataSource={importEvents}
                        locale={{ emptyText: '暂无授权导入记录' }}
                        columns={[
                            {
                                title: '时间',
                                dataIndex: 'created_at',
                                key: 'created_at',
                                width: 220,
                                render: (value: string) => <span className="text-xs text-slate-500">{formatDateTime(value)}</span>,
                            },
                            {
                                title: '授权类型',
                                dataIndex: 'grant_type',
                                key: 'grant_type',
                                width: 150,
                                render: (value: string | null | undefined) => (
                                    <Tag color={grantTypeColor(value)}>{grantTypeLabel(value)}</Tag>
                                ),
                            },
                            {
                                title: '客户名称',
                                dataIndex: 'customer',
                                key: 'customer',
                                width: 220,
                                render: (value: string | null | undefined) => value || '-',
                            },
                            {
                                title: '导入状态',
                                dataIndex: 'status',
                                key: 'status',
                                width: 140,
                                render: (value: string | null | undefined) => (
                                    <Tag color={eventStatusColor(value)}>{eventStatusLabel(value)}</Tag>
                                ),
                            },
                            {
                                title: '原因',
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
