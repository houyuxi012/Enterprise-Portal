import React from 'react';
import { Form } from 'antd';
import type { FormProps, FormItemProps } from 'antd';

export interface AppFormProps extends Omit<FormProps, 'layout' | 'children'> {
    /** 表单布局，默认 vertical */
    layout?: 'horizontal' | 'vertical' | 'inline';
    children?: React.ReactNode;
}

export interface AppFormItemProps extends FormItemProps {
    /** 是否隐藏 label，仅保留占位 */
    hideLabel?: boolean;
}

type AppFormComponent = {
    (props: AppFormProps): React.JSX.Element;
    Item: React.FC<AppFormItemProps>;
    useForm: typeof Form.useForm;
    List: typeof Form.List;
    ErrorList: typeof Form.ErrorList;
    Provider: typeof Form.Provider;
};

/**
 * AppForm - 统一表单组件
 * 
 * 特性：
 * - 默认 vertical 布局
 * - 统一 label 样式
 * - 统一 required mark 样式
 */
const AppForm = ({
    layout = 'vertical',
    className = '',
    requiredMark = true,
    ...rest
}: AppFormProps) => {
    return (
        <Form
            layout={layout}
            className={`app-form ${className}`.trim()}
            requiredMark={requiredMark}
            {...rest}
        />
    );
};

/**
 * AppFormItem - 统一表单项组件
 */
const AppFormItem: React.FC<AppFormItemProps> = ({
    hideLabel = false,
    className = '',
    label,
    ...rest
}) => {
    return (
        <Form.Item
            className={`app-form-item ${className}`.trim()}
            label={hideLabel ? ' ' : label}
            {...rest}
        />
    );
};

const TypedAppForm = AppForm as AppFormComponent;

// 附加静态属性
TypedAppForm.Item = AppFormItem;
TypedAppForm.useForm = Form.useForm;
TypedAppForm.List = Form.List;
TypedAppForm.ErrorList = Form.ErrorList;
TypedAppForm.Provider = Form.Provider;

export default TypedAppForm;
