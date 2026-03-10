import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, Form, Input, Modal, Space, Spin, Typography, theme } from 'antd';
import { CheckCircleOutlined, KeyOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import ApiClient, {
    type PasswordResetValidateResponse,
} from '@/shared/services/api';

type AuthAudience = 'portal' | 'admin';

interface ForgotPasswordModalProps {
    open: boolean;
    audience: AuthAudience;
    resetToken?: string | null;
    initialIdentifier?: string;
    onClose: () => void;
}

type RequestFormValues = {
    identifier: string;
};

type ConfirmFormValues = {
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

const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
    open,
    audience,
    resetToken,
    initialIdentifier,
    onClose,
}) => {
    const { t, i18n } = useTranslation();
    const { message } = App.useApp();
    const { token } = theme.useToken();
    const [requestForm] = Form.useForm<RequestFormValues>();
    const [confirmForm] = Form.useForm<ConfirmFormValues>();
    const [loading, setLoading] = useState(false);
    const [validatingToken, setValidatingToken] = useState(false);
    const [tokenInfo, setTokenInfo] = useState<PasswordResetValidateResponse | null>(null);
    const [tokenError, setTokenError] = useState('');

    const isResetMode = Boolean(resetToken && tokenInfo);
    const title = isResetMode
        ? t('passwordReset.resetTitle')
        : t('passwordReset.requestTitle');
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

    useEffect(() => {
        if (!open) {
            setLoading(false);
            setValidatingToken(false);
            setTokenInfo(null);
            setTokenError('');
            requestForm.resetFields();
            confirmForm.resetFields();
            return;
        }

        requestForm.setFieldsValue({ identifier: initialIdentifier || '' });

        if (!resetToken) {
            setTokenInfo(null);
            setTokenError('');
            return;
        }

        setValidatingToken(true);
        setTokenError('');
        ApiClient.validatePasswordResetToken(resetToken, audience)
            .then((data) => {
                setTokenInfo(data);
            })
            .catch((error: unknown) => {
                setTokenInfo(null);
                setTokenError(
                    resolveApiErrorMessage(
                        error,
                        t('passwordReset.messages.tokenInvalid'),
                    ),
                );
            })
            .finally(() => {
                setValidatingToken(false);
            });
    }, [audience, confirmForm, initialIdentifier, open, requestForm, resetToken, t]);

    const handleRequestSubmit = async (values: RequestFormValues) => {
        setLoading(true);
        try {
            await ApiClient.requestPasswordReset(
                {
                    identifier: values.identifier,
                    locale: i18n.language === 'en-US' ? 'en-US' : 'zh-CN',
                },
                audience,
            );
            message.success(t('passwordReset.messages.requestSuccess'));
            onClose();
        } catch (error: unknown) {
            message.error(resolveApiErrorMessage(error, t('passwordReset.messages.requestFailed')));
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmSubmit = async (values: ConfirmFormValues) => {
        if (!resetToken) {
            setTokenError(t('passwordReset.messages.tokenInvalid'));
            return;
        }
        setLoading(true);
        try {
            await ApiClient.confirmPasswordReset(
                {
                    token: resetToken,
                    new_password: values.newPassword,
                },
                audience,
            );
            message.success(t('passwordReset.messages.resetSuccess'));
            onClose();
        } catch (error: unknown) {
            message.error(resolveApiErrorMessage(error, t('passwordReset.messages.resetFailed')));
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        if (loading || validatingToken) {
            return;
        }
        onClose();
    };

    return (
        <Modal
            open={open}
            onCancel={handleClose}
            onOk={() => {
                if (isResetMode) {
                    confirmForm.submit();
                    return;
                }
                requestForm.submit();
            }}
            confirmLoading={loading}
            width={560}
            destroyOnClose
            centered
            okText={isResetMode ? t('passwordReset.resetSubmit') : t('passwordReset.requestSubmit')}
            cancelText={t('common.buttons.cancel')}
            title={(
                <Space size={12} align="start">
                    <KeyOutlined style={headerIconStyle} />
                    <Typography.Text strong style={{ fontSize: token.fontSizeLG }}>
                        {title}
                    </Typography.Text>
                </Space>
            )}
        >
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
                {validatingToken ? (
                    <div className="flex items-center justify-center py-10">
                        <Spin />
                    </div>
                ) : (
                    <>
                        {tokenError ? (
                            <Alert
                                type="error"
                                showIcon
                                message={t('passwordReset.messages.tokenInvalidTitle')}
                                description={tokenError}
                            />
                        ) : null}

                        {isResetMode && tokenInfo ? (
                            <>
                                <Alert
                                    type="info"
                                    showIcon
                                    message={t('passwordReset.resetHintTitle')}
                                    description={t('passwordReset.resetHintDescription', {
                                        username: tokenInfo.username,
                                        email: tokenInfo.email_masked || '-',
                                        expiresAt: new Date(tokenInfo.expires_at).toLocaleString(),
                                    })}
                                />
                                <Form<ConfirmFormValues>
                                    form={confirmForm}
                                    layout="vertical"
                                    onFinish={handleConfirmSubmit}
                                    requiredMark={false}
                                >
                                    <Form.Item
                                        label={t('passwordReset.form.newPassword')}
                                        name="newPassword"
                                        rules={[
                                            { required: true, message: t('passwordReset.validation.newPasswordRequired') },
                                            { min: 6, message: t('passwordReset.validation.newPasswordMin') },
                                        ]}
                                    >
                                        <Input.Password
                                            autoComplete="new-password"
                                            prefix={<LockOutlined style={{ color: token.colorTextTertiary }} />}
                                            placeholder={t('passwordReset.form.placeholders.newPassword')}
                                            size="large"
                                        />
                                    </Form.Item>
                                    <Form.Item
                                        label={t('passwordReset.form.confirmPassword')}
                                        name="confirmPassword"
                                        dependencies={['newPassword']}
                                        rules={[
                                            {
                                                required: true,
                                                message: t('passwordReset.validation.confirmPasswordRequired'),
                                            },
                                            ({ getFieldValue }) => ({
                                                validator(_, value: string) {
                                                    if (!value || getFieldValue('newPassword') === value) {
                                                        return Promise.resolve();
                                                    }
                                                    return Promise.reject(
                                                        new Error(t('passwordReset.messages.passwordMismatch')),
                                                    );
                                                },
                                            }),
                                        ]}
                                    >
                                        <Input.Password
                                            autoComplete="new-password"
                                            prefix={<CheckCircleOutlined style={{ color: token.colorTextTertiary }} />}
                                            placeholder={t('passwordReset.form.placeholders.confirmPassword')}
                                            size="large"
                                        />
                                    </Form.Item>
                                </Form>
                            </>
                        ) : (
                            <>
                                <Typography.Text type="secondary">
                                    {t('passwordReset.requestDescription')}
                                </Typography.Text>
                                <Form<RequestFormValues>
                                    form={requestForm}
                                    layout="vertical"
                                    onFinish={handleRequestSubmit}
                                    requiredMark={false}
                                >
                                    <Form.Item
                                        label={t('passwordReset.form.identifier')}
                                        name="identifier"
                                        rules={[
                                            { required: true, message: t('passwordReset.validation.identifierRequired') },
                                        ]}
                                    >
                                        <Input
                                            autoComplete="username"
                                            prefix={<MailOutlined style={{ color: token.colorTextTertiary }} />}
                                            placeholder={t('passwordReset.form.placeholders.identifier')}
                                            size="large"
                                        />
                                    </Form.Item>
                                </Form>
                            </>
                        )}
                    </>
                )}
            </Space>
        </Modal>
    );
};

export default ForgotPasswordModal;
