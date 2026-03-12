import React, { useEffect, useMemo, useState } from 'react';
import Button from 'antd/es/button';
import Card from 'antd/es/card';
import Empty from 'antd/es/empty';
import Space from 'antd/es/space';
import type { DataNode } from 'antd/es/tree';
import { CaretDownFilled, CaretRightFilled } from '@ant-design/icons';

interface DepartmentTreeCardProps {
  title: React.ReactNode;
  treeData: DataNode[];
  emptyDescription: React.ReactNode;
  selectedKeys?: React.Key[];
  onSelect: (selectedKeys: React.Key[]) => void;
  defaultExpandAll?: boolean;
  expandedKeys?: React.Key[];
  onExpand?: (keys: React.Key[]) => void;
  extra?: React.ReactNode;
  className?: string;
  bodyStyle?: React.CSSProperties;
  treeClassName?: string;
  scrollClassName?: string;
}

const collectExpandableKeys = (nodes: DataNode[]): React.Key[] => (
  nodes.flatMap((node) => {
    const children = Array.isArray(node.children) ? (node.children as DataNode[]) : [];
    if (!children.length) return [];
    return [node.key, ...collectExpandableKeys(children)];
  })
);

const resolveNodeTitle = (node: DataNode): React.ReactNode => (
  typeof node.title === 'function' ? node.title(node) : node.title
);

const DepartmentTreeCard: React.FC<DepartmentTreeCardProps> = ({
  title,
  treeData,
  emptyDescription,
  selectedKeys,
  onSelect,
  defaultExpandAll,
  expandedKeys,
  onExpand,
  extra,
  className,
  bodyStyle,
  treeClassName,
  scrollClassName,
}) => {
  const defaultExpandedKeys = useMemo(
    () => (defaultExpandAll ? collectExpandableKeys(treeData) : []),
    [defaultExpandAll, treeData],
  );
  const [internalExpandedKeys, setInternalExpandedKeys] = useState<React.Key[]>(defaultExpandedKeys);

  useEffect(() => {
    if (expandedKeys === undefined) {
      setInternalExpandedKeys(defaultExpandedKeys);
    }
  }, [defaultExpandedKeys, expandedKeys]);

  const activeExpandedKeys = expandedKeys ?? internalExpandedKeys;
  const selectedKeySet = useMemo(() => new Set(selectedKeys || []), [selectedKeys]);

  const updateExpandedKeys = (nextKeys: React.Key[]) => {
    if (expandedKeys === undefined) {
      setInternalExpandedKeys(nextKeys);
    }
    onExpand?.(nextKeys);
  };

  const toggleExpanded = (key: React.Key) => {
    const exists = activeExpandedKeys.includes(key);
    const nextKeys = exists
      ? activeExpandedKeys.filter((item) => item !== key)
      : [...activeExpandedKeys, key];
    updateExpandedKeys(nextKeys);
  };

  const renderNodes = (nodes: DataNode[], depth = 0): React.ReactNode => (
    <div className={depth === 0 ? treeClassName : undefined}>
      {nodes.map((node) => {
        const children = Array.isArray(node.children) ? (node.children as DataNode[]) : [];
        const hasChildren = children.length > 0;
        const isExpanded = activeExpandedKeys.includes(node.key);
        const isSelected = selectedKeySet.has(node.key);

        return (
          <div key={String(node.key)}>
            <div
              style={{ paddingLeft: depth * 16 }}
              className="flex items-center gap-1 py-px"
            >
              {hasChildren ? (
                <Button
                  type="text"
                  size="small"
                  icon={isExpanded ? <CaretDownFilled /> : <CaretRightFilled />}
                  onClick={() => toggleExpanded(node.key)}
                  className="!h-6 !w-6 !min-w-6 !px-0 text-slate-400 hover:!text-slate-600"
                />
              ) : (
                <span className="inline-block h-6 w-6" />
              )}
              <Button
                type="text"
                size="small"
                onClick={() => onSelect([node.key])}
                className={`!h-7 flex-1 !justify-start rounded-lg text-left ${
                  isSelected
                    ? '!bg-slate-100 !text-slate-900 font-medium'
                    : 'text-slate-600 hover:!bg-slate-50 hover:!text-slate-900'
                }`}
              >
                <Space size={8}>{resolveNodeTitle(node)}</Space>
              </Button>
            </div>
            {hasChildren && isExpanded ? renderNodes(children, depth + 1) : null}
          </div>
        );
      })}
    </div>
  );

  return (
    <Card
      title={title}
      extra={extra}
      className={className}
      styles={bodyStyle ? { body: bodyStyle } : undefined}
    >
      <div className={scrollClassName}>
        {treeData.length > 0
          ? renderNodes(treeData)
          : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyDescription} />}
      </div>
    </Card>
  );
};

export default DepartmentTreeCard;
