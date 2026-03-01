import React, { useState } from 'react';
import { Modal, Form, Input, Button, message } from 'antd';
import ApiClient from '../services/api';
import { Key, Lock, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ChangePasswordModalProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
    forceMode?: boolean;
}

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ open, onClose, onSuccess, forceMode = false }) => {
    const { t } = useTranslation();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (values: any) => {
        if (values.newPassword !== values.confirmPassword) {
            message.error(t('changePasswordModal.messages.passwordMismatch'));
            return;
        }

        setLoading(true);
        try {
            await ApiClient.changeMyPassword({
                old_password: values.oldPassword,
                new_password: values.newPassword
            });
            message.success(t('changePasswordModal.messages.changeSuccess'));
            form.resetFields();
            onSuccess();
        } catch (error: any) {
            const detail = error.response?.data?.detail || t('changePasswordModal.messages.changeFailed');
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
                    <span>{t('changePasswordModal.title')}</span>
                </div>
            }
            open={open}
            onCancel={() => {
                if (forceMode) return;
                form.resetFields();
                onClose();
            }}
            closable={!forceMode}
            maskClosable={!forceMode}
            keyboard={!forceMode}
            footer={forceMode ? [
                <Button key="submit" type="primary" loading={loading} onClick={() => form.submit()}>
                    {t('common.buttons.confirm')}
                </Button>
            ] : [
                <Button key="cancel" onClick={() => {
                    form.resetFields();
                    onClose();
                }} disabled={loading}>
                    {t('common.buttons.cancel')}
                </Button>,
                <Button key="submit" type="primary" loading={loading} onClick={() => form.submit()}>
                    {t('common.buttons.confirm')}
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
                        label={<span className="font-medium text-slate-700 dark:text-slate-300">{t('changePasswordModal.form.oldPassword')}</span>}
                        name="oldPassword"
                        rules={[{ required: true, message: t('changePasswordModal.validation.oldPasswordRequired') }]}
                    >
                        <Input.Password
                            prefix={<Lock size={16} className="text-slate-400 mr-1" />}
                            placeholder={t('changePasswordModal.form.placeholders.oldPassword')}
                            size="large"
                            className="rounded-lg"
                        />
                    </Form.Item>

                    <Form.Item
                        label={<span className="font-medium text-slate-700 dark:text-slate-300">{t('changePasswordModal.form.newPassword')}</span>}
                        name="newPassword"
                        rules={[
                            { required: true, message: t('changePasswordModal.validation.newPasswordRequired') },
                            { min: 6, message: t('changePasswordModal.validation.newPasswordMin') }
                        ]}
                        help={<span className="text-xs text-slate-500">{t('changePasswordModal.form.newPasswordHelp')}</span>}
                    >
                        <Input.Password
                            prefix={<CheckCircle size={16} className="text-slate-400 mr-1" />}
                            placeholder={t('changePasswordModal.form.placeholders.newPassword')}
                            size="large"
                            className="rounded-lg"
                        />
                    </Form.Item>

                    <Form.Item
                        label={<span className="font-medium text-slate-700 dark:text-slate-300">{t('changePasswordModal.form.confirmPassword')}</span>}
                        name="confirmPassword"
                        rules={[{ required: true, message: t('changePasswordModal.validation.confirmPasswordRequired') }]}
                    >
                        <Input.Password
                            prefix={<CheckCircle size={16} className="text-slate-400 mr-1" />}
                            placeholder={t('changePasswordModal.form.placeholders.confirmPassword')}
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
