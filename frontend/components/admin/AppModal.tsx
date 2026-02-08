import React from 'react';
import { Modal } from 'antd';
import type { ModalProps } from 'antd';
import AppButton from './AppButton';

export interface AppModalProps extends Omit<ModalProps, 'okText' | 'cancelText'> {
    /** 确认按钮文字，默认 "确定" */
    okText?: string;
    /** 取消按钮文字，默认 "取消" */
    cancelText?: string;
    /** 确认按钮 loading */
    confirmLoading?: boolean;
    /** 是否隐藏底部按钮 */
    hideFooter?: boolean;
    /** 是否为危险操作（确认按钮变红） */
    danger?: boolean;
}

/**
 * AppModal - 统一弹窗组件
 * 
 * 特性：
 * - 统一 footer 按钮样式（取消用 secondary，确认用 primary）
 * - 统一圆角和标题样式
 * - 支持危险操作模式
 */
const AppModal: React.FC<AppModalProps> = ({
    okText = '确定',
    cancelText = '取消',
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
    const defaultFooter = hideFooter
        ? null
        : footer ?? [
            <AppButton key="cancel" intent="secondary" onClick={onCancel}>
                {cancelText}
            </AppButton>,
            <AppButton
                key="ok"
                intent={danger ? 'danger' : 'primary'}
                loading={confirmLoading}
                onClick={onOk}
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
