import React, { useState } from 'react';
import { Modal, Form, Input, message } from 'antd';
import ApiClient from '../services/api';
import { KeyOutlined, LockOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

interface AdminChangePasswordModalProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
    forceMode?: boolean;
}

const AdminChangePasswordModal: React.FC<AdminChangePasswordModalProps> = ({ open, onClose, onSuccess, forceMode = false }) => {
    const { t } = useTranslation();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (values: any) => {
        if (values.newPassword !== values.confirmPassword) {
            message.error(t('adminChangePassword.messages.passwordMismatch'));
            return;
        }

        setLoading(true);
        try {
            await ApiClient.changeMyPassword({
                old_password: values.oldPassword,
                new_password: values.newPassword
            });
            message.success(t('adminChangePassword.messages.changeSuccess'));
            form.resetFields();
            onSuccess();
        } catch (error: any) {
            const detail = error.response?.data?.detail || t('adminChangePassword.messages.changeFailed');
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
                    <span>{t('adminChangePassword.title')}</span>
                </div>
            }
            open={open}
            onCancel={() => {
                if (forceMode) return;
                form.resetFields();
                onClose();
            }}
            onOk={() => form.submit()}
            confirmLoading={loading}
            closable={!forceMode}
            maskClosable={!forceMode}
            keyboard={!forceMode}
            destroyOnClose
            centered
            width={480}
            okText={t('adminChangePassword.actions.confirm')}
            cancelButtonProps={forceMode ? { style: { display: 'none' } } : undefined}
            cancelText={t('common.buttons.cancel')}
        >
            <div className="pt-4">
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                    requiredMark={false}
                >
                    <Form.Item
                        label={t('adminChangePassword.form.oldPassword')}
                        name="oldPassword"
                        rules={[{ required: true, message: t('adminChangePassword.validation.oldPasswordRequired') }]}
                    >
                        <Input.Password
                            prefix={<LockOutlined className="text-slate-400 mr-1" />}
                            placeholder={t('adminChangePassword.form.placeholders.oldPassword')}
                            size="large"
                        />
                    </Form.Item>

                    <Form.Item
                        label={t('adminChangePassword.form.newPassword')}
                        name="newPassword"
                        rules={[
                            { required: true, message: t('adminChangePassword.validation.newPasswordRequired') },
                            { min: 6, message: t('adminChangePassword.validation.newPasswordMin') }
                        ]}
                        help={t('adminChangePassword.form.newPasswordHelp')}
                    >
                        <Input.Password
                            prefix={<CheckCircleOutlined className="text-slate-400 mr-1" />}
                            placeholder={t('adminChangePassword.form.placeholders.newPassword')}
                            size="large"
                        />
                    </Form.Item>

                    <Form.Item
                        label={t('adminChangePassword.form.confirmPassword')}
                        name="confirmPassword"
                        rules={[{ required: true, message: t('adminChangePassword.validation.confirmPasswordRequired') }]}
                    >
                        <Input.Password
                            prefix={<CheckCircleOutlined className="text-slate-400 mr-1" />}
                            placeholder={t('adminChangePassword.form.placeholders.confirmPassword')}
                            size="large"
                        />
                    </Form.Item>
                </Form>
            </div>
        </Modal>
    );
};

export default AdminChangePasswordModal;
