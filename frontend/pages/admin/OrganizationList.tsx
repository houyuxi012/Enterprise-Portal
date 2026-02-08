import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, ChevronRight, Folder, FolderOpen, Building2, FolderTree } from 'lucide-react';
import { Department } from '../../types';
import ApiClient from '../../services/api';
import { message, Tree, Empty, Modal, Form, Input, Select, Popconfirm } from 'antd';
import { TeamOutlined, UserOutlined } from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import AppButton from '../../components/AppButton';

const { TextArea } = Input;

const OrganizationList: React.FC = () => {
    const [departments, setDepartments] = useState<Department[]>([]);
    const [treeData, setTreeData] = useState<DataNode[]>([]);
    const [selectedDept, setSelectedDept] = useState<Department | null>(null);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
    const [form] = Form.useForm();

    // 计算部门总数
    const countDepts = (list: Department[]): number =>
        list.reduce((acc, d) => acc + 1 + (d.children ? countDepts(d.children) : 0), 0);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const data = await ApiClient.getDepartments();
            setDepartments(data);
            setTreeData(buildTreeData(data));
            // 默认展开第一层
            setExpandedKeys(data.map(d => d.id));
        } catch (error) {
            message.error("加载部门数据失败");
        }
    };

    const buildTreeData = (depts: Department[]): DataNode[] => {
        return depts.map(dept => ({
            title: (
                <div className="flex items-center gap-2 py-0.5">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{dept.name}</span>
                    {dept.children && dept.children.length > 0 && (
                        <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded-full">
                            {dept.children.length}
                        </span>
                    )}
                </div>
            ),
            key: dept.id,
            children: dept.children && dept.children.length > 0 ? buildTreeData(dept.children) : undefined,
            icon: ({ expanded }: any) =>
                expanded ? <FolderOpen size={16} className="text-blue-500" /> : <Folder size={16} className="text-blue-500" />
        }));
    };

    const handleSelect = (selectedKeys: React.Key[]) => {
        if (selectedKeys.length > 0) {
            const id = Number(selectedKeys[0]);
            const findDept = (list: Department[]): Department | null => {
                for (const d of list) {
                    if (d.id === id) return d;
                    if (d.children) {
                        const found = findDept(d.children);
                        if (found) return found;
                    }
                }
                return null;
            };
            const dept = findDept(departments);
            setSelectedDept(dept);
        } else {
            setSelectedDept(null);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await ApiClient.deleteDepartment(id);
            message.success('部门已删除');
            fetchData();
            setSelectedDept(null);
        } catch (e: any) {
            message.error(e.response?.data?.detail || '删除失败');
        }
    };

    const [editingId, setEditingId] = useState<number | null>(null);

    const openCreateModal = (parentId: number | null) => {
        setEditingId(null);
        form.setFieldsValue({ name: '', parent_id: parentId, description: '', manager: '' });
        setIsEditorOpen(true);
    }

    const openEditModal = (dept: Department) => {
        setEditingId(dept.id);
        form.setFieldsValue({
            name: dept.name,
            parent_id: dept.parent_id,
            description: dept.description || '',
            manager: dept.manager || ''
        });
        setIsEditorOpen(true);
    }

    const submitForm = async () => {
        try {
            const values = await form.validateFields();
            setLoading(true);
            if (editingId) {
                await ApiClient.updateDepartment(editingId, values);
                message.success('更新成功');
            } else {
                await ApiClient.createDepartment(values);
                message.success('创建成功');
            }
            setIsEditorOpen(false);
            fetchData();
        } catch (e: any) {
            if (e.response?.data?.detail) {
                message.error(e.response.data.detail);
            }
        } finally {
            setLoading(false);
        }
    }

    // 扁平化部门列表用于选择器
    const flattenDepts = (list: Department[], res: Department[] = []) => {
        list.forEach(d => {
            res.push(d);
            if (d.children) flattenDepts(d.children, res);
        });
        return res;
    }
    const allDepts = flattenDepts(departments);

    return (
        <div className="animate-in fade-in duration-500 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-4 min-h-full flex flex-col gap-4">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">组织架构管理</h2>
                    <p className="text-xs text-slate-400 mt-0.5">管理企业部门层级与结构</p>
                </div>
                <AppButton
                    intent="primary"
                    icon={<Plus size={16} />}
                    onClick={() => openCreateModal(null)}
                >
                    新增根部门
                </AppButton>
            </div>

            <div className="flex flex-1 min-h-0 gap-4">
                {/* Left: Tree */}
                <div className="w-72 min-w-[260px] flex flex-col bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700/50 overflow-hidden">
                    <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100 dark:border-slate-700/50">
                        <div className="flex items-center gap-2">
                            <FolderTree size={16} className="text-blue-500" />
                            <span className="text-sm font-semibold text-slate-700 dark:text-white">部门层级</span>
                        </div>
                        <span className="text-xs text-slate-400">{countDepts(departments)} 个</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3">
                        {departments.length > 0 ? (
                            <Tree
                                treeData={treeData}
                                onSelect={handleSelect}
                                expandedKeys={expandedKeys}
                                onExpand={(keys) => setExpandedKeys(keys)}
                                showIcon
                                blockNode
                                className="bg-transparent dark:text-slate-200 text-sm"
                                selectedKeys={selectedDept ? [selectedDept.id] : []}
                            />
                        ) : (
                            <Empty description="暂无组织架构" className="mt-8" />
                        )}
                    </div>
                </div>

                {/* Right: Details */}
                <div className="flex-1 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700/50 flex flex-col overflow-hidden">
                    {selectedDept ? (
                        <div className="flex flex-col h-full">
                            {/* Detail Header */}
                            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700/50 flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                                        <Building2 size={20} className="text-white" />
                                    </div>
                                    <div>
                                        <h1 className="text-lg font-bold text-slate-900 dark:text-white">{selectedDept.name}</h1>
                                        <div className="flex items-center gap-2 text-xs text-slate-400">
                                            <span className="font-mono">ID: {selectedDept.id}</span>
                                            {selectedDept.manager && (
                                                <span className="flex items-center gap-1">
                                                    <UserOutlined className="text-blue-500" />
                                                    {selectedDept.manager}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <AppButton
                                        intent="tertiary"
                                        size="sm"
                                        onClick={() => openEditModal(selectedDept)}
                                        icon={<Edit size={14} />}
                                    >
                                        编辑
                                    </AppButton>
                                    <Popconfirm
                                        title="确认删除"
                                        description="删除后无法恢复"
                                        onConfirm={() => handleDelete(selectedDept.id)}
                                        okText="确定"
                                        cancelText="取消"
                                    >
                                        <AppButton intent="danger" size="sm" icon={<Trash2 size={14} />}>
                                            删除
                                        </AppButton>
                                    </Popconfirm>
                                </div>
                            </div>

                            {/* Detail Content */}
                            <div className="flex-1 overflow-y-auto p-5 space-y-4">
                                {/* Description */}
                                <div>
                                    <h4 className="text-xs font-medium text-slate-400 mb-2">描述</h4>
                                    <p className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-700/50">
                                        {selectedDept.description || <span className="text-slate-400 italic">暂无描述</span>}
                                    </p>
                                </div>

                                {/* Children */}
                                <div className="bg-slate-50/50 dark:bg-slate-900/30 rounded-lg p-4 border border-slate-100 dark:border-slate-700/50">
                                    <div className="flex justify-between items-center mb-3">
                                        <h4 className="text-xs font-medium text-slate-400 flex items-center gap-1">
                                            <TeamOutlined className="text-blue-500" />
                                            下级部门 ({selectedDept.children?.length || 0})
                                        </h4>
                                        <AppButton
                                            intent="tertiary"
                                            size="sm"
                                            onClick={() => openCreateModal(selectedDept.id)}
                                            icon={<Plus size={12} />}
                                        >
                                            添加
                                        </AppButton>
                                    </div>
                                    <div className="space-y-2">
                                        {selectedDept.children?.map(child => (
                                            <div
                                                key={child.id}
                                                onClick={() => {
                                                    setSelectedDept(child);
                                                    setExpandedKeys(prev => [...new Set([...prev, selectedDept.id])]);
                                                }}
                                                className="bg-white dark:bg-slate-800 px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-700 flex justify-between items-center cursor-pointer hover:border-blue-200 dark:hover:border-blue-600 transition-colors"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <Folder size={14} className="text-blue-500" />
                                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{child.name}</span>
                                                    {child.manager && <span className="text-xs text-slate-400">· {child.manager}</span>}
                                                </div>
                                                <ChevronRight size={14} className="text-slate-300" />
                                            </div>
                                        ))}
                                        {(!selectedDept.children || selectedDept.children.length === 0) && (
                                            <p className="text-xs text-slate-400 text-center py-4">暂无下级部门</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
                            <Building2 size={36} className="text-slate-300 mb-3" />
                            <p className="text-sm mb-4">选择左侧部门查看详情</p>
                            <AppButton
                                intent="secondary"
                                size="sm"
                                onClick={() => openCreateModal(null)}
                                icon={<Plus size={14} />}
                            >
                                创建根部门
                            </AppButton>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal */}
            <Modal
                open={isEditorOpen}
                onCancel={() => setIsEditorOpen(false)}
                onOk={submitForm}
                confirmLoading={loading}
                title={
                    <div className="flex items-center gap-2">
                        {editingId ? <Edit size={18} className="text-indigo-500" /> : <Plus size={18} className="text-blue-500" />}
                        <span className="font-bold">{editingId ? '编辑部门' : '新增部门'}</span>
                    </div>
                }
                okText="确定"
                cancelText="取消"
                className="rounded-2xl"
                width={480}
            >
                <Form form={form} layout="vertical" className="mt-4">
                    <Form.Item
                        name="name"
                        label="部门名称"
                        rules={[{ required: true, message: '请输入部门名称' }]}
                    >
                        <Input placeholder="请输入部门名称" className="rounded-xl" size="large" />
                    </Form.Item>
                    <Form.Item name="parent_id" label="上级部门">
                        <Select
                            placeholder="(根部门)"
                            allowClear
                            className="rounded-xl"
                            size="large"
                            options={[
                                { value: null, label: '(根部门)' },
                                ...allDepts.filter(d => d.id !== editingId).map(d => ({ value: d.id, label: d.name }))
                            ]}
                        />
                    </Form.Item>
                    <Form.Item name="manager" label="负责人">
                        <Input placeholder="请输入负责人姓名" className="rounded-xl" size="large" />
                    </Form.Item>
                    <Form.Item name="description" label="描述">
                        <TextArea placeholder="请输入部门描述" className="rounded-xl" rows={3} />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default OrganizationList;

