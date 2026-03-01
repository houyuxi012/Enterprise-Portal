import React from 'react';
import { Tag } from 'antd';
import type { TagProps } from 'antd';

export type TagStatus = 'success' | 'warning' | 'error' | 'info' | 'default' | 'processing';

export interface AppTagProps extends Omit<TagProps, 'color'> {
    /** 预设状态，自动映射颜色 */
    status?: TagStatus;
    /** 自定义颜色（优先级高于 status） */
    color?: string;
}

const statusColorMap: Record<TagStatus, string> = {
    success: 'green',
    warning: 'gold',
    error: 'red',
    info: 'blue',
    default: 'default',
    processing: 'processing',
};

/**
 * AppTag - 统一标签组件
 * 
 * 特性：
 * - 提供预设状态：success | warning | error | info | default | processing
 * - 统一 borderRadius 和 padding
 */
const AppTag: React.FC<AppTagProps> = ({
    status = 'default',
    color,
    className = '',
    children,
    ...rest
}) => {
    const tagColor = color ?? statusColorMap[status];

    return (
        <Tag
            color={tagColor}
            className={`app-tag ${className}`.trim()}
            {...rest}
        >
            {children}
        </Tag>
    );
};

export default AppTag;
