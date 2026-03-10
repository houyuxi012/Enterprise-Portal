import React from 'react';
import { Modal } from 'antd';
import type { ModalProps } from 'antd';
import AppButton from './AppButton';
import i18n from '@/i18n';

export interface AppModalProps extends Omit<ModalProps, 'okText' | 'cancelText'> {
    /** Confirm button text */
    okText?: string;
    /** Cancel button text */
    cancelText?: string;
    /** Confirm button loading state */
    confirmLoading?: boolean;
    /** Hide footer actions */
    hideFooter?: boolean;
    /** Danger mode (confirm button is red) */
    danger?: boolean;
}

const AppModal: React.FC<AppModalProps> = ({
    okText = i18n.t('common.buttons.confirm', { defaultValue: 'Confirm' }),
    cancelText = i18n.t('common.buttons.cancel', { defaultValue: 'Cancel' }),
    confirmLoading = false,
    hideFooter = false,
    danger = false,
    footer,
    className = '',
    children,
    onOk,
    onCancel,
    ...rest
}) => {
    const handleCancelClick = () => {
        (onCancel as ((event?: unknown) => void) | undefined)?.();
    };

    const handleOkClick = () => {
        (onOk as ((event?: unknown) => void) | undefined)?.();
    };

    const defaultFooter = hideFooter
        ? null
        : footer ?? [
            <AppButton
                key="cancel"
                intent="secondary"
                onClick={handleCancelClick}
            >
                {cancelText}
            </AppButton>,
            <AppButton
                key="ok"
                intent={danger ? 'danger' : 'primary'}
                loading={confirmLoading}
                onClick={handleOkClick}
            >
                {okText}
            </AppButton>,
        ];

    return (
        <Modal
            className={`app-modal ${className}`.trim()}
            footer={defaultFooter}
            onOk={onOk}
            onCancel={onCancel}
            centered
            destroyOnHidden
            {...rest}
        >
            {children}
        </Modal>
    );
};

export default AppModal;
