import React, { useState, useEffect } from 'react';
import { Role, Permission } from '@/types';
import ApiClient from '@/services/api';
import App from 'antd/es/app';
import Card from 'antd/es/card';
import Checkbox from 'antd/es/checkbox';
import Empty from 'antd/es/empty';
import Input from 'antd/es/input';
import Popconfirm from 'antd/es/popconfirm';
import Row from 'antd/es/grid/row';
import Col from 'antd/es/grid/col';
import Space from 'antd/es/space';
import Tooltip from 'antd/es/tooltip';
import Typography from 'antd/es/typography';
import { DeleteOutlined, EditOutlined, PlusOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
    AppButton,
    AppModal,
    AppForm,
    AppTag,
    AppPageHeader,
    AppFilterBar,
} from '@/modules/admin/components/ui';
import { getCurrentLocale, getLocalizedRoleMeta } from '@/shared/utils/iamRoleI18n';

const RESERVED_ROLE_CODES = new Set(['user', 'portaladmin', 'portal_admin', 'superadmin']);

type RoleFormValues = {
    code: string;
    name: string;
    description?: string;
    permission_ids: number[];
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
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (detail && typeof detail === 'object' && typeof detail.message === 'string' && detail.message.trim()) return detail.message;
    return fallback;
};

const { Paragraph, Text } = Typography;

const RoleList: React.FC = () => {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [roles, setRoles] = useState<Role[]>([]);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [loading, setLoading] = useState(false);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);
    const [search, setSearch] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const currentLocale = getCurrentLocale();

    const [form] = AppForm.useForm<RoleFormValues>();

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
        } catch (e: unknown) {
            message.error(resolveApiErrorMessage(e, t('roleList.messages.deleteFailed')));
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

    const handleSubmit = async (values: RoleFormValues) => {
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
        } catch (error: unknown) {
            message.error(resolveApiErrorMessage(error, t('roleList.messages.saveFailed')));
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
        <div className="admin-page admin-page-spaced">
            {/* Page Header */}
            <AppPageHeader
                title={t('roleList.page.title')}
                subtitle={t('roleList.page.subtitle')}
                action={
                    <AppButton intent="primary" icon={<PlusOutlined />} onClick={handleAddNew}>
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
            <Card className="admin-card" styles={{ body: { padding: 24 } }}>
                {loading ? (
                    <Empty description={t('roleList.states.loading')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : filteredRoles.length === 0 ? (
                    <Empty description={t('roleList.states.empty')} />
                ) : (
                    <Row gutter={[16, 16]}>
                        {filteredRoles.map((role) => {
                            const localizedRole = getLocalizedRoleMeta(role, currentLocale);
                            const reservedRole = isReservedRole(role.code);
                            const permissionCount = role.permissions?.length || 0;

                            return (
                                <Col key={role.id} xs={24} md={12} xl={8}>
                                    <Card
                                        size="small"
                                        className="admin-card admin-card-subtle h-full"
                                        title={
                                            <Space align="start" size={12}>
                                                <AppTag status={reservedRole ? 'processing' : 'default'} icon={<SafetyCertificateOutlined />}>
                                                    {localizedRole.name}
                                                </AppTag>
                                                <Text type="secondary" code>
                                                    {role.code}
                                                </Text>
                                            </Space>
                                        }
                                        extra={
                                            <Space size={4}>
                                                <AppButton
                                                    intent="tertiary"
                                                    iconOnly
                                                    size="sm"
                                                    icon={<EditOutlined />}
                                                    onClick={() => handleEdit(role)}
                                                />
                                                {!reservedRole && (
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
                                                            icon={<DeleteOutlined />}
                                                        />
                                                    </Popconfirm>
                                                )}
                                            </Space>
                                        }
                                    >
                                        <Space direction="vertical" size={16} style={{ width: '100%' }}>
                                            <div>
                                                <Paragraph type="secondary" ellipsis={{ rows: 2, tooltip: localizedRole.description || t('roleList.card.noDescription') }} style={{ marginBottom: 0 }}>
                                                    {localizedRole.description || t('roleList.card.noDescription')}
                                                </Paragraph>
                                            </div>

                                            <div>
                                                <Text type="secondary">
                                                    {t('roleList.card.permissions', { count: permissionCount })}
                                                </Text>
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {role.permissions?.slice(0, 5).map((permission) => (
                                                        <Tooltip key={permission.id} title={permission.description}>
                                                            <AppTag status="default">{permission.code}</AppTag>
                                                        </Tooltip>
                                                    ))}
                                                    {permissionCount > 5 && (
                                                        <Text type="secondary">
                                                            {t('roleList.card.more', { count: permissionCount - 5 })}
                                                        </Text>
                                                    )}
                                                    {permissionCount === 0 && (
                                                        <Text type="secondary" italic>
                                                            {t('roleList.card.noPermissions')}
                                                        </Text>
                                                    )}
                                                </div>
                                            </div>
                                        </Space>
                                    </Card>
                                </Col>
                            );
                        })}
                    </Row>
                )}
            </Card>

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
                    <Row gutter={16}>
                        <Col xs={24} md={12}>
                            <AppForm.Item
                                label={t('roleList.form.name')}
                                name="name"
                                rules={[{ required: true, message: t('roleList.form.validation.nameRequired') }]}
                            >
                                <Input placeholder={t('roleList.form.placeholders.name')} />
                            </AppForm.Item>
                        </Col>
                        <Col xs={24} md={12}>
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
                        </Col>
                    </Row>

                    <AppForm.Item label={t('roleList.form.description')} name="description">
                        <Input placeholder={t('roleList.form.placeholders.description')} />
                    </AppForm.Item>

                    <AppForm.Item label={t('roleList.form.permissions')} name="permission_ids">
                        <Card size="small" className="admin-card-subtle" styles={{ body: { maxHeight: 240, overflowY: 'auto' } }}>
                            <Checkbox.Group style={{ width: '100%' }}>
                                <Row gutter={[12, 12]}>
                                    {permissions.map((permission) => (
                                        <Col key={permission.id} xs={24} md={12}>
                                            <Space align="start" size={8}>
                                                <Checkbox value={permission.id} />
                                                <div>
                                                    <Text strong>{permission.code}</Text>
                                                    <br />
                                                    <Text type="secondary">{permission.description}</Text>
                                                </div>
                                            </Space>
                                        </Col>
                                    ))}
                                    {permissions.length === 0 && (
                                        <Col span={24}>
                                            <Text type="secondary">{t('roleList.form.noPermissionsHint')}</Text>
                                        </Col>
                                    )}
                                </Row>
                            </Checkbox.Group>
                        </Card>
                    </AppForm.Item>
                </AppForm>
            </AppModal>
        </div>
    );
};

export default RoleList;
