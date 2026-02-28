import React from 'react';
import { Table, Empty } from 'antd';
import type { TablePaginationConfig, TableProps } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import i18n from '../../i18n';

export interface AppTableProps<T = any> extends TableProps<T> {
    /** Show pagination, default true */
    showPagination?: boolean;
    /** Page size, default 20 */
    pageSize?: number;
    /** Empty state text */
    emptyText?: string;
}

function AppTable<T extends object = any>({
    showPagination = true,
    pageSize = 20,
    emptyText = i18n.t('common.empty.none', { defaultValue: 'No data' }),
    className = '',
    rowClassName,
    locale,
    pagination,
    ...rest
}: AppTableProps<T>) {
    const defaultPagination: TablePaginationConfig = {
        pageSize,
        showSizeChanger: true,
        showTotal: (total: number) => i18n.t('common.pagination.total', {
            count: total,
            defaultValue: `Total ${total}`,
        }),
    };

    const paginationConfig = showPagination
        ? (pagination ? { ...defaultPagination, ...pagination } : defaultPagination)
        : false;

    const mergedRowClassName = (record: T, index: number, indent: number) => {
        const baseClass = 'app-table-row group';
        if (typeof rowClassName === 'function') {
            return `${baseClass} ${rowClassName(record, index, indent)}`;
        }
        if (typeof rowClassName === 'string') {
            return `${baseClass} ${rowClassName}`;
        }
        return baseClass;
    };

    const emptyLocale = {
        emptyText: (
            <Empty
                image={<InboxOutlined style={{ fontSize: 48, color: '#cbd5e1' }} />}
                description={<span className="text-slate-400">{emptyText}</span>}
            />
        ),
        ...locale,
    };

    return (
        <Table<T>
            className={`app-table ${className}`.trim()}
            pagination={paginationConfig}
            rowClassName={mergedRowClassName}
            locale={emptyLocale}
            scroll={{ x: 'max-content' }}
            {...rest}
        />
    );
}

export default AppTable;
