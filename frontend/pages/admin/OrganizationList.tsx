import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, ChevronRight, Folder, FolderOpen, Building2, Users } from 'lucide-react';
import { Department, UserOption } from '../../types';
import ApiClient from '../../services/api';
import { message, Tree, Empty, Input, Select, Popconfirm, Card, Descriptions, Tag, Statistic, Row, Col } from 'antd';
import { TeamOutlined, UserOutlined, ApartmentOutlined, FolderOutlined } from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import {
    AppButton,
    AppModal,
    AppForm,
    AppPageHeader,
} from '../../components/admin';

const { TextArea } = Input;

const OrganizationList: React.FC = () => {
    const [departments, setDepartments] = useState<Department[]>([]);
    const [treeData, setTreeData] = useState<DataNode[]>([]);
    const [selectedDept, setSelectedDept] = useState<Department | null>(null);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
    const [form] = AppForm.useForm();
    const [editingId, setEditingId] = useState<number | null>(null);
    const [userOptions, setUserOptions] = useState<UserOption[]>([]);

    // 计算部门总数
    const countDepts = (list: Department[]): number =>
        list.reduce((acc, d) => acc + 1 + (d.children ? countDepts(d.children) : 0), 0);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [data, users] = await Promise.all([
                ApiClient.getDepartments(),
                ApiClient.getUserOptions().catch(() => []),
            ]);
            setDepartments(data);
            setTreeData(buildTreeData(data));
            setExpandedKeys(data.map(d => d.id));
            setUserOptions(Array.isArray(users) ? users : []);
        } catch (error) {
            message.error("加载部门数据失败");
        }
    };

    const getManagerDisplay = (manager?: string | null) => {
        if (!manager) return '';
        const matched = userOptions.find((u) => u.username === manager);
        if (!matched) return manager;
        return matched.name ? `${matched.name}（${matched.username}）` : matched.username;
    };

    const buildTreeData = (depts: Department[]): DataNode[] => {
        return depts.map(dept => ({
            title: (
                <div className="flex items-center gap-2 py-1">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{dept.name}</span>
                    {dept.children && dept.children.length > 0 && (
                        <Tag color="blue" className="m-0 text-[10px] px-1.5 py-0 rounded-full leading-4">
                            {dept.children.length}
                        </Tag>
                    )}
                </div>
            ),
            key: dept.id,
            children: dept.children && dept.children.length > 0 ? buildTreeData(dept.children) : undefined,
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

    const openCreateModal = (parentId: number | null) => {
        setEditingId(null);
        form.setFieldsValue({ name: '', parent_id: parentId, description: '', manager: undefined });
        setIsEditorOpen(true);
    }

    const openEditModal = (dept: Department) => {
        setEditingId(dept.id);
        form.setFieldsValue({
            name: dept.name,
            parent_id: dept.parent_id,
            description: dept.description || '',
            manager: dept.manager || undefined
        });
        setIsEditorOpen(true);
    }

    const handleSubmit = async (values: any) => {
        try {
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

    const flattenDepts = (list: Department[], res: Department[] = []) => {
        list.forEach(d => {
            res.push(d);
            if (d.children) flattenDepts(d.children, res);
        });
        return res;
    }
    const allDepts = flattenDepts(departments);

    return (
        <div className="animate-in fade-in duration-500">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight flex items-center gap-3">
                        <ApartmentOutlined className="text-blue-600" />
                        组织架构管理
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">管理企业部门层级与结构</p>
                </div>
                <AppButton intent="primary" icon={<Plus size={16} />} onClick={() => openCreateModal(null)}>
                    新增根部门
                </AppButton>
            </div>

            <Row gutter={16}>
                {/* Left: Tree Card */}
                <Col xs={24} lg={8}>
                    <Card
                        title={
                            <div className="flex items-center gap-2">
                                <FolderOutlined className="text-blue-500" />
                                <span>部门树</span>
                            </div>
                        }
                        extra={<Tag color="blue">{countDepts(departments)} 个部门</Tag>}
                        className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] mb-4"
                        styles={{ body: { padding: 12, minHeight: 500 } }}
                    >
                        {departments.length > 0 ? (
                            <Tree
                                treeData={treeData}
                                onSelect={handleSelect}
                                expandedKeys={expandedKeys}
                                onExpand={(keys) => setExpandedKeys(keys)}
                                blockNode
                                className="bg-transparent"
                                selectedKeys={selectedDept ? [selectedDept.id] : []}
                            />
                        ) : (
                            <Empty description="暂无组织架构" className="mt-16" />
                        )}
                    </Card>
                </Col>

                {/* Right: Details Card */}
                <Col xs={24} lg={16}>
                    <Card
                        className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)]"
                        styles={{ body: { minHeight: 500 } }}
                    >
                        {selectedDept ? (
                            <div className="space-y-6">
                                {/* Header */}
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-4">

                                        <div>
                                            <h2 className="text-xl font-black text-slate-900 dark:text-white">{selectedDept.name}</h2>
                                            <div className="flex items-center gap-3 text-sm text-slate-400 mt-1">
                                                <span className="font-mono">ID: {selectedDept.id}</span>
                                                {selectedDept.manager && (
                                                    <Tag icon={<UserOutlined />} color="processing">{getManagerDisplay(selectedDept.manager)}</Tag>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <AppButton intent="tertiary" size="sm" icon={<Edit size={14} />} onClick={() => openEditModal(selectedDept)}>
                                            编辑
                                        </AppButton>
                                        <Popconfirm title="确认删除" description="删除后无法恢复" onConfirm={() => handleDelete(selectedDept.id)} okText="确定" cancelText="取消">
                                            <AppButton intent="danger" size="sm" icon={<Trash2 size={14} />}>删除</AppButton>
                                        </Popconfirm>
                                    </div>
                                </div>

                                {/* Descriptions */}
                                <Descriptions
                                    bordered
                                    size="small"
                                    column={1}
                                    className="rounded-xl overflow-hidden"
                                    labelStyle={{ width: 120, fontWeight: 600 }}
                                >
                                    <Descriptions.Item label="部门名称">{selectedDept.name}</Descriptions.Item>
                                    <Descriptions.Item label="负责人">{selectedDept.manager ? getManagerDisplay(selectedDept.manager) : <span className="text-slate-400">未设置</span>}</Descriptions.Item>
                                    <Descriptions.Item label="上级部门">
                                        {selectedDept.parent_id
                                            ? allDepts.find(d => d.id === selectedDept.parent_id)?.name || '未知'
                                            : <Tag color="gold">根部门</Tag>
                                        }
                                    </Descriptions.Item>
                                    <Descriptions.Item label="描述">{selectedDept.description || <span className="text-slate-400 italic">暂无描述</span>}</Descriptions.Item>
                                </Descriptions>

                                {/* Sub-departments */}
                                <Card
                                    title={
                                        <div className="flex items-center gap-2">
                                            <TeamOutlined className="text-blue-500" />
                                            <span>下级部门</span>
                                            <Tag color="blue">{selectedDept.children?.length || 0}</Tag>
                                        </div>
                                    }
                                    extra={
                                        <AppButton intent="tertiary" size="sm" icon={<Plus size={12} />} onClick={() => openCreateModal(selectedDept.id)}>
                                            添加子部门
                                        </AppButton>
                                    }
                                    className="rounded-2xl"
                                    size="small"
                                >
                                    {selectedDept.children && selectedDept.children.length > 0 ? (
                                        <div className="space-y-2">
                                            {selectedDept.children.map(child => (
                                                <div
                                                    key={child.id}
                                                    onClick={() => {
                                                        setSelectedDept(child);
                                                        setExpandedKeys(prev => [...new Set([...prev, selectedDept.id])]);
                                                    }}
                                                    className="bg-slate-50 dark:bg-slate-800 px-4 py-3 rounded-xl flex justify-between items-center cursor-pointer hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors group"
                                                >
                                                    <div className="flex items-center gap-3">

                                                        <span className="font-medium text-slate-700 dark:text-slate-200">{child.name}</span>
                                                        {child.manager && <Tag>{getManagerDisplay(child.manager)}</Tag>}
                                                    </div>
                                                    <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <Empty description="暂无下级部门" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                                    )}
                                </Card>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 py-20">
                                <ApartmentOutlined style={{ fontSize: 48 }} className="text-slate-200 mb-4" />
                                <p className="text-base mb-6">选择左侧部门查看详情</p>
                                <AppButton intent="secondary" onClick={() => openCreateModal(null)} icon={<Plus size={16} />}>
                                    创建根部门
                                </AppButton>
                            </div>
                        )}
                    </Card>
                </Col>
            </Row>

            {/* Modal */}
            <AppModal
                open={isEditorOpen}
                onCancel={() => setIsEditorOpen(false)}
                onOk={() => form.submit()}
                confirmLoading={loading}
                title={editingId ? '编辑部门' : '新增部门'}
                width={480}
            >
                <AppForm form={form} onFinish={handleSubmit}>
                    <AppForm.Item name="name" label="部门名称" rules={[{ required: true, message: '请输入部门名称' }]}>
                        <Input placeholder="请输入部门名称" />
                    </AppForm.Item>
                    <AppForm.Item name="parent_id" label="上级部门">
                        <Select
                            placeholder="(根部门)"
                            allowClear
                            options={[
                                { value: null, label: '(根部门)' },
                                ...allDepts.filter(d => d.id !== editingId).map(d => ({ value: d.id, label: d.name }))
                            ]}
                        />
                    </AppForm.Item>
                    <AppForm.Item name="manager" label="负责人">
                        <Select
                            placeholder="请选择负责人"
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            options={userOptions.map((user) => ({
                                value: user.username,
                                label: user.name ? `${user.name}（${user.username}）` : user.username,
                            }))}
                            filterOption={(input, option) =>
                                String(option?.label || '').toLowerCase().includes(input.toLowerCase())
                            }
                        />
                    </AppForm.Item>
                    <AppForm.Item name="description" label="描述">
                        <TextArea placeholder="请输入部门描述" rows={3} />
                    </AppForm.Item>
                </AppForm>
            </AppModal>
        </div>
    );
};

export default OrganizationList;
