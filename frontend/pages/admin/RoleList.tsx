import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Shield } from 'lucide-react';
import { Role, Permission } from '../../types';
import ApiClient from '../../services/api';
import { message, Checkbox, Empty, Tooltip, Input, Popconfirm } from 'antd';
import {
    AppButton,
    AppModal,
    AppForm,
    AppTag,
    AppPageHeader,
    AppFilterBar,
} from '../../components/admin';

const RoleList: React.FC = () => {
    const [roles, setRoles] = useState<Role[]>([]);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [loading, setLoading] = useState(false);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);
    const [search, setSearch] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const [form] = AppForm.useForm();

    useEffect(() => {
        fetchData();
        fetchPermissions();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const data = await ApiClient.getRoles();
            setRoles(data);
        } catch (error) {
            message.error('加载角色失败');
        } finally {
            setLoading(false);
        }
    };

    const fetchPermissions = async () => {
        try {
            const data = await ApiClient.getPermissions();
            setPermissions(data);
        } catch (error) {
            console.error('Failed to load permissions', error);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await ApiClient.deleteRole(id);
            fetchData();
            message.success('角色已删除');
        } catch (e: any) {
            message.error(e.response?.data?.detail || '删除失败');
        }
    };

    const handleEdit = (role: Role) => {
        setEditingRole(role);
        form.setFieldsValue({
            code: role.code,
            name: role.name,
            description: role.description || '',
            permission_ids: role.permissions ? role.permissions.map(p => p.id) : []
        });
        setIsEditorOpen(true);
    };

    const handleAddNew = () => {
        setEditingRole(null);
        form.resetFields();
        setIsEditorOpen(true);
    };

    const handleSubmit = async (values: any) => {
        setSubmitting(true);
        try {
            if (editingRole) {
                await ApiClient.updateRole(editingRole.id, {
                    name: values.name,
                    description: values.description,
                    permission_ids: values.permission_ids
                });
                message.success('角色更新成功');
            } else {
                await ApiClient.createRole(values);
                message.success('角色创建成功');
            }
            setIsEditorOpen(false);
            fetchData();
        } catch (error: any) {
            message.error(error.response?.data?.detail || '保存失败');
        } finally {
            setSubmitting(false);
        }
    };

    const filteredRoles = roles.filter(r =>
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.code.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="admin-page p-6 bg-slate-50/50 dark:bg-slate-900/50 min-h-full -m-6">
            {/* Page Header */}
            <AppPageHeader
                title="角色定义与权限"
                subtitle="管理系统用户角色及其对应权限"
                action={
                    <AppButton intent="primary" icon={<Plus size={16} />} onClick={handleAddNew}>
                        新增角色
                    </AppButton>
                }
            />

            {/* Filter Bar */}
            <AppFilterBar>
                <AppFilterBar.Search
                    placeholder="搜索角色名称或代码..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onSearch={setSearch}
                />
            </AppFilterBar>

            {/* Role Cards Grid */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-100 dark:border-slate-700">
                {loading ? (
                    <div className="text-center py-12 text-slate-400">加载中...</div>
                ) : filteredRoles.length === 0 ? (
                    <Empty description="暂无角色数据" />
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredRoles.map(role => (
                            <div
                                key={role.id}
                                className="rounded-xl p-5 border border-slate-100 dark:border-slate-700 hover:shadow-md transition-all group relative bg-white dark:bg-slate-800"
                            >
                                {/* Action Buttons */}
                                <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <AppButton
                                        intent="tertiary"
                                        iconOnly
                                        size="sm"
                                        icon={<Edit size={14} />}
                                        onClick={() => handleEdit(role)}
                                    />
                                    {role.code !== 'admin' && (
                                        <Popconfirm
                                            title="删除角色"
                                            description="确定要删除该角色吗？这可能会影响已分配该角色的用户。"
                                            onConfirm={() => handleDelete(role.id)}
                                            okText="删除"
                                            cancelText="取消"
                                            okButtonProps={{ danger: true }}
                                        >
                                            <AppButton
                                                intent="danger"
                                                iconOnly
                                                size="sm"
                                                icon={<Trash2 size={14} />}
                                            />
                                        </Popconfirm>
                                    )}
                                </div>

                                {/* Role Info */}
                                <div className="flex items-center gap-3 mb-3">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${role.code === 'admin'
                                            ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                                            : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                        }`}>
                                        <Shield size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-slate-800 dark:text-white">{role.name}</h3>
                                        <span className="text-xs font-mono text-slate-400 bg-slate-50 dark:bg-slate-900 px-2 py-0.5 rounded">
                                            {role.code}
                                        </span>
                                    </div>
                                </div>

                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-1">
                                    {role.description || '无描述'}
                                </p>

                                {/* Permissions */}
                                <div>
                                    <p className="text-xs font-medium text-slate-400 mb-2">
                                        权限列表 ({role.permissions?.length || 0})
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                        {role.permissions?.slice(0, 5).map(p => (
                                            <Tooltip key={p.id} title={p.description}>
                                                <AppTag status="default">{p.code}</AppTag>
                                            </Tooltip>
                                        ))}
                                        {(role.permissions?.length || 0) > 5 && (
                                            <span className="text-xs text-slate-400">
                                                +{role.permissions!.length - 5} more
                                            </span>
                                        )}
                                        {(!role.permissions || role.permissions.length === 0) && (
                                            <span className="text-xs text-slate-300 italic">暂无权限</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Edit/Create Modal */}
            <AppModal
                title={editingRole ? '编辑角色' : '创建新角色'}
                open={isEditorOpen}
                onCancel={() => setIsEditorOpen(false)}
                onOk={() => form.submit()}
                confirmLoading={submitting}
                okText={editingRole ? '保存修改' : '创建角色'}
                width={640}
            >
                <AppForm
                    form={form}
                    onFinish={handleSubmit}
                    initialValues={{ permission_ids: [] }}
                >
                    <div className="grid grid-cols-2 gap-4">
                        <AppForm.Item
                            label="角色名称"
                            name="name"
                            rules={[{ required: true, message: '请输入角色名称' }]}
                        >
                            <Input placeholder="例如：内容审核员" />
                        </AppForm.Item>

                        <AppForm.Item
                            label="角色代码 (唯一)"
                            name="code"
                            rules={[{ required: true, message: '请输入角色代码' }]}
                        >
                            <Input
                                placeholder="例如：content_auditor"
                                disabled={!!editingRole}
                            />
                        </AppForm.Item>
                    </div>

                    <AppForm.Item label="描述 (可选)" name="description">
                        <Input placeholder="角色描述" />
                    </AppForm.Item>

                    <AppForm.Item label="权限分配" name="permission_ids">
                        <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 max-h-60 overflow-y-auto">
                            <Checkbox.Group style={{ width: '100%' }}>
                                <div className="grid grid-cols-2 gap-3">
                                    {permissions.map(perm => (
                                        <div key={perm.id} className="flex items-start gap-2">
                                            <Checkbox value={perm.id} className="mt-0.5" />
                                            <div>
                                                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                                    {perm.code}
                                                </p>
                                                <p className="text-xs text-slate-400">{perm.description}</p>
                                            </div>
                                        </div>
                                    ))}
                                    {permissions.length === 0 && (
                                        <p className="text-sm text-slate-400 col-span-2">
                                            暂无可用权限，请联系开发人员添加权限定义。
                                        </p>
                                    )}
                                </div>
                            </Checkbox.Group>
                        </div>
                    </AppForm.Item>
                </AppForm>
            </AppModal>
        </div>
    );
};

export default RoleList;
