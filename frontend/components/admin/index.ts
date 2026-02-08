/**
 * Admin Design System - 组件统一导出
 * 
 * 业务页面应从此处导入组件，禁止直接使用 antd 原组件
 */

// 基础组件
export { default as AppButton } from './AppButton';
export type { AppButtonProps, ButtonIntent, ButtonSize } from './AppButton';

export { default as AppTable } from './AppTable';
export type { AppTableProps } from './AppTable';

export { default as AppForm } from './AppForm';
export type { AppFormProps, AppFormItemProps } from './AppForm';

export { default as AppModal } from './AppModal';
export type { AppModalProps } from './AppModal';

export { default as AppDrawer } from './AppDrawer';
export type { AppDrawerProps } from './AppDrawer';

export { default as AppTag } from './AppTag';
export type { AppTagProps, TagStatus } from './AppTag';

// 布局组件
export { default as AppPageHeader } from './AppPageHeader';
export type { AppPageHeaderProps } from './AppPageHeader';

export { default as AppFilterBar } from './AppFilterBar';
export type { AppFilterBarProps } from './AppFilterBar';
