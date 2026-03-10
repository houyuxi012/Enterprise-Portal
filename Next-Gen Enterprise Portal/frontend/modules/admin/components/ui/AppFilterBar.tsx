import React from 'react';
import { Flex, Input, Select, DatePicker } from 'antd';
import type { InputProps } from 'antd';
import type { SelectProps } from 'antd';
import type { RangePickerProps } from 'antd/es/date-picker';
import { SearchOutlined } from '@ant-design/icons';
import i18n from '@/i18n';

const { RangePicker } = DatePicker;

export interface AppFilterBarProps {
    /** Child elements */
    children?: React.ReactNode;
    /** Custom className */
    className?: string;
}

export interface FilterSearchProps extends Omit<InputProps, 'prefix'> {
    /** Search callback */
    onSearch?: (value: string) => void;
}

export interface FilterSelectProps extends SelectProps {
    /** Width, default 180 */
    width?: number | string;
}

export interface FilterDateRangeProps extends RangePickerProps { }

export interface FilterActionProps {
    children?: React.ReactNode;
}

const AppFilterBar: React.FC<AppFilterBarProps> & {
    Search: React.FC<FilterSearchProps>;
    Select: React.FC<FilterSelectProps>;
    DateRange: React.FC<FilterDateRangeProps>;
    Action: React.FC<FilterActionProps>;
} = ({ children, className = '' }) => {
    return (
        <Flex
            align="center"
            gap={12}
            wrap
            className={`app-filter-bar ${className}`.trim()}
        >
            {children}
        </Flex>
    );
};

const FilterSearch: React.FC<FilterSearchProps> = ({
    placeholder = i18n.t('common.placeholders.search', { defaultValue: 'Search...' }),
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

const FilterSelect: React.FC<FilterSelectProps> = ({
    placeholder = i18n.t('common.placeholders.select', { defaultValue: 'Select' }),
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

const FilterAction: React.FC<FilterActionProps> = ({ children }) => {
    return (
        <div className="app-filter-action">
            {children}
        </div>
    );
};

AppFilterBar.Search = FilterSearch;
AppFilterBar.Select = FilterSelect;
AppFilterBar.DateRange = FilterDateRange;
AppFilterBar.Action = FilterAction;

export default AppFilterBar;
