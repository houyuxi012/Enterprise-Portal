import React, { Suspense, lazy } from 'react';
import Flex from 'antd/es/flex';
import Input from 'antd/es/input';
import Select from 'antd/es/select';
import type { DatePickerProps } from 'antd/es/date-picker';
import type { InputProps } from 'antd/es/input';
import type { SelectProps } from 'antd/es/select';
import type { Dayjs } from 'dayjs';
import { SearchOutlined } from '@ant-design/icons';
import i18n from '@/i18n';
const AppFilterDateRange = lazy(() => import('./AppFilterDateRange'));

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

export interface FilterDateRangeProps {
    value?: [Dayjs | null, Dayjs | null] | null;
    onChange?: (dates: [Dayjs | null, Dayjs | null] | null, dateStrings: [string, string]) => void;
    placeholder?: [string, string];
    className?: string;
    format?: DatePickerProps['format'];
    showTime?: DatePickerProps['showTime'];
    disabled?: boolean;
    allowEmpty?: [boolean, boolean];
}

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
        <Suspense
            fallback={
                <div
                    className={`app-filter-date-range ${className}`.trim()}
                    style={{ minWidth: 280, height: 32 }}
                />
            }
        >
            <AppFilterDateRange className={className} {...rest} />
        </Suspense>
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
