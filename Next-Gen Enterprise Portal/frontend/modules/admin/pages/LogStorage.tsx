
import React, { useEffect, useState } from 'react';
import { App, Card, Col, InputNumber, Row, Space, Tooltip, Typography } from 'antd';
import { DatabaseOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient from '@/services/api';
import { AppButton, AppForm, AppPageHeader } from '@/modules/admin/components/ui';

interface StorageConfig {
    log_retention_system_days: number;
    log_retention_business_days: number;
    log_retention_ai_days: number;
    log_retention_iam_days: number;
    log_retention_access_days: number;
    log_max_disk_usage: number;
}

const LogStorage: React.FC = () => {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [storageLoading, setStorageLoading] = useState(false);
    const [storageForm] = AppForm.useForm();
    const { Paragraph, Text, Title } = Typography;

    const fetchStorageConfig = async () => {
        try {
            const config = await ApiClient.getSystemConfig();
            storageForm.setFieldsValue({
                log_retention_system_days: config.log_retention_system_days || 7,
                log_retention_business_days: config.log_retention_business_days || 180,
                log_retention_ai_days: config.log_retention_ai_days || 180,
                log_retention_iam_days: config.log_retention_iam_days || 180,
                log_retention_access_days: config.log_retention_access_days || 7,
                log_max_disk_usage: config.log_max_disk_usage || 80
            });
        } catch (error) {
            console.error("Failed to load storage config");
        }
    };

    useEffect(() => {
        fetchStorageConfig();
    }, []);

    const handleSaveStorage = async (values: StorageConfig) => {
        setStorageLoading(true);
        try {
            await ApiClient.updateSystemConfig({
                log_retention_system_days: String(values.log_retention_system_days),
                log_retention_business_days: String(values.log_retention_business_days),
                log_retention_ai_days: String(values.log_retention_ai_days),
                log_retention_iam_days: String(values.log_retention_iam_days),
                log_retention_access_days: String(values.log_retention_access_days),
                log_max_disk_usage: String(values.log_max_disk_usage)
            });
            message.success(t('logStorage.messages.saveSuccess'));
        } catch (error) {
            message.error(t('logStorage.messages.saveFailed'));
        } finally {
            setStorageLoading(false);
        }
    };

    const handleOptimize = async () => {
        message.loading({ content: t('logStorage.messages.optimizing'), key: 'opt' });
        try {
            await ApiClient.optimizeStorage();
            message.success({ content: t('logStorage.messages.optimizeSuccess'), key: 'opt' });
        } catch (error) {
            message.error({ content: t('logStorage.messages.optimizeFailed'), key: 'opt' });
        }
    };

    return (
        <div className="admin-page admin-page-spaced">
            <AppPageHeader
                title={t('logStorage.page.title')}
                subtitle={t('logStorage.page.subtitle')}
                action={(
                    <AppButton intent="secondary" icon={<DatabaseOutlined />} onClick={() => void handleOptimize()}>
                        {t('logStorage.page.optimizeNow')}
                    </AppButton>
                )}
            />

            <Card
                className="admin-card"
                title={
                    <Space size={8}>
                        <DatabaseOutlined />
                        <span>{t('logStorage.dbCard.title')}</span>
                    </Space>
                }
                extra={<Text type="secondary">{t('logStorage.dbCard.badge')}</Text>}
            >
                <AppForm
                    form={storageForm}
                    layout="vertical"
                    onFinish={handleSaveStorage}
                    className="space-y-4"
                >
                    <Row gutter={[16, 16]}>
                        <Col xs={24} md={12} xl={8}>
                            <AppForm.Item
                                name="log_retention_system_days"
                                label={
                                    <Space size={6}>
                                        <span>{t('logStorage.fields.system')}</span>
                                        <Tooltip title={t('logStorage.tooltips.system')}>
                                            <InfoCircleOutlined />
                                        </Tooltip>
                                    </Space>
                                }
                                rules={[{ required: true, message: t('logStorage.validation.daysRequired') }]}
                            >
                                <InputNumber min={1} max={365} addonAfter={t('logStorage.units.day')} className="w-full" />
                            </AppForm.Item>
                        </Col>
                        <Col xs={24} md={12} xl={8}>
                            <AppForm.Item
                                name="log_retention_business_days"
                                label={
                                    <Space size={6}>
                                        <span>{t('logStorage.fields.business')}</span>
                                        <Tooltip title={t('logStorage.tooltips.business')}>
                                            <InfoCircleOutlined />
                                        </Tooltip>
                                    </Space>
                                }
                                rules={[{ required: true, message: t('logStorage.validation.daysRequired') }]}
                            >
                                <InputNumber min={1} max={365} addonAfter={t('logStorage.units.day')} className="w-full" />
                            </AppForm.Item>
                        </Col>
                        <Col xs={24} md={12} xl={8}>
                            <AppForm.Item
                                name="log_retention_ai_days"
                                label={
                                    <Space size={6}>
                                        <span>{t('logStorage.fields.ai')}</span>
                                        <Tooltip title={t('logStorage.tooltips.ai')}>
                                            <InfoCircleOutlined />
                                        </Tooltip>
                                    </Space>
                                }
                                rules={[{ required: true, message: t('logStorage.validation.daysRequired') }]}
                            >
                                <InputNumber min={1} max={365} addonAfter={t('logStorage.units.day')} className="w-full" />
                            </AppForm.Item>
                        </Col>
                        <Col xs={24} md={12} xl={8}>
                            <AppForm.Item
                                name="log_retention_iam_days"
                                label={
                                    <Space size={6}>
                                        <span>{t('logStorage.fields.iam')}</span>
                                        <Tooltip title={t('logStorage.tooltips.iam')}>
                                            <InfoCircleOutlined />
                                        </Tooltip>
                                    </Space>
                                }
                                rules={[{ required: true, message: t('logStorage.validation.daysRequired') }]}
                            >
                                <InputNumber min={1} max={365} addonAfter={t('logStorage.units.day')} className="w-full" />
                            </AppForm.Item>
                        </Col>
                        <Col xs={24} md={12} xl={8}>
                            <AppForm.Item
                                name="log_retention_access_days"
                                label={
                                    <Space size={6}>
                                        <span>{t('logStorage.fields.access')}</span>
                                        <Tooltip title={t('logStorage.tooltips.access')}>
                                            <InfoCircleOutlined />
                                        </Tooltip>
                                    </Space>
                                }
                                rules={[{ required: true, message: t('logStorage.validation.daysRequired') }]}
                            >
                                <InputNumber min={1} max={365} addonAfter={t('logStorage.units.day')} className="w-full" />
                            </AppForm.Item>
                        </Col>
                        <Col xs={24} md={12} xl={8}>
                            <AppForm.Item
                                name="log_max_disk_usage"
                                label={
                                    <Space size={6}>
                                        <span>{t('logStorage.fields.maxDiskUsage')}</span>
                                        <Tooltip title={t('logStorage.tooltips.maxDiskUsage')}>
                                            <InfoCircleOutlined />
                                        </Tooltip>
                                    </Space>
                                }
                                rules={[{ required: true, message: t('logStorage.validation.percentRequired') }]}
                            >
                                <InputNumber min={50} max={95} addonAfter="%" className="w-full" />
                            </AppForm.Item>
                        </Col>
                    </Row>
                    <div className="flex justify-end">
                        <AppButton intent="primary" htmlType="submit" loading={storageLoading}>
                            {t('logStorage.buttons.saveDbPolicy')}
                        </AppButton>
                    </div>
                </AppForm>
            </Card>

            <Card
                className="admin-card admin-card-subtle"
                title={
                    <Space size={8}>
                        <DatabaseOutlined />
                        <span>{t('logStorage.archiveCard.title')}</span>
                    </Space>
                }
                extra={<Text type="secondary">{t('logStorage.archiveCard.badge')}</Text>}
            >
                <Row gutter={[16, 16]}>
                    <Col xs={24} md={12}>
                        <Card size="small" className="admin-card-subtle">
                            <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                <Title level={5} style={{ marginBottom: 0 }}>
                                    {t('logStorage.archiveCard.accessLogsTitle')}
                                </Title>
                                <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                                    {t('logStorage.archiveCard.accessLogsDesc1')} <Text strong>Loki</Text> {t('logStorage.archiveCard.accessLogsDesc2')}
                                </Paragraph>
                                <Text code>{t('logStorage.archiveCard.accessLogsRetention')}</Text>
                            </Space>
                        </Card>
                    </Col>
                    <Col xs={24} md={12}>
                        <Card size="small" className="admin-card-subtle">
                            <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                <Title level={5} style={{ marginBottom: 0 }}>
                                    {t('logStorage.archiveCard.archiveDataTitle')}
                                </Title>
                                <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                                    {t('logStorage.archiveCard.archiveDataDesc1')} <Text strong>MinIO</Text> {t('logStorage.archiveCard.archiveDataDesc2')}
                                </Paragraph>
                                <Text code>{t('logStorage.archiveCard.archiveLifecycle')}</Text>
                            </Space>
                        </Card>
                    </Col>
                </Row>
            </Card>
        </div>
    );
};

export default LogStorage;
