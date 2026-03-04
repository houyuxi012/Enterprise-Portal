import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Key } from 'lucide-react';
import { User, Role } from '../../types';
import ApiClient from '../../services/api';
import { message, Select, Switch, Input, Popconfirm, Card } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import {
    AppButton,
    AppTable,
    AppModal,
    AppForm,
    AppTag,
    AppPageHeader,
    AppFilterBar,
} from '../../components/admin';
import { getCurrentLocale, getLocalizedRoleMeta } from '../../utils/iamRoleI18n';
import { hasAdminAccess } from '../../utils/adminAccess';

const SystemUserList: React.FC = () => {
    const { t } = useTranslation();
    const [users, setUsers] = useState<User[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(false);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [search, setSearch] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [resettingUsernames, setResettingUsernames] = useState<Record<string, boolean>>({});
    const currentLocale = getCurrentLocale();

    const [form] = AppForm.useForm();

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [usersData, rolesData, employeeData] = await Promise.all([
                ApiClient.getUsers(),
                ApiClient.getRoles(),
                ApiClient.getEmployees().catch(() => [])
            ]);
            const employeeAccounts = new Set((employeeData || []).map(emp => emp.account));
            setUsers(usersData.filter(user => !employeeAccounts.has(user.username)));
            setRoles(rolesData);
        } catch (error) {
            console.error(error);
            message.error(t('systemUserList.messages.loadFailed'));
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await ApiClient.deleteUser(id);
            fetchData();
            message.success(t('systemUserList.messages.deleteSuccess'));
        } catch (e) {
            message.error(t('systemUserList.messages.deleteFailed'));
        }
    };

    const handleResetPassword = async (username: string) => {
        if (resettingUsernames[username]) return;
        setResettingUsernames((prev) => ({ ...prev, [username]: true }));
        try {
            const result = await ApiClient.resetPassword(username);
            const resetPassword = result?.new_password;
            if (resetPassword) {
                message.success(t('systemUserList.messages.resetWithPassword', { username, password: resetPassword }));
            } else {
                message.success(t('systemUserList.messages.resetSuccess', { username }));
            }
        } catch (error: any) {
            const detail = error?.response?.data?.detail;
            const errorMsg =
                typeof detail === 'string'
                    ? detail
                    : detail?.message || t('systemUserList.messages.resetFailed');
            message.error(errorMsg);
        } finally {
            setResettingUsernames((prev) => ({ ...prev, [username]: false }));
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
                message.success(t('systemUserList.messages.updateSuccess'));
            } else {
                await ApiClient.createUser(values);
                message.success(t('systemUserList.messages.createSuccess'));
            }
            setIsEditorOpen(false);
            fetchData();
        } catch (error: any) {
            const detail = error?.response?.data?.detail;
            const errorMsg =
                typeof detail === 'string'
                    ? detail
                    : detail?.message || t('systemUserList.messages.saveFailed');
            message.error(errorMsg);
        } finally {
            setSubmitting(false);
        }
    };

    const handleStatusChange = async (user: User, isActive: boolean) => {
        if (isProtectedSystemAdmin(user) && !isActive) {
            message.warning(t('systemUserList.messages.builtinAdminDisableDenied'));
            return;
        }
        try {
            await ApiClient.updateUser(user.id, { is_active: isActive });
            message.success(t('systemUserList.messages.statusChanged', { status: isActive ? t('systemUserList.status.active') : t('systemUserList.status.inactive') }));
            fetchData();
        } catch (error) {
            message.error(t('systemUserList.messages.statusUpdateFailed'));
        }
    };

    const filteredUsers = users.filter(u =>
        String(u.username || '').toLowerCase().includes(String(search || '').toLowerCase()) ||
        String(u.email || '').toLowerCase().includes(String(search || '').toLowerCase())
    );

    const isProtectedSystemAdmin = (user: User) => {
        return (user.account_type || '').toUpperCase() === 'SYSTEM' && (user.username || '').trim().toLowerCase() === 'admin';
    };

    const columns: ColumnsType<User> = [
        {
            title: t('systemUserList.table.username'),
            dataIndex: 'username',
            key: 'username',
            width: 200,
            render: (text: string, record: User) => (
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center font-medium text-slate-600 dark:text-slate-300 text-sm overflow-hidden">
                        {hasAdminAccess(record as any) ? (
                            <img src="/images/admin-avatar.svg" alt="Admin" className="w-full h-full object-cover" />
                        ) : (
                            record.avatar ? (
                                <img src={record.avatar} alt={record.username} className="w-full h-full object-cover" />
                            ) : (
                                String(text || 'U')[0].toUpperCase()
                            )
                        )}
                    </div>
                    <span className="font-medium text-slate-700 dark:text-slate-200">{text}</span>
                </div>
            ),
        },
        {
            title: t('systemUserList.table.roles'),
            dataIndex: 'roles',
            key: 'roles',
            width: 200,
            render: (roles: Role[]) => (
                <div className="flex flex-wrap gap-1">
                    {roles && roles.length > 0 ? roles.map(role => (
                        <AppTag
                            key={role.id}
                            status={['superadmin', 'portaladmin', 'portal_admin'].includes((role.code || '').toLowerCase()) ? 'error' : 'info'}
                        >
                            {getLocalizedRoleMeta(role, currentLocale).name}
                        </AppTag>
                    )) : (
                        <span className="text-slate-400 text-sm">{t('systemUserList.table.noRoles')}</span>
                    )}
                </div>
            ),
        },
        {
            title: t('systemUserList.table.status'),
            dataIndex: 'is_active',
            key: 'is_active',
            width: 120,
            render: (isActive: boolean, record: User) => (
                <div className="flex items-center gap-2">
                    <Switch
                        checked={isActive}
                        onChange={(checked) => handleStatusChange(record, checked)}
                        size="small"
                        disabled={isProtectedSystemAdmin(record) && isActive}
                    />
                    <AppTag status={isActive ? 'success' : 'default'}>
                        {isActive ? t('systemUserList.status.active') : t('systemUserList.status.inactive')}
                    </AppTag>
                </div>
            ),
        },
        {
            title: t('systemUserList.table.email'),
            dataIndex: 'email',
            key: 'email',
            render: (text: string) => (
                <span className="text-slate-500">{text}</span>
            ),
        },
        {
            title: t('systemUserList.table.actions'),
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
                        title={t('common.buttons.edit')}
                    />
                    <Popconfirm
                        title={t('systemUserList.popconfirm.resetTitle')}
                        description={t('systemUserList.popconfirm.resetDesc', { username: record.username })}
                        onConfirm={() => handleResetPassword(record.username)}
                        okText={t('common.buttons.confirm')}
                        cancelText={t('common.buttons.cancel')}
                        disabled={['ldap', 'ad', 'oidc'].includes(record.auth_source || 'local')}
                    >
                        <AppButton
                            intent="tertiary"
                            iconOnly
                            size="sm"
                            icon={<Key size={15} />}
                            title={
                                ['ldap', 'ad', 'oidc'].includes(record.auth_source || 'local')
                                    ? t('systemUserList.actions.resetPasswordDisabledExternal')
                                    : t('systemUserList.actions.resetPassword')
                            }
                            disabled={
                                ['ldap', 'ad', 'oidc'].includes(record.auth_source || 'local')
                                || Boolean(resettingUsernames[record.username])
                            }
                            loading={Boolean(resettingUsernames[record.username])}
                        />
                    </Popconfirm>
                    {isProtectedSystemAdmin(record) ? (
                        <AppButton
                            intent="tertiary"
                            iconOnly
                            size="sm"
                            icon={<Trash2 size={15} />}
                            title={t('systemUserList.actions.builtinAdminDeleteDenied')}
                            disabled
                        />
                    ) : (
                        <Popconfirm
                            title={t('systemUserList.popconfirm.deleteTitle')}
                            description={t('systemUserList.popconfirm.deleteDesc')}
                            onConfirm={() => handleDelete(record.id)}
                            okText={t('common.buttons.delete')}
                            cancelText={t('common.buttons.cancel')}
                            okButtonProps={{ danger: true }}
                        >
                            <AppButton
                                intent="danger"
                                iconOnly
                                size="sm"
                                icon={<Trash2 size={15} />}
                                title={t('common.buttons.delete')}
                            />
                        </Popconfirm>
                    )}
                </div>
            ),
        },
    ];

    return (
        <div className="admin-page p-6 bg-slate-50/50 dark:bg-slate-900/50 min-h-full -m-6">
            {/* Page Header */}
            <AppPageHeader
                title={t('systemUserList.page.title')}
                subtitle={t('systemUserList.page.subtitle')}
                action={
                    <AppButton intent="primary" icon={<Plus size={16} />} onClick={handleAddNew}>
                        {t('systemUserList.page.create')}
                    </AppButton>
                }
            />

            {/* Filter Bar */}
            <AppFilterBar>
                <AppFilterBar.Search
                    placeholder={t('systemUserList.filters.searchPlaceholder')}
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
                    emptyText={t('systemUserList.table.empty')}
                />
            </Card>

            {/* Edit/Create Modal */}
            <AppModal
                title={editingUser ? t('systemUserList.modal.editTitle') : t('systemUserList.modal.createTitle')}
                open={isEditorOpen}
                onCancel={() => setIsEditorOpen(false)}
                onOk={() => form.submit()}
                confirmLoading={submitting}
                okText={editingUser ? t('systemUserList.modal.saveEdit') : t('systemUserList.modal.create')}
                width={480}
            >
                <AppForm
                    form={form}
                    onFinish={handleSubmit}
                    initialValues={{ role_ids: [] }}
                >
                    <AppForm.Item
                        label={t('systemUserList.form.username')}
                        name="username"
                        rules={[{ required: true, message: t('systemUserList.form.usernameRequired') }]}
                    >
                        <Input
                            placeholder={t('systemUserList.form.usernamePlaceholder')}
                            disabled={!!editingUser}
                        />
                    </AppForm.Item>

                    {!editingUser && (
                        <AppForm.Item
                            label={t('systemUserList.form.password')}
                            name="password"
                            rules={[{ required: true, message: t('systemUserList.form.passwordRequired') }]}
                        >
                            <Input.Password placeholder={t('systemUserList.form.passwordPlaceholder')} />
                        </AppForm.Item>
                    )}

                    <AppForm.Item
                        label={t('systemUserList.form.email')}
                        name="email"
                        rules={[
                            { required: true, message: t('systemUserList.form.emailRequired') },
                            { type: 'email', message: t('systemUserList.form.emailInvalid') }
                        ]}
                    >
                        <Input placeholder={t('systemUserList.form.emailPlaceholder')} />
                    </AppForm.Item>

                    <AppForm.Item
                        label={t('systemUserList.form.roles')}
                        name="role_ids"
                    >
                        <Select
                            mode="multiple"
                            placeholder={t('systemUserList.form.rolesPlaceholder')}
                            optionLabelProp="label"
                            options={roles.map(role => ({
                                value: role.id,
                                label: getLocalizedRoleMeta(role, currentLocale).name,
                            }))}
                        />
                    </AppForm.Item>
                </AppForm>
            </AppModal>
        </div>
    );
};

export default SystemUserList;
