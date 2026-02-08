import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Key } from 'lucide-react';
import { User, Role } from '../../types';
import ApiClient from '../../services/api';
import { message, Select, Switch, Input, Popconfirm, Card } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    AppButton,
    AppTable,
    AppModal,
    AppForm,
    AppTag,
    AppPageHeader,
    AppFilterBar,
} from '../../components/admin';

const UserList: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(false);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [search, setSearch] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const [form] = AppForm.useForm();

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [usersData, rolesData] = await Promise.all([
                ApiClient.getUsers(),
                ApiClient.getRoles()
            ]);
            setUsers(usersData);
            setRoles(rolesData);
        } catch (error) {
            console.error(error);
            message.error('加载数据失败');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await ApiClient.deleteUser(id);
            fetchData();
            message.success('用户已删除');
        } catch (e) {
            message.error('删除失败');
        }
    };

    const handleResetPassword = async (username: string) => {
        try {
            await ApiClient.resetPassword(username);
            message.success(`${username} 密码重置成功`);
        } catch (error) {
            message.error('密码重置失败');
        }
    };

    const handleEdit = (user: User) => {
        setEditingUser(user);
        form.setFieldsValue({
            username: user.username,
            email: user.email,
            password: '',
            role_ids: user.roles?.map(r => r.id) || []
        });
        setIsEditorOpen(true);
    };

    const handleAddNew = () => {
        setEditingUser(null);
        form.resetFields();
        setIsEditorOpen(true);
    };

    const handleSubmit = async (values: any) => {
        setSubmitting(true);
        try {
            if (editingUser) {
                await ApiClient.updateUser(editingUser.id, {
                    email: values.email,
                    role_ids: values.role_ids
                });
                message.success('用户更新成功');
            } else {
                await ApiClient.createUser(values);
                message.success('用户创建成功');
            }
            setIsEditorOpen(false);
            fetchData();
        } catch (error: any) {
            message.error(error.response?.data?.detail || '保存失败');
        } finally {
            setSubmitting(false);
        }
    };

    const handleStatusChange = async (user: User, isActive: boolean) => {
        try {
            await ApiClient.updateUser(user.id, { is_active: isActive });
            message.success(`用户已${isActive ? '启用' : '禁用'}`);
            fetchData();
        } catch (error) {
            message.error('状态更新失败');
        }
    };

    const filteredUsers = users.filter(u =>
        u.username.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
    );

    const columns: ColumnsType<User> = [
        {
            title: '用户名',
            dataIndex: 'username',
            key: 'username',
            width: 200,
            render: (text: string, record: User) => (
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center font-medium text-slate-600 dark:text-slate-300 text-sm overflow-hidden">
                        {(record.username === 'admin' || record.username === 'Admin') ? (
                            <img src="/images/admin-avatar.svg" alt="Admin" className="w-full h-full object-cover" />
                        ) : (
                            record.avatar ? (
                                <img src={record.avatar} alt={record.username} className="w-full h-full object-cover" />
                            ) : (
                                text[0].toUpperCase()
                            )
                        )}
                    </div>
                    <span className="font-medium text-slate-700 dark:text-slate-200">{text}</span>
                </div>
            ),
        },
        {
            title: '角色',
            dataIndex: 'roles',
            key: 'roles',
            width: 200,
            render: (roles: Role[]) => (
                <div className="flex flex-wrap gap-1">
                    {roles && roles.length > 0 ? roles.map(role => (
                        <AppTag
                            key={role.id}
                            status={role.code === 'admin' ? 'error' : 'info'}
                        >
                            {role.name}
                        </AppTag>
                    )) : (
                        <span className="text-slate-400 text-sm">暂无角色</span>
                    )}
                </div>
            ),
        },
        {
            title: '状态',
            dataIndex: 'is_active',
            key: 'is_active',
            width: 120,
            render: (isActive: boolean, record: User) => (
                <div className="flex items-center gap-2">
                    <Switch
                        checked={isActive}
                        onChange={(checked) => handleStatusChange(record, checked)}
                        size="small"
                    />
                    <AppTag status={isActive ? 'success' : 'default'}>
                        {isActive ? '启用' : '禁用'}
                    </AppTag>
                </div>
            ),
        },
        {
            title: '邮箱',
            dataIndex: 'email',
            key: 'email',
            render: (text: string) => (
                <span className="text-slate-500">{text}</span>
            ),
        },
        {
            title: '操作',
            key: 'action',
            width: 140,
            align: 'right',
            render: (_: any, record: User) => (
                <div className="flex justify-end gap-1">
                    <AppButton
                        intent="tertiary"
                        iconOnly
                        size="sm"
                        icon={<Edit size={15} />}
                        onClick={() => handleEdit(record)}
                        title="编辑"
                    />
                    <Popconfirm
                        title="重置密码"
                        description={`确定将 ${record.username} 的密码重置为 123456 吗？`}
                        onConfirm={() => handleResetPassword(record.username)}
                        okText="确定"
                        cancelText="取消"
                    >
                        <AppButton
                            intent="tertiary"
                            iconOnly
                            size="sm"
                            icon={<Key size={15} />}
                            title="重置密码"
                        />
                    </Popconfirm>
                    <Popconfirm
                        title="删除用户"
                        description="确定要删除该用户吗？此操作不可恢复。"
                        onConfirm={() => handleDelete(record.id)}
                        okText="删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                    >
                        <AppButton
                            intent="danger"
                            iconOnly
                            size="sm"
                            icon={<Trash2 size={15} />}
                            title="删除"
                        />
                    </Popconfirm>
                </div>
            ),
        },
    ];

    return (
        <div className="admin-page p-6 bg-slate-50/50 dark:bg-slate-900/50 min-h-full -m-6">
            {/* Page Header */}
            <AppPageHeader
                title="系统账户"
                subtitle="管理系统登录账户及权限分配"
                action={
                    <AppButton intent="primary" icon={<Plus size={16} />} onClick={handleAddNew}>
                        新增账户
                    </AppButton>
                }
            />

            {/* Filter Bar */}
            <AppFilterBar>
                <AppFilterBar.Search
                    placeholder="搜索用户名或邮箱..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onSearch={setSearch}
                />
            </AppFilterBar>

            {/* Data Table */}
            <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
                <AppTable
                    columns={columns}
                    dataSource={filteredUsers}
                    rowKey="id"
                    loading={loading}
                    emptyText="暂无用户数据"
                />
            </Card>

            {/* Edit/Create Modal */}
            <AppModal
                title={editingUser ? '编辑用户' : '新增账户'}
                open={isEditorOpen}
                onCancel={() => setIsEditorOpen(false)}
                onOk={() => form.submit()}
                confirmLoading={submitting}
                okText={editingUser ? '保存修改' : '创建账户'}
                width={480}
            >
                <AppForm
                    form={form}
                    onFinish={handleSubmit}
                    initialValues={{ role_ids: [] }}
                >
                    <AppForm.Item
                        label="用户名"
                        name="username"
                        rules={[{ required: true, message: '请输入用户名' }]}
                    >
                        <Input
                            placeholder="请输入用户名"
                            disabled={!!editingUser}
                        />
                    </AppForm.Item>

                    {!editingUser && (
                        <AppForm.Item
                            label="初始密码"
                            name="password"
                            rules={[{ required: true, message: '请输入初始密码' }]}
                        >
                            <Input.Password placeholder="请输入初始密码" />
                        </AppForm.Item>
                    )}

                    <AppForm.Item
                        label="邮箱"
                        name="email"
                        rules={[
                            { required: true, message: '请输入邮箱' },
                            { type: 'email', message: '请输入有效的邮箱地址' }
                        ]}
                    >
                        <Input placeholder="请输入邮箱" />
                    </AppForm.Item>

                    <AppForm.Item
                        label="分配角色"
                        name="role_ids"
                    >
                        <Select
                            mode="multiple"
                            placeholder="选择角色"
                            optionLabelProp="label"
                            options={roles.map(role => ({
                                value: role.id,
                                label: role.name,
                            }))}
                        />
                    </AppForm.Item>
                </AppForm>
            </AppModal>
        </div>
    );
};

export default UserList;
