import React from 'react';
import Drawer from 'antd/es/drawer';
import type { DrawerProps } from 'antd/es/drawer';
import AppButton from './AppButton';
import i18n from '@/i18n';

export interface AppDrawerProps extends Omit<DrawerProps, 'width'> {
    /** Drawer width, default 520 */
    width?: number | string;
    /** Confirm button text */
    okText?: string;
    /** Cancel button text */
    cancelText?: string;
    /** Confirm button loading state */
    confirmLoading?: boolean;
    /** Hide footer actions */
    hideFooter?: boolean;
    /** Confirm callback */
    onOk?: () => void;
}

const AppDrawer: React.FC<AppDrawerProps> = ({
    width = 520,
    okText = i18n.t('common.buttons.confirm', { defaultValue: 'Confirm' }),
    cancelText = i18n.t('common.buttons.cancel', { defaultValue: 'Cancel' }),
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
