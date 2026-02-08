import React from 'react';
import { Drawer } from 'antd';
import type { DrawerProps } from 'antd';
import AppButton from './AppButton';

export interface AppDrawerProps extends Omit<DrawerProps, 'width'> {
    /** 抽屉宽度，默认 520 */
    width?: number | string;
    /** 确认按钮文字 */
    okText?: string;
    /** 取消按钮文字 */
    cancelText?: string;
    /** 确认按钮 loading */
    confirmLoading?: boolean;
    /** 是否隐藏底部按钮 */
    hideFooter?: boolean;
    /** 确认回调 */
    onOk?: () => void;
}

/**
 * AppDrawer - 统一抽屉组件
 * 
 * 特性：
 * - 统一宽度 (default: 520px)
 * - 统一 footer 样式
 * - 统一圆角
 */
const AppDrawer: React.FC<AppDrawerProps> = ({
    width = 520,
    okText = '确定',
    cancelText = '取消',
    confirmLoading = false,
    hideFooter = false,
    footer,
    className = '',
    children,
    onClose,
    onOk,
    ...rest
}) => {
    const defaultFooter = hideFooter
        ? null
        : footer ?? (
            <div className="flex justify-end gap-3">
                <AppButton intent="secondary" onClick={onClose as any}>
                    {cancelText}
                </AppButton>
                <AppButton intent="primary" loading={confirmLoading} onClick={onOk}>
                    {okText}
                </AppButton>
            </div>
        );

    return (
        <Drawer
            className={`app-drawer ${className}`.trim()}
            width={width}
            footer={defaultFooter}
            onClose={onClose}
            destroyOnHidden
            {...rest}
        >
            {children}
        </Drawer>
    );
};

export default AppDrawer;
