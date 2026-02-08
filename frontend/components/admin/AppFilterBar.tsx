import React from 'react';
import { Input, Select, DatePicker } from 'antd';
import type { InputProps } from 'antd';
import type { SelectProps } from 'antd';
import type { RangePickerProps } from 'antd/es/date-picker';
import { SearchOutlined } from '@ant-design/icons';

const { RangePicker } = DatePicker;

export interface AppFilterBarProps {
    /** 子元素 */
    children?: React.ReactNode;
    /** 自定义类名 */
    className?: string;
}

export interface FilterSearchProps extends Omit<InputProps, 'prefix'> {
    /** 搜索回调 */
    onSearch?: (value: string) => void;
}

export interface FilterSelectProps extends SelectProps {
    /** 宽度，默认 180 */
    width?: number | string;
}

export interface FilterDateRangeProps extends RangePickerProps { }

export interface FilterActionProps {
    children?: React.ReactNode;
}

/**
 * AppFilterBar - 统一筛选栏组件
 * 
 * 包含子组件：Search, Select, DateRange, Action
 * 
 * @example
 * ```tsx
 * <AppFilterBar>
 *   <AppFilterBar.Search placeholder="搜索用户名" onSearch={handleSearch} />
 *   <AppFilterBar.Select options={roleOptions} placeholder="角色筛选" />
 *   <AppFilterBar.DateRange onChange={handleDateChange} />
 *   <AppFilterBar.Action>
 *     <AppButton intent="primary" onClick={handleQuery}>查询</AppButton>
 *     <AppButton intent="secondary" onClick={handleReset}>重置</AppButton>
 *   </AppFilterBar.Action>
 * </AppFilterBar>
 * ```
 */
const AppFilterBar: React.FC<AppFilterBarProps> & {
    Search: React.FC<FilterSearchProps>;
    Select: React.FC<FilterSelectProps>;
    DateRange: React.FC<FilterDateRangeProps>;
    Action: React.FC<FilterActionProps>;
} = ({ children, className = '' }) => {
    return (
        <div
            className={`app-filter-bar bg-white dark:bg-slate-800 rounded-xl p-4 mb-4 border border-slate-100 dark:border-slate-700 flex flex-wrap items-center gap-3 ${className}`.trim()}
        >
            {children}
        </div>
    );
};

/**
 * 搜索输入框
 */
const FilterSearch: React.FC<FilterSearchProps> = ({
    placeholder = '搜索...',
    onSearch,
    className = '',
    ...rest
}) => {
    const handlePressEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
        onSearch?.((e.target as HTMLInputElement).value);
    };

    return (
        <Input
            placeholder={placeholder}
            prefix={<SearchOutlined className="text-slate-400" />}
            allowClear
            className={`app-filter-search w-60 ${className}`.trim()}
            onPressEnter={handlePressEnter}
            onChange={(e) => {
                if (!e.target.value && onSearch) {
                    onSearch('');
                }
            }}
            {...rest}
        />
    );
};

/**
 * 下拉选择框
 */
const FilterSelect: React.FC<FilterSelectProps> = ({
    placeholder = '请选择',
    width = 180,
    className = '',
    allowClear = true,
    ...rest
}) => {
    return (
        <Select
            placeholder={placeholder}
            allowClear={allowClear}
            className={`app-filter-select ${className}`.trim()}
            style={{ width }}
            {...rest}
        />
    );
};

/**
 * 日期范围选择器
 */
const FilterDateRange: React.FC<FilterDateRangeProps> = ({
    className = '',
    ...rest
}) => {
    return (
        <RangePicker
            className={`app-filter-date-range ${className}`.trim()}
            {...rest}
        />
    );
};

/**
 * 操作按钮区域
 */
const FilterAction: React.FC<FilterActionProps> = ({ children }) => {
    return (
        <div className="app-filter-action flex items-center gap-2 ml-auto">
            {children}
        </div>
    );
};

// 附加子组件
AppFilterBar.Search = FilterSearch;
AppFilterBar.Select = FilterSelect;
AppFilterBar.DateRange = FilterDateRange;
AppFilterBar.Action = FilterAction;

export default AppFilterBar;
