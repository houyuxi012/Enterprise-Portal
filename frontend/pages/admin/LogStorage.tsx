
import React, { useEffect, useState } from 'react';
import { Button, Form, Input, message } from 'antd';
import { DatabaseOutlined } from '@ant-design/icons';
import ApiClient from '../../services/api';

const LogStorage: React.FC = () => {
    const [storageLoading, setStorageLoading] = useState(false);
    const [storageForm] = Form.useForm();

    const fetchStorageConfig = async () => {
        try {
            const config = await ApiClient.getSystemConfig();
            storageForm.setFieldsValue({
                log_retention_days: config.log_retention_days || 30,
                log_max_disk_usage: config.log_max_disk_usage || 80
            });
        } catch (error) {
            console.error("Failed to load storage config");
        }
    };

    useEffect(() => {
        fetchStorageConfig();
    }, []);

    const handleSaveStorage = async (values: any) => {
        setStorageLoading(true);
        try {
            await ApiClient.updateSystemConfig({
                log_retention_days: String(values.log_retention_days),
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
                    <p className="text-xs text-slate-400 font-bold mt-1">配置系统日志的保留策略与磁盘占用限制</p>
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
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center">
                    <span className="w-1 h-6 bg-blue-500 rounded-full mr-3"></span>
                    存储策略配置
                </h3>
                <Form
                    form={storageForm}
                    layout="vertical"
                    onFinish={handleSaveStorage}
                    className="grid grid-cols-1 md:grid-cols-2 gap-6"
                >
                    <Form.Item
                        name="log_retention_days"
                        label="日志保留时间 (天)"
                        extra="超过此时间的日志将被自动删除"
                        rules={[{ required: true, message: '请输入保留天数' }]}
                    >
                        <Input type="number" suffix="天" className="rounded-xl" />
                    </Form.Item>
                    <Form.Item
                        name="log_max_disk_usage"
                        label="最大磁盘占用 (%)"
                        extra="当磁盘使用率超过此值时，将自动删除最早一天的日志"
                        rules={[{ required: true, message: '请输入百分比' }]}
                    >
                        <Input type="number" suffix="%" max={100} min={1} className="rounded-xl" />
                    </Form.Item>

                    <div className="md:col-span-2 flex justify-end">
                        <Button type="primary" htmlType="submit" loading={storageLoading} className="rounded-xl px-8 font-bold bg-blue-600">
                            保存策略
                        </Button>
                    </div>
                </Form>
            </div>
        </div>
    );
};

export default LogStorage;
