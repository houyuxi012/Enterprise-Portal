
import React, { useEffect, useState } from 'react';
import { Button, Form, InputNumber, message, Tooltip } from 'antd';
import { DatabaseOutlined, InfoCircleOutlined } from '@ant-design/icons';
import ApiClient from '../../services/api';

interface StorageConfig {
    log_retention_system_days: number;
    log_retention_business_days: number;
    log_retention_login_days: number;
    log_retention_ai_days: number;
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
                log_retention_login_days: config.log_retention_login_days || 90,
                log_retention_ai_days: config.log_retention_ai_days || 30,
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
                log_retention_login_days: String(values.log_retention_login_days),
                log_retention_ai_days: String(values.log_retention_ai_days),
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
                <Button
                    icon={<DatabaseOutlined />}
                    onClick={handleOptimize}
                    className="rounded-xl px-4 border-slate-200 shadow-sm font-bold text-slate-600 hover:text-green-600 hover:border-green-200"
                >
                    立即优化
                </Button>
            </div>

            {/* Storage Policy Card */}
            <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-8 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700/50 mb-6">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6 flex items-center">
                    <span className="w-1 h-6 bg-blue-500 rounded-full mr-3"></span>
                    日志保留策略
                </h3>
                <Form
                    form={storageForm}
                    layout="vertical"
                    onFinish={handleSaveStorage}
                    className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4"
                >
                    {/* 系统日志 */}
                    <Form.Item
                        name="log_retention_system_days"
                        label={
                            <span className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                                系统日志保留周期
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
                                业务审计保留周期
                                <Tooltip title="用户操作审计、内容变更等">
                                    <InfoCircleOutlined className="text-slate-400" />
                                </Tooltip>
                            </span>
                        }
                        rules={[{ required: true, message: '请输入保留天数' }]}
                    >
                        <InputNumber min={1} max={365} addonAfter="天" className="w-full rounded-xl" />
                    </Form.Item>

                    {/* 登录审计 */}
                    <Form.Item
                        name="log_retention_login_days"
                        label={
                            <span className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                登录审计保留周期
                                <Tooltip title="登录/登出记录、失败尝试等">
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
                                AI 审计保留周期
                                <Tooltip title="AI 对话、生成记录、Token 消耗等">
                                    <InfoCircleOutlined className="text-slate-400" />
                                </Tooltip>
                            </span>
                        }
                        rules={[{ required: true, message: '请输入保留天数' }]}
                    >
                        <InputNumber min={1} max={365} addonAfter="天" className="w-full rounded-xl" />
                    </Form.Item>

                    {/* 磁盘占用 */}
                    <Form.Item
                        name="log_max_disk_usage"
                        label={
                            <span className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                                最大磁盘占用
                                <Tooltip title="超出后将自动删除最早的日志，直到磁盘占用降至设定值以下">
                                    <InfoCircleOutlined className="text-slate-400" />
                                </Tooltip>
                            </span>
                        }
                        rules={[{ required: true, message: '请输入百分比' }]}
                    >
                        <InputNumber min={50} max={95} addonAfter="%" className="w-full rounded-xl" />
                    </Form.Item>

                    {/* 提交按钮 */}
                    <div className="md:col-span-2 flex justify-end pt-4">
                        <Button type="primary" htmlType="submit" loading={storageLoading} className="rounded-xl px-8 font-bold bg-blue-600">
                            保存策略
                        </Button>
                    </div>
                </Form>
            </div>

            {/* Info Card */}
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-700/50">
                <div className="flex items-start gap-3">
                    <InfoCircleOutlined className="text-amber-500 text-lg mt-0.5" />
                    <div className="text-sm text-amber-700 dark:text-amber-300">
                        <strong>访问日志</strong>存储在 Loki 中，其保留周期由 <code className="bg-amber-100 dark:bg-amber-800/50 px-1 rounded">loki-config.yaml</code> 的 <code className="bg-amber-100 dark:bg-amber-800/50 px-1 rounded">retention_period</code> 配置控制（当前为 7 天）。
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LogStorage;
