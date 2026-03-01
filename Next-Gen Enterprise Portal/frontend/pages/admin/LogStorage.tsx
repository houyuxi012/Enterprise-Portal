
import React, { useEffect, useState } from 'react';
import { Form, InputNumber, message, Tooltip } from 'antd';
import { DatabaseOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient from '../../services/api';
import AppButton from '../../components/AppButton';

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
    const [storageLoading, setStorageLoading] = useState(false);
    const [storageForm] = Form.useForm();

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
        <div className="space-y-6 animate-in fade-in duration-700 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-6 min-h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{t('logStorage.page.title')}</h2>
                    <p className="text-xs text-slate-400 font-bold mt-1">{t('logStorage.page.subtitle')}</p>
                </div>
                <AppButton intent="secondary" icon={<DatabaseOutlined />} onClick={handleOptimize}>{t('logStorage.page.optimizeNow')}</AppButton>
            </div>

            {/* Database Storage Policy Card */}
            <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-8 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700/50 mb-6">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center">
                        <span className="w-1 h-6 bg-blue-500 rounded-full mr-3"></span>
                        {t('logStorage.dbCard.title')}
                    </h3>
                    <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-3 py-1 rounded-lg text-xs font-medium">
                        {t('logStorage.dbCard.badge')}
                    </div>
                </div>

                <Form
                    form={storageForm}
                    layout="vertical"
                    onFinish={handleSaveStorage}
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4"
                >
                    <Form.Item
                        name="log_retention_system_days"
                        label={
                            <span className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                                {t('logStorage.fields.system')}
                                <Tooltip title={t('logStorage.tooltips.system')}>
                                    <InfoCircleOutlined className="text-slate-400" />
                                </Tooltip>
                            </span>
                        }
                        rules={[{ required: true, message: t('logStorage.validation.daysRequired') }]}
                    >
                        <InputNumber min={1} max={365} addonAfter={t('logStorage.units.day')} className="w-full rounded-xl" />
                    </Form.Item>

                    <Form.Item
                        name="log_retention_business_days"
                        label={
                            <span className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                {t('logStorage.fields.business')}
                                <Tooltip title={t('logStorage.tooltips.business')}>
                                    <InfoCircleOutlined className="text-slate-400" />
                                </Tooltip>
                            </span>
                        }
                        rules={[{ required: true, message: t('logStorage.validation.daysRequired') }]}
                    >
                        <InputNumber min={1} max={365} addonAfter={t('logStorage.units.day')} className="w-full rounded-xl" />
                    </Form.Item>

                    <Form.Item
                        name="log_retention_ai_days"
                        label={
                            <span className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                                {t('logStorage.fields.ai')}
                                <Tooltip title={t('logStorage.tooltips.ai')}>
                                    <InfoCircleOutlined className="text-slate-400" />
                                </Tooltip>
                            </span>
                        }
                        rules={[{ required: true, message: t('logStorage.validation.daysRequired') }]}
                    >
                        <InputNumber min={1} max={365} addonAfter={t('logStorage.units.day')} className="w-full rounded-xl" />
                    </Form.Item>

                    <Form.Item
                        name="log_retention_iam_days"
                        label={
                            <span className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                                {t('logStorage.fields.iam')}
                                <Tooltip title={t('logStorage.tooltips.iam')}>
                                    <InfoCircleOutlined className="text-slate-400" />
                                </Tooltip>
                            </span>
                        }
                        rules={[{ required: true, message: t('logStorage.validation.daysRequired') }]}
                    >
                        <InputNumber min={1} max={365} addonAfter={t('logStorage.units.day')} className="w-full rounded-xl" />
                    </Form.Item>


                    <div className="hidden lg:block"></div>

                    <div className="col-span-1 md:col-span-2 lg:col-span-3 mt-4 border-t border-slate-100 dark:border-slate-700/50 pt-6">
                        <div className="flex items-center mb-4">
                            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">{t('logStorage.fields.diskThreshold')}</h4>
                        </div>
                        <Form.Item
                            name="log_max_disk_usage"
                            label={
                                <span className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                    {t('logStorage.fields.maxDiskUsage')}
                                    <Tooltip title={t('logStorage.tooltips.maxDiskUsage')}>
                                        <InfoCircleOutlined className="text-slate-400" />
                                    </Tooltip>
                                </span>
                            }
                            rules={[{ required: true, message: t('logStorage.validation.percentRequired') }]}
                            className="max-w-md"
                        >
                            <InputNumber min={50} max={95} addonAfter="%" className="w-full rounded-xl" />
                        </Form.Item>
                    </div>

                    <div className="col-span-1 md:col-span-2 lg:col-span-3 flex justify-end pt-4">
                        <AppButton intent="primary" htmlType="submit" loading={storageLoading}>{t('logStorage.buttons.saveDbPolicy')}</AppButton>
                    </div>
                </Form>
            </div>

            {/* File/Object Storage Info Card */}
            <div className="bg-slate-100 dark:bg-slate-800/50 rounded-[1.5rem] p-8 border border-slate-200 dark:border-slate-700/50">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center">
                        <span className="w-1 h-6 bg-slate-400 rounded-full mr-3"></span>
                        {t('logStorage.archiveCard.title')}
                    </h3>
                    <div className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-3 py-1 rounded-lg text-xs font-medium">
                        {t('logStorage.archiveCard.badge')}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                        <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-2">
                            <DatabaseOutlined /> {t('logStorage.archiveCard.accessLogsTitle')}
                        </h4>
                        <p className="text-slate-500 dark:text-slate-400 mb-2">
                            {t('logStorage.archiveCard.accessLogsDesc1')} <strong>Loki</strong> {t('logStorage.archiveCard.accessLogsDesc2')}
                        </p>
                        <div className="text-xs text-slate-400 mt-2 p-2 bg-slate-50 dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-800 font-mono">
                            {t('logStorage.archiveCard.accessLogsRetention')}
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                        <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-2">
                            <DatabaseOutlined /> {t('logStorage.archiveCard.archiveDataTitle')}
                        </h4>
                        <p className="text-slate-500 dark:text-slate-400 mb-2">
                            {t('logStorage.archiveCard.archiveDataDesc1')} <strong>MinIO</strong> {t('logStorage.archiveCard.archiveDataDesc2')}
                        </p>
                        <div className="text-xs text-slate-400 mt-2 p-2 bg-slate-50 dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-800 font-mono">
                            {t('logStorage.archiveCard.archiveLifecycle')}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LogStorage;
