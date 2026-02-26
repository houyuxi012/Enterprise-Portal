import React, { useState } from 'react';
import { Modal, Form, Input, Button, message } from 'antd';
import ApiClient from '../services/api';
import { KeyOutlined, LockOutlined, CheckCircleOutlined } from '@ant-design/icons';

interface AdminChangePasswordModalProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const AdminChangePasswordModal: React.FC<AdminChangePasswordModalProps> = ({ open, onClose, onSuccess }) => {
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
                    <KeyOutlined className="text-blue-500" />
                    <span>修改管理员密码</span>
                </div>
            }
            open={open}
            onCancel={() => {
                form.resetFields();
                onClose();
            }}
            onOk={() => form.submit()}
            confirmLoading={loading}
            destroyOnClose
            centered
            width={480}
            okText="确认修改"
            cancelText="取消"
        >
            <div className="pt-4">
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                    requiredMark={false}
                >
                    <Form.Item
                        label="原密码"
                        name="oldPassword"
                        rules={[{ required: true, message: '请输入原密码' }]}
                    >
                        <Input.Password
                            prefix={<LockOutlined className="text-slate-400 mr-1" />}
                            placeholder="请输入当前使用的密码"
                            size="large"
                        />
                    </Form.Item>

                    <Form.Item
                        label="新密码"
                        name="newPassword"
                        rules={[
                            { required: true, message: '请输入新密码' },
                            { min: 6, message: '新密码不能少于 6 位' }
                        ]}
                        help="新密码必须符合系统配置的密码安全策略要求"
                    >
                        <Input.Password
                            prefix={<CheckCircleOutlined className="text-slate-400 mr-1" />}
                            placeholder="请输入新密码"
                            size="large"
                        />
                    </Form.Item>

                    <Form.Item
                        label="确认新密码"
                        name="confirmPassword"
                        rules={[{ required: true, message: '请再次输入新密码以确认' }]}
                    >
                        <Input.Password
                            prefix={<CheckCircleOutlined className="text-slate-400 mr-1" />}
                            placeholder="请再次输入新密码"
                            size="large"
                        />
                    </Form.Item>
                </Form>
            </div>
        </Modal>
    );
};

export default AdminChangePasswordModal;
