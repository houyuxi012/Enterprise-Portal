import React, { useState, useEffect } from 'react';
import { User, Role } from '@/types';
import ApiClient, { type UserCreatePayload, type UserUpdatePayload } from '@/services/api';
import { App, Avatar, Card, Col, Input, Popconfirm, Row, Select, Space, Switch, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, KeyOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
    AppButton,
    AppTable,
    AppModal,
    AppForm,
    AppTag,
    AppPageHeader,
    AppFilterBar,
} from '@/modules/admin/components/ui';
import { getCurrentLocale, getLocalizedRoleMeta } from '@/shared/utils/iamRoleI18n';
import { hasAdminAccess } from '@/shared/utils/adminAccess';

const { Text } = Typography;

type SystemUserFormValues = {
    username: string;
    password?: string;
    email: string;
    role_ids: number[];
    locale?: 'zh-CN' | 'en-US';
};

type ApiErrorShape = {
    response?: {
        data?: {
            detail?: { message?: string } | string;
        };
    };
};

const resolveApiErrorMessage = (error: unknown, fallback: string): string => {
    const detail = (error as ApiErrorShape)?.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) {
        return detail;
    }
    if (detail && typeof detail === 'object' && typeof detail.message === 'string' && detail.message.trim()) {
        return detail.message;
    }
    return fallback;
};

const SystemUserList: React.FC = () => {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [users, setUsers] = useState<User[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(false);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [search, setSearch] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [resettingUsernames, setResettingUsernames] = useState<Record<string, boolean>>({});
    const currentLocale = getCurrentLocale();

    const [form] = AppForm.useForm<SystemUserFormValues>();
    const localeOptions = [
        { value: 'zh-CN', label: t('systemUserList.locale.zhCN') },
        { value: 'en-US', label: t('systemUserList.locale.enUS') },
    ];

    const renderLocaleLabel = (locale?: string | null): string =>
        locale === 'en-US' ? t('systemUserList.locale.enUS') : locale === 'zh-CN' ? t('systemUserList.locale.zhCN') : t('systemUserList.locale.default');

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
        } catch (error: unknown) {
            message.error(resolveApiErrorMessage(error, t('systemUserList.messages.resetFailed')));
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
            role_ids: user.roles?.map(r => r.id) || [],
            locale: user.locale || undefined,
        });
        setIsEditorOpen(true);
    };

    const handleAddNew = () => {
        setEditingUser(null);
        form.resetFields();
        setIsEditorOpen(true);
    };

    const handleSubmit = async (values: SystemUserFormValues) => {
        setSubmitting(true);
        try {
            if (editingUser) {
                const payload: UserUpdatePayload = {
                    email: values.email,
                    role_ids: values.role_ids,
                    locale: values.locale || null,
                };
                await ApiClient.updateUser(editingUser.id, payload);
                message.success(t('systemUserList.messages.updateSuccess'));
            } else {
                const payload: UserCreatePayload = {
                    username: values.username,
                    password: values.password ?? '',
                    email: values.email,
                    role_ids: values.role_ids,
                    locale: values.locale,
                };
                await ApiClient.createUser(payload);
                message.success(t('systemUserList.messages.createSuccess'));
            }
            setIsEditorOpen(false);
            fetchData();
        } catch (error: unknown) {
            message.error(resolveApiErrorMessage(error, t('systemUserList.messages.saveFailed')));
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
                <Space size="middle">
                    <Avatar
                        size={36}
                        src={hasAdminAccess(record) ? '/images/admin-avatar.svg' : record.avatar || undefined}
                    >
                        {String(text || 'U')[0].toUpperCase()}
                    </Avatar>
                    <Text strong>{text}</Text>
                </Space>
            ),
        },
        {
            title: t('systemUserList.table.roles'),
            dataIndex: 'roles',
            key: 'roles',
            width: 200,
            render: (roles: Role[]) => (
                <Space size={[4, 4]} wrap>
                    {roles && roles.length > 0 ? roles.map(role => (
                        <AppTag
                            key={role.id}
                            status={['superadmin', 'portaladmin', 'portal_admin'].includes((role.code || '').toLowerCase()) ? 'error' : 'info'}
                        >
                            {getLocalizedRoleMeta(role, currentLocale).name}
                        </AppTag>
                    )) : (
                        <Text type="secondary">{t('systemUserList.table.noRoles')}</Text>
                    )}
                </Space>
            ),
        },
        {
            title: t('systemUserList.table.status'),
            dataIndex: 'is_active',
            key: 'is_active',
            width: 120,
            render: (isActive: boolean, record: User) => (
                <Space size="small">
                    <Switch
                        checked={isActive}
                        onChange={(checked) => handleStatusChange(record, checked)}
                        size="small"
                        disabled={isProtectedSystemAdmin(record) && isActive}
                    />
                    <AppTag status={isActive ? 'success' : 'default'}>
                        {isActive ? t('systemUserList.status.active') : t('systemUserList.status.inactive')}
                    </AppTag>
                </Space>
            ),
        },
        {
            title: t('systemUserList.table.email'),
            dataIndex: 'email',
            key: 'email',
            render: (text: string) => <Text type="secondary">{text}</Text>,
        },
        {
            title: t('systemUserList.table.locale'),
            dataIndex: 'locale',
            key: 'locale',
            width: 140,
            render: (value?: string | null) => <Text type="secondary">{renderLocaleLabel(value)}</Text>,
        },
        {
            title: t('systemUserList.table.actions'),
            key: 'action',
            width: 140,
            align: 'right',
            render: (_: unknown, record: User) => (
                <Space size="small">
                    <AppButton
                        intent="tertiary"
                        iconOnly
                        size="sm"
                        icon={<EditOutlined />}
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
                            icon={<KeyOutlined />}
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
                            icon={<DeleteOutlined />}
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
                                icon={<DeleteOutlined />}
                                title={t('common.buttons.delete')}
                            />
                        </Popconfirm>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <div className="admin-page admin-page-spaced">
            {/* Page Header */}
            <AppPageHeader
                title={t('systemUserList.page.title')}
                subtitle={t('systemUserList.page.subtitle')}
                action={
                    <AppButton intent="primary" icon={<PlusOutlined />} onClick={handleAddNew}>
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
            <Card className="admin-card overflow-hidden">
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
                    <Card size="small" className="admin-card-subtle">
                        <Row gutter={16}>
                            <Col xs={24} md={12}>
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
                            </Col>
                            {!editingUser && (
                                <Col xs={24} md={12}>
                                    <AppForm.Item
                                        label={t('systemUserList.form.password')}
                                        name="password"
                                        rules={[{ required: true, message: t('systemUserList.form.passwordRequired') }]}
                                    >
                                        <Input.Password placeholder={t('systemUserList.form.passwordPlaceholder')} />
                                    </AppForm.Item>
                                </Col>
                            )}
                            <Col xs={24} md={12}>
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
                            </Col>
                            <Col xs={24} md={12}>
                                <AppForm.Item
                                    label={t('systemUserList.form.locale')}
                                    name="locale"
                                >
                                    <Select
                                        allowClear
                                        placeholder={t('systemUserList.form.localePlaceholder')}
                                        options={localeOptions}
                                    />
                                </AppForm.Item>
                            </Col>
                            <Col span={24}>
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
                            </Col>
                        </Row>
                    </Card>
                </AppForm>
            </AppModal>
        </div>
    );
};

export default SystemUserList;
