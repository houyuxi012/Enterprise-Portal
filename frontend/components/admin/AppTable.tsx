import React from 'react';
import { Table, Empty } from 'antd';
import type { TablePaginationConfig, TableProps } from 'antd';
import { InboxOutlined } from '@ant-design/icons';

export interface AppTableProps<T = any> extends Omit<TableProps<T>, 'pagination'> {
    /** 是否显示分页，默认 true */
    showPagination?: boolean;
    /** 每页条数，默认 20 */
    pageSize?: number;
    /** 空状态提示文字 */
    emptyText?: string;
}

/**
 * AppTable - 统一表格组件
 * 
 * 特性：
 * - 统一分页配置（pageSize: 20, showSizeChanger, showTotal）
 * - 统一 hover 效果
 * - 统一空状态显示
 * - 统一圆角和边框样式
 */
function AppTable<T extends object = any>({
    showPagination = true,
    pageSize = 20,
    emptyText = '暂无数据',
    className = '',
    rowClassName,
    locale,
    ...rest
}: AppTableProps<T>) {
    const paginationConfig: false | TablePaginationConfig = showPagination
        ? {
            pageSize,
            showSizeChanger: true,
            showTotal: (total: number) => `共 ${total} 条`,
        }
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
