
import React, { useEffect, useState } from 'react';
import { Form, InputNumber, message, Tooltip } from 'antd';
import { DatabaseOutlined, InfoCircleOutlined } from '@ant-design/icons';
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
    const [storageLoading, setStorageLoading] = useState(false);
    const [storageForm] = Form.useForm();

    const fetchStorageConfig = async () => {
        try {
            const config = await ApiClient.getSystemConfig();
            storageForm.setFieldsValue({
                log_retention_system_days: config.log_retention_system_days || 7,
                log_retention_business_days: config.log_retention_business_days || 30,
                log_retention_ai_days: config.log_retention_ai_days || 30,
                log_retention_iam_days: config.log_retention_iam_days || 90,
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
            message.success('存储策略已保存');
        } catch (error) {
            message.error('保存失败');
        } finally {
            setStorageLoading(false);
        }
    };

    const handleOptimize = async () => {
        message.loading({ content: '正在优化数据库，这可能需要几秒钟...', key: 'opt' });
        try {
            await ApiClient.optimizeStorage();
            message.success({ content: '优化完成！已回收未使用的磁盘空间。', key: 'opt' });
        } catch (error) {
            message.error({ content: '优化失败', key: 'opt' });
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-700 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-6 min-h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">存储设置</h2>
                    <p className="text-xs text-slate-400 font-bold mt-1">配置各类型日志的保留周期与磁盘占用限制</p>
                </div>
                <AppButton intent="secondary" icon={<DatabaseOutlined />} onClick={handleOptimize}>立即优化</AppButton>
            </div>

            {/* Database Storage Policy Card */}
            <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-8 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700/50 mb-6">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center">
                        <span className="w-1 h-6 bg-blue-500 rounded-full mr-3"></span>
                        数据库存储策略 (Hot Storage)
                    </h3>
                    <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-3 py-1 rounded-lg text-xs font-medium">
                        结构化查询数据
                    </div>
                </div>

                <Form
                    form={storageForm}
                    layout="vertical"
                    onFinish={handleSaveStorage}
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4"
                >
                    {/* 系统日志 */}
                    <Form.Item
                        name="log_retention_system_days"
                        label={
                            <span className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                                系统日志
                                <Tooltip title="系统运行日志、错误堆栈等">
                                    <InfoCircleOutlined className="text-slate-400" />
                                </Tooltip>
                            </span>
                        }
                        rules={[{ required: true, message: '请输入保留天数' }]}
                    >
                        <InputNumber min={1} max={365} addonAfter="天" className="w-full rounded-xl" />
                    </Form.Item>

                    {/* 业务日志 */}
                    <Form.Item
                        name="log_retention_business_days"
                        label={
                            <span className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                业务审计
                                <Tooltip title="用户操作审计、内容变更等">
                                    <InfoCircleOutlined className="text-slate-400" />
                                </Tooltip>
                            </span>
                        }
                        rules={[{ required: true, message: '请输入保留天数' }]}
                    >
                        <InputNumber min={1} max={365} addonAfter="天" className="w-full rounded-xl" />
                    </Form.Item>

                    {/* AI 审计 */}
                    <Form.Item
                        name="log_retention_ai_days"
                        label={
                            <span className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                                AI 审计
                                <Tooltip title="AI 对话、生成记录、Token 消耗等">
                                    <InfoCircleOutlined className="text-slate-400" />
                                </Tooltip>
                            </span>
                        }
                        rules={[{ required: true, message: '请输入保留天数' }]}
                    >
                        <InputNumber min={1} max={365} addonAfter="天" className="w-full rounded-xl" />
                    </Form.Item>

                    {/* IAM 与登录审计 */}
                    <Form.Item
                        name="log_retention_iam_days"
                        label={
                            <span className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                                IAM 与登录审计
                                <Tooltip title="包含用户登录、角色分配、权限变更等">
                                    <InfoCircleOutlined className="text-slate-400" />
                                </Tooltip>
                            </span>
                        }
                        rules={[{ required: true, message: '请输入保留天数' }]}
                    >
                        <InputNumber min={1} max={365} addonAfter="天" className="w-full rounded-xl" />
                    </Form.Item>



                    {/* Placeholder for grid alignment if needed */}
                    <div className="hidden lg:block"></div>

                    {/* 磁盘占用 - 单独一行 */}
                    <div className="col-span-1 md:col-span-2 lg:col-span-3 mt-4 border-t border-slate-100 dark:border-slate-700/50 pt-6">
                        <div className="flex items-center mb-4">
                            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">数据库磁盘安全阈值</h4>
                        </div>
                        <Form.Item
                            name="log_max_disk_usage"
                            label={
                                <span className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                    最大磁盘占用
                                    <Tooltip title="超出后将自动删除最早的日志，直到磁盘占用降至设定值以下">
                                        <InfoCircleOutlined className="text-slate-400" />
                                    </Tooltip>
                                </span>
                            }
                            rules={[{ required: true, message: '请输入百分比' }]}
                            className="max-w-md"
                        >
                            <InputNumber min={50} max={95} addonAfter="%" className="w-full rounded-xl" />
                        </Form.Item>
                    </div>

                    {/* 提交按钮 */}
                    <div className="col-span-1 md:col-span-2 lg:col-span-3 flex justify-end pt-4">
                        <AppButton intent="primary" htmlType="submit" loading={storageLoading}>保存数据库策略</AppButton>
                    </div>
                </Form>
            </div>

            {/* File/Object Storage Info Card */}
            <div className="bg-slate-100 dark:bg-slate-800/50 rounded-[1.5rem] p-8 border border-slate-200 dark:border-slate-700/50">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center">
                        <span className="w-1 h-6 bg-slate-400 rounded-full mr-3"></span>
                        文件与对象存储 (Warm/Cold Storage)
                    </h3>
                    <div className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-3 py-1 rounded-lg text-xs font-medium">
                        只读归档数据
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                        <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-2">
                            <DatabaseOutlined /> Access Logs (访问日志)
                        </h4>
                        <p className="text-slate-500 dark:text-slate-400 mb-2">
                            HTTP 请求产生的海量访问日志不存储在数据库中，而是流式传输至 <strong>Loki</strong> 文件存储。
                        </p>
                        <div className="text-xs text-slate-400 mt-2 p-2 bg-slate-50 dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-800 font-mono">
                            Retention Policy: Managed by Loki config (default: 30d)
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                        <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-2">
                            <DatabaseOutlined /> Archive Data (原始归档)
                        </h4>
                        <p className="text-slate-500 dark:text-slate-400 mb-2">
                            长期未访问的历史日志和非结构化数据可能会归档至 <strong>MinIO</strong> 对象存储。
                        </p>
                        <div className="text-xs text-slate-400 mt-2 p-2 bg-slate-50 dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-800 font-mono">
                            Lifecycle Rule: Managed by Bucket Policy
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LogStorage;
