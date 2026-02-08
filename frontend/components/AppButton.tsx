import React from 'react';
import { Button } from 'antd';
import type { ButtonProps } from 'antd';

export type ButtonIntent = 'primary' | 'secondary' | 'tertiary' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface AppButtonProps extends Omit<ButtonProps, 'type' | 'danger' | 'size'> {
    intent?: ButtonIntent;
    iconOnly?: boolean;
    size?: ButtonSize;
}

const sizeMap: Record<ButtonSize, ButtonProps['size']> = {
    sm: 'small',
    md: 'middle',
    lg: 'large',
};

/**
 * AppButton - 统一按钮组件
 * 
 * 使用规范：
 * - primary: 页面主操作按钮，每页最多一个
 * - secondary: 次要操作（取消、返回等）
 * - tertiary: 表格操作列、链接式按钮
 * - danger: 删除、危险操作
 * - iconOnly: 表格操作列专用，仅显示图标
 */
const AppButton: React.FC<AppButtonProps> = ({
    intent = 'secondary',
    iconOnly = false,
    size = 'md',
    className = '',
    ...rest
}) => {
    // Map intent to Ant Design Button props
    const getButtonProps = (): Partial<ButtonProps> => {
        switch (intent) {
            case 'primary':
                return { type: 'primary' };
            case 'secondary':
                return { type: 'default' };
            case 'tertiary':
                return { type: 'text' };
            case 'danger':
                return { type: 'primary', danger: true };
            default:
                return { type: 'default' };
        }
    };

    const buttonProps = getButtonProps();
    const antSize = sizeMap[size];

    // iconOnly styling
    const iconOnlyClass = iconOnly ? 'px-2' : '';

    return (
        <Button
            {...buttonProps}
            size={antSize}
            className={`${iconOnlyClass} ${className}`.trim()}
            {...rest}
        />
    );
};

export default AppButton;
