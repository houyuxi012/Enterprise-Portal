import React from 'react';
import { Flex, Typography } from 'antd';

export interface AppPageHeaderProps {
    /** 页面标题 */
    title: string;
    /** 副标题/描述 */
    subtitle?: string;
    /** 右侧操作区域 */
    action?: React.ReactNode;
    /** 自定义类名 */
    className?: string;
}

/**
 * AppPageHeader - 统一页面头部组件
 * 
 * 用于管理页面顶部，包含标题、副标题和操作按钮
 * 
 * @example
 * ```tsx
 * <AppPageHeader
 *   title="用户管理"
 *   subtitle="管理系统用户账户与权限"
 *   action={<AppButton intent="primary" icon={<PlusOutlined />}>新增用户</AppButton>}
 * />
 * ```
 */
const AppPageHeader: React.FC<AppPageHeaderProps> = ({
    title,
    subtitle,
    action,
    className = '',
}) => {
    return (
        <Flex
            align="flex-start"
            justify="space-between"
            gap={16}
            wrap
            className={`app-page-header ${className}`.trim()}
        >
            <div className="app-page-header__content">
                <Typography.Title level={2} className="app-page-header__title">
                    {title}
                </Typography.Title>
                {subtitle ? (
                    <Typography.Paragraph className="app-page-header__subtitle">
                        {subtitle}
                    </Typography.Paragraph>
                ) : null}
            </div>
            {action ? <div className="app-page-header__action">{action}</div> : null}
        </Flex>
    );
};

export default AppPageHeader;
