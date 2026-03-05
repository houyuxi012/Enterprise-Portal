import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Shield } from 'lucide-react';
import { Role, Permission } from '@/types';
import ApiClient from '@/services/api';
import { message, Checkbox, Empty, Tooltip, Input, Popconfirm } from 'antd';
import { useTranslation } from 'react-i18next';
import {
    AppButton,
    AppModal,
    AppForm,
    AppTag,
    AppPageHeader,
    AppFilterBar,
} from '@/components/admin';
import { getCurrentLocale, getLocalizedRoleMeta } from '@/utils/iamRoleI18n';

const RESERVED_ROLE_CODES = new Set(['user', 'portaladmin', 'portal_admin', 'superadmin']);

const RoleList: React.FC = () => {
    const { t } = useTranslation();
    const [roles, setRoles] = useState<Role[]>([]);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [loading, setLoading] = useState(false);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);
    const [search, setSearch] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const currentLocale = getCurrentLocale();

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
            message.error(t('roleList.messages.loadFailed'));
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
            message.success(t('roleList.messages.deleteSuccess'));
        } catch (e: any) {
            message.error(e.response?.data?.detail || t('roleList.messages.deleteFailed'));
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
                message.success(t('roleList.messages.updateSuccess'));
            } else {
                await ApiClient.createRole(values);
                message.success(t('roleList.messages.createSuccess'));
            }
            setIsEditorOpen(false);
            fetchData();
        } catch (error: any) {
            message.error(error.response?.data?.detail || t('roleList.messages.saveFailed'));
        } finally {
            setSubmitting(false);
        }
    };

    const normalizedSearch = search.trim().toLowerCase();
    const filteredRoles = roles.filter((role) => {
        if (!normalizedSearch) return true;
        const localized = getLocalizedRoleMeta(role, currentLocale);
        return (
            localized.name.toLowerCase().includes(normalizedSearch) ||
            role.code.toLowerCase().includes(normalizedSearch) ||
            localized.description.toLowerCase().includes(normalizedSearch)
        );
    });
    const isReservedRole = (code: string) => RESERVED_ROLE_CODES.has((code || '').toLowerCase());

    return (
        <div className="admin-page p-6 bg-slate-50/50 dark:bg-slate-900/50 min-h-full -m-6">
            {/* Page Header */}
            <AppPageHeader
                title={t('roleList.page.title')}
                subtitle={t('roleList.page.subtitle')}
                action={
                    <AppButton intent="primary" icon={<Plus size={16} />} onClick={handleAddNew}>
                        {t('roleList.page.createButton')}
                    </AppButton>
                }
            />

            {/* Filter Bar */}
            <AppFilterBar>
                <AppFilterBar.Search
                    placeholder={t('roleList.filter.searchPlaceholder')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onSearch={setSearch}
                />
            </AppFilterBar>

            {/* Role Cards Grid */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-100 dark:border-slate-700">
                {loading ? (
                    <div className="text-center py-12 text-slate-400">{t('roleList.states.loading')}</div>
                ) : filteredRoles.length === 0 ? (
                    <Empty description={t('roleList.states.empty')} />
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredRoles.map(role => {
                            const localizedRole = getLocalizedRoleMeta(role, currentLocale);
                            return (
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
                                    {!isReservedRole(role.code) && (
                                        <Popconfirm
                                            title={t('roleList.confirm.deleteTitle')}
                                            description={t('roleList.confirm.deleteDescription')}
                                            onConfirm={() => handleDelete(role.id)}
                                            okText={t('common.buttons.delete')}
                                            cancelText={t('common.buttons.cancel')}
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
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isReservedRole(role.code)
                                            ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                                            : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                        }`}>
                                        <Shield size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-slate-800 dark:text-white">{localizedRole.name}</h3>
                                        <span className="text-xs font-mono text-slate-400 bg-slate-50 dark:bg-slate-900 px-2 py-0.5 rounded">
                                            {role.code}
                                        </span>
                                    </div>
                                </div>

                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-1">
                                    {localizedRole.description || t('roleList.card.noDescription')}
                                </p>

                                {/* Permissions */}
                                <div>
                                    <p className="text-xs font-medium text-slate-400 mb-2">
                                        {t('roleList.card.permissions', { count: role.permissions?.length || 0 })}
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                        {role.permissions?.slice(0, 5).map(p => (
                                            <Tooltip key={p.id} title={p.description}>
                                                <AppTag status="default">{p.code}</AppTag>
                                            </Tooltip>
                                        ))}
                                        {(role.permissions?.length || 0) > 5 && (
                                            <span className="text-xs text-slate-400">
                                                {t('roleList.card.more', { count: role.permissions!.length - 5 })}
                                            </span>
                                        )}
                                        {(!role.permissions || role.permissions.length === 0) && (
                                            <span className="text-xs text-slate-300 italic">{t('roleList.card.noPermissions')}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )})}
                    </div>
                )}
            </div>

            {/* Edit/Create Modal */}
            <AppModal
                title={editingRole ? t('roleList.modal.editTitle') : t('roleList.modal.createTitle')}
                open={isEditorOpen}
                onCancel={() => setIsEditorOpen(false)}
                onOk={() => form.submit()}
                confirmLoading={submitting}
                okText={editingRole ? t('roleList.modal.saveChanges') : t('roleList.modal.createRole')}
                width={640}
            >
                <AppForm
                    form={form}
                    onFinish={handleSubmit}
                    initialValues={{ permission_ids: [] }}
                >
                    <div className="grid grid-cols-2 gap-4">
                        <AppForm.Item
                            label={t('roleList.form.name')}
                            name="name"
                            rules={[{ required: true, message: t('roleList.form.validation.nameRequired') }]}
                        >
                            <Input placeholder={t('roleList.form.placeholders.name')} />
                        </AppForm.Item>

                        <AppForm.Item
                            label={t('roleList.form.code')}
                            name="code"
                            rules={[{ required: true, message: t('roleList.form.validation.codeRequired') }]}
                        >
                            <Input
                                placeholder={t('roleList.form.placeholders.code')}
                                disabled={!!editingRole}
                            />
                        </AppForm.Item>
                    </div>

                    <AppForm.Item label={t('roleList.form.description')} name="description">
                        <Input placeholder={t('roleList.form.placeholders.description')} />
                    </AppForm.Item>

                    <AppForm.Item label={t('roleList.form.permissions')} name="permission_ids">
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
                                            {t('roleList.form.noPermissionsHint')}
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
