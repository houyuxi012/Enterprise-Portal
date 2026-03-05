import React from 'react';

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
        <div className={`app-page-header flex justify-between items-center mb-6 ${className}`.trim()}>
            <div className="flex-1">
                <h1 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight m-0">
                    {title}
                </h1>
                {subtitle && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-0">
                        {subtitle}
                    </p>
                )}
            </div>
            {action && <div className="flex-shrink-0">{action}</div>}
        </div>
    );
};

export default AppPageHeader;
