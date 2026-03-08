import React, { useMemo, useState } from 'react';
import { Alert, App, Form, Input, Modal, Space, Typography, theme } from 'antd';
import ApiClient from '@/shared/services/api';
import { CheckCircleOutlined, KeyOutlined, LockOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';

interface AdminChangePasswordModalProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
    forceMode?: boolean;
}

type ChangePasswordFormValues = {
    oldPassword: string;
    newPassword: string;
    confirmPassword: string;
};

type ApiErrorShape = {
    response?: {
        data?: {
            detail?: string | { message?: string };
        };
    };
};

const resolveApiErrorMessage = (error: unknown, fallback: string): string => {
    const detail = (error as ApiErrorShape | undefined)?.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) {
        return detail;
    }
    if (detail && typeof detail === 'object' && typeof detail.message === 'string' && detail.message.trim()) {
        return detail.message;
    }
    return fallback;
};

const AdminChangePasswordModal: React.FC<AdminChangePasswordModalProps> = ({
    open,
    onClose,
    onSuccess,
    forceMode = false,
}) => {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [form] = Form.useForm<ChangePasswordFormValues>();
    const [loading, setLoading] = useState(false);
    const { user, refreshCurrentUser } = useAuth();
    const { token } = theme.useToken();

    const isManagedExternally = ['ldap', 'ad', 'oidc'].includes(user?.auth_source || 'local');
    const titleText = forceMode
        ? t('adminChangePassword.forceMode.title', { defaultValue: '首次登录修改密码' })
        : t('adminChangePassword.title');
    const headerIconStyle = useMemo(
        () => ({
            color: token.colorPrimary,
            background: token.colorPrimaryBg,
            borderRadius: token.borderRadiusSM,
            padding: 8,
            fontSize: 16,
        }),
        [token.colorPrimary, token.colorPrimaryBg, token.borderRadiusSM],
    );

    const handleSubmit = async (values: ChangePasswordFormValues) => {
        setLoading(true);
        try {
            await ApiClient.changeMyPassword({
                old_password: values.oldPassword,
                new_password: values.newPassword,
            });
            await refreshCurrentUser();
            message.success(t('adminChangePassword.messages.changeSuccess'));
            form.resetFields();
            onSuccess();
        } catch (error: unknown) {
            const errorMsg = resolveApiErrorMessage(
                error,
                t('adminChangePassword.messages.changeFailed'),
            );
            message.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        if (forceMode) return;
        form.resetFields();
        onClose();
    };

    return (
        <Modal
            title={
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <Space size={12} align="start">
                        <KeyOutlined style={headerIconStyle} />
                        <Typography.Text strong style={{ fontSize: token.fontSizeLG }}>
                            {titleText}
                        </Typography.Text>
                    </Space>
                </Space>
            }
            open={open}
            onCancel={handleClose}
            onOk={() => form.submit()}
            confirmLoading={loading}
            closable={!forceMode}
            maskClosable={!forceMode}
            keyboard={!forceMode}
            destroyOnClose
            centered
            width={560}
            okText={t('adminChangePassword.actions.confirm')}
            cancelButtonProps={forceMode ? { style: { display: 'none' } } : undefined}
            cancelText={t('common.buttons.cancel')}
            okButtonProps={{
                size: 'large',
                disabled: isManagedExternally,
            }}
            styles={{
                header: {
                    paddingBottom: token.paddingXS,
                },
                body: {
                    paddingTop: token.paddingSM,
                },
                footer: {
                    marginTop: token.marginSM,
                },
            }}
            afterOpenChange={(visible) => {
                if (!visible) {
                    form.resetFields();
                }
            }}
        >
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
                {isManagedExternally ? (
                    <Alert
                        showIcon
                        type="info"
                        icon={<LockOutlined />}
                        message={t('adminChangePassword.messages.managedExternallyTitle', { defaultValue: '目录托管账户' })}
                        description={t('adminChangePassword.messages.managedExternally', {
                            defaultValue: '该账户由目录服务管理，请在AD/LDAP中修改密码',
                        })}
                    />
                ) : (
                    <Form<ChangePasswordFormValues>
                        form={form}
                        layout="vertical"
                        onFinish={handleSubmit}
                        requiredMark={false}
                        colon={false}
                    >
                        <Form.Item
                            label={t('adminChangePassword.form.oldPassword')}
                            name="oldPassword"
                            rules={[{ required: true, message: t('adminChangePassword.validation.oldPasswordRequired') }]}
                        >
                            <Input.Password
                                autoComplete="current-password"
                                prefix={<LockOutlined style={{ color: token.colorTextTertiary }} />}
                                placeholder={t('adminChangePassword.form.placeholders.oldPassword')}
                                size="large"
                            />
                        </Form.Item>

                        <Form.Item
                            label={t('adminChangePassword.form.newPassword')}
                            name="newPassword"
                            rules={[
                                { required: true, message: t('adminChangePassword.validation.newPasswordRequired') },
                                { min: 6, message: t('adminChangePassword.validation.newPasswordMin') },
                            ]}
                            extra={t('adminChangePassword.form.newPasswordHelp')}
                        >
                            <Input.Password
                                autoComplete="new-password"
                                prefix={<CheckCircleOutlined style={{ color: token.colorTextTertiary }} />}
                                placeholder={t('adminChangePassword.form.placeholders.newPassword')}
                                size="large"
                            />
                        </Form.Item>

                        <Form.Item
                            label={t('adminChangePassword.form.confirmPassword')}
                            name="confirmPassword"
                            dependencies={['newPassword']}
                            rules={[
                                {
                                    required: true,
                                    message: t('adminChangePassword.validation.confirmPasswordRequired'),
                                },
                                ({ getFieldValue }) => ({
                                    validator(_, value: string) {
                                        if (!value || getFieldValue('newPassword') === value) {
                                            return Promise.resolve();
                                        }
                                        return Promise.reject(
                                            new Error(t('adminChangePassword.messages.passwordMismatch')),
                                        );
                                    },
                                }),
                            ]}
                        >
                            <Input.Password
                                autoComplete="new-password"
                                prefix={<CheckCircleOutlined style={{ color: token.colorTextTertiary }} />}
                                placeholder={t('adminChangePassword.form.placeholders.confirmPassword')}
                                size="large"
                            />
                        </Form.Item>
                    </Form>
                )}
            </Space>
        </Modal>
    );
};

export default AdminChangePasswordModal;
