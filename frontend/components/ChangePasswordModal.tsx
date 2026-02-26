import React, { useState } from 'react';
import { Modal, Form, Input, Button, message } from 'antd';
import ApiClient from '../services/api';
import { Key, Lock, CheckCircle } from 'lucide-react';

interface ChangePasswordModalProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ open, onClose, onSuccess }) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (values: any) => {
        if (values.newPassword !== values.confirmPassword) {
            message.error("两次输入的新密码不一致");
            return;
        }

        setLoading(true);
        try {
            await ApiClient.changeMyPassword({
                old_password: values.oldPassword,
                new_password: values.newPassword
            });
            message.success('密码修改成功，请使用新密码重新登录');
            form.resetFields();
            onSuccess();
        } catch (error: any) {
            const detail = error.response?.data?.detail || '修改密码失败';
            message.error(detail);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            title={
                <div className="flex items-center gap-2">
                    <Key size={18} className="text-blue-500" />
                    <span>修改密码</span>
                </div>
            }
            open={open}
            onCancel={() => {
                form.resetFields();
                onClose();
            }}
            footer={[
                <Button key="cancel" onClick={() => {
                    form.resetFields();
                    onClose();
                }} disabled={loading}>
                    取消
                </Button>,
                <Button key="submit" type="primary" loading={loading} onClick={() => form.submit()}>
                    确定
                </Button>
            ]}
            destroyOnClose
            centered
            width={480}
        >
            <div className="pt-4">
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                    requiredMark={false}
                >
                    <Form.Item
                        label={<span className="font-medium text-slate-700 dark:text-slate-300">原密码</span>}
                        name="oldPassword"
                        rules={[{ required: true, message: '请输入原密码' }]}
                    >
                        <Input.Password
                            prefix={<Lock size={16} className="text-slate-400 mr-1" />}
                            placeholder="请输入当前使用的密码"
                            size="large"
                            className="rounded-lg"
                        />
                    </Form.Item>

                    <Form.Item
                        label={<span className="font-medium text-slate-700 dark:text-slate-300">新密码</span>}
                        name="newPassword"
                        rules={[
                            { required: true, message: '请输入新密码' },
                            { min: 6, message: '新密码不能少于 6 位' }
                        ]}
                        help={<span className="text-xs text-slate-500">新密码必须符合后台配置的密码安全策略要求。</span>}
                    >
                        <Input.Password
                            prefix={<CheckCircle size={16} className="text-slate-400 mr-1" />}
                            placeholder="请输入新密码"
                            size="large"
                            className="rounded-lg"
                        />
                    </Form.Item>

                    <Form.Item
                        label={<span className="font-medium text-slate-700 dark:text-slate-300">确认新密码</span>}
                        name="confirmPassword"
                        rules={[{ required: true, message: '请再次输入新密码以确认' }]}
                    >
                        <Input.Password
                            prefix={<CheckCircle size={16} className="text-slate-400 mr-1" />}
                            placeholder="请再次输入新密码"
                            size="large"
                            className="rounded-lg"
                        />
                    </Form.Item>
                </Form>
            </div>
        </Modal>
    );
};

export default ChangePasswordModal;
