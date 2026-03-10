import React, { useState, useEffect } from 'react';
import { Department, UserOption } from '@/types';
import ApiClient, { type DepartmentCreatePayload, type DepartmentUpdatePayload } from '@/services/api';
import { App, Card, Col, Descriptions, Empty, Input, List, Popconfirm, Row, Select, Space, Statistic, Tag, Tree, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { TeamOutlined, UserOutlined, ApartmentOutlined, FolderOutlined, PlusOutlined, EditOutlined, DeleteOutlined, RightOutlined } from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import {
    AppButton,
    AppModal,
    AppForm,
    AppPageHeader,
} from '@/modules/admin/components/ui';

const { TextArea } = Input;

type OrganizationFormValues = {
    name: string;
    parent_id?: number | null;
    description?: string;
    manager?: string;
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

const { Paragraph, Text, Title } = Typography;

const OrganizationList: React.FC = () => {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [departments, setDepartments] = useState<Department[]>([]);
    const [treeData, setTreeData] = useState<DataNode[]>([]);
    const [selectedDept, setSelectedDept] = useState<Department | null>(null);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
    const [form] = AppForm.useForm<OrganizationFormValues>();
    const [editingId, setEditingId] = useState<number | null>(null);
    const [userOptions, setUserOptions] = useState<UserOption[]>([]);

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
            message.error(t('organizationList.messages.loadFailed'));
        }
    };

    const getManagerDisplay = (manager?: string | null) => {
        if (!manager) return '';
        const matched = userOptions.find((u) => u.username === manager);
        if (!matched) return manager;
        return matched.name ? `${matched.name}（${matched.username}）` : matched.username;
    };

    const buildTreeData = (depts: Department[]): DataNode[] => {
        return depts.map((dept) => ({
            title: (
                <Space size={8}>
                    <Text strong>{dept.name}</Text>
                    {dept.children && dept.children.length > 0 && <Tag color="blue">{dept.children.length}</Tag>}
                </Space>
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
            message.success(t('organizationList.messages.deleteSuccess'));
            fetchData();
            setSelectedDept(null);
        } catch (e: unknown) {
            message.error(resolveApiErrorMessage(e, t('organizationList.messages.deleteFailed')));
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

    const handleSubmit = async (values: OrganizationFormValues) => {
        try {
            setLoading(true);
            const basePayload = {
                name: values.name,
                parent_id: values.parent_id ?? null,
                description: values.description || undefined,
                manager: values.manager || undefined,
            };
            if (editingId) {
                const payload: DepartmentUpdatePayload = basePayload;
                await ApiClient.updateDepartment(editingId, payload);
                message.success(t('organizationList.messages.updateSuccess'));
            } else {
                const payload: DepartmentCreatePayload = basePayload;
                await ApiClient.createDepartment(payload);
                message.success(t('organizationList.messages.createSuccess'));
            }
            setIsEditorOpen(false);
            fetchData();
        } catch (e: unknown) {
            message.error(resolveApiErrorMessage(e, t('organizationList.messages.deleteFailed')));
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
        <div className="admin-page admin-page-spaced">
            <AppPageHeader
                title={t('organizationList.page.title')}
                subtitle={t('organizationList.page.subtitle')}
                action={
                    <AppButton intent="primary" icon={<PlusOutlined />} onClick={() => openCreateModal(null)}>
                        {t('organizationList.page.createRoot')}
                    </AppButton>
                }
            />

            <Row gutter={16}>
                {/* Left: Tree Card */}
                <Col xs={24} lg={8}>
                    <Card
                        title={
                            <div className="flex items-center gap-2">
                                <FolderOutlined className="text-blue-500" />
                                <span>{t('organizationList.tree.title')}</span>
                            </div>
                        }
                        extra={<Tag color="blue">{t('organizationList.tree.count', { count: countDepts(departments) })}</Tag>}
                        className="admin-card mb-4"
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
                            <Empty description={t('organizationList.tree.empty')} className="mt-16" />
                        )}
                    </Card>
                </Col>

                {/* Right: Details Card */}
                <Col xs={24} lg={16}>
                    <Card
                        className="admin-card"
                        styles={{ body: { minHeight: 500 } }}
                    >
                        {selectedDept ? (
                            <Space direction="vertical" size={24} style={{ width: '100%' }}>
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                        <Title level={4} style={{ marginBottom: 4 }}>
                                            {selectedDept.name}
                                        </Title>
                                        <Space wrap size={8}>
                                            <Text type="secondary" code>
                                                ID: {selectedDept.id}
                                            </Text>
                                            {selectedDept.manager && (
                                                <Tag icon={<UserOutlined />} color="processing">
                                                    {getManagerDisplay(selectedDept.manager)}
                                                </Tag>
                                            )}
                                        </Space>
                                    </div>
                                    <Space size={8}>
                                        <AppButton intent="tertiary" size="sm" icon={<EditOutlined />} onClick={() => openEditModal(selectedDept)}>
                                            {t('common.buttons.edit')}
                                        </AppButton>
                                        <Popconfirm
                                            title={t('organizationList.confirm.deleteTitle')}
                                            description={t('organizationList.confirm.deleteDescription')}
                                            onConfirm={() => handleDelete(selectedDept.id)}
                                            okText={t('common.buttons.confirm')}
                                            cancelText={t('common.buttons.cancel')}
                                        >
                                            <AppButton intent="danger" size="sm" icon={<DeleteOutlined />}>
                                                {t('common.buttons.delete')}
                                            </AppButton>
                                        </Popconfirm>
                                    </Space>
                                </div>

                                <Descriptions bordered size="small" column={1} labelStyle={{ width: 120, fontWeight: 600 }}>
                                    <Descriptions.Item label={t('organizationList.detail.name')}>{selectedDept.name}</Descriptions.Item>
                                    <Descriptions.Item label={t('organizationList.detail.manager')}>
                                        {selectedDept.manager ? getManagerDisplay(selectedDept.manager) : <Text type="secondary">{t('organizationList.detail.unset')}</Text>}
                                    </Descriptions.Item>
                                    <Descriptions.Item label={t('organizationList.detail.parent')}>
                                        {selectedDept.parent_id
                                            ? allDepts.find((d) => d.id === selectedDept.parent_id)?.name || t('organizationList.detail.unknown')
                                            : <Tag color="gold">{t('organizationList.detail.root')}</Tag>}
                                    </Descriptions.Item>
                                    <Descriptions.Item label={t('organizationList.detail.description')}>
                                        {selectedDept.description ? (
                                            <Paragraph style={{ marginBottom: 0 }}>{selectedDept.description}</Paragraph>
                                        ) : (
                                            <Text type="secondary" italic>
                                                {t('organizationList.detail.noDescription')}
                                            </Text>
                                        )}
                                    </Descriptions.Item>
                                </Descriptions>

                                <Row gutter={16}>
                                    <Col xs={24} md={8}>
                                        <Card size="small" className="admin-card-subtle">
                                            <Statistic
                                                title={t('organizationList.children.title')}
                                                value={selectedDept.children?.length || 0}
                                                prefix={<TeamOutlined />}
                                            />
                                        </Card>
                                    </Col>
                                    <Col xs={24} md={8}>
                                        <Card size="small" className="admin-card-subtle">
                                            <Statistic
                                                title={t('organizationList.detail.manager')}
                                                value={selectedDept.manager ? 1 : 0}
                                                prefix={<UserOutlined />}
                                            />
                                        </Card>
                                    </Col>
                                    <Col xs={24} md={8}>
                                        <Card size="small" className="admin-card-subtle">
                                            <Statistic
                                                title={t('organizationList.detail.parent')}
                                                value={selectedDept.parent_id ? 1 : 0}
                                                prefix={<ApartmentOutlined />}
                                            />
                                        </Card>
                                    </Col>
                                </Row>

                                <Card
                                    title={
                                        <Space size={8}>
                                            <TeamOutlined />
                                            <span>{t('organizationList.children.title')}</span>
                                            <Tag color="blue">{selectedDept.children?.length || 0}</Tag>
                                        </Space>
                                    }
                                    extra={
                                        <AppButton intent="tertiary" size="sm" icon={<PlusOutlined />} onClick={() => openCreateModal(selectedDept.id)}>
                                            {t('organizationList.children.add')}
                                        </AppButton>
                                    }
                                    className="admin-card admin-card-subtle"
                                    size="small"
                                >
                                    {selectedDept.children && selectedDept.children.length > 0 ? (
                                        <List
                                            itemLayout="horizontal"
                                            dataSource={selectedDept.children}
                                            renderItem={(child) => (
                                                <List.Item
                                                    actions={[
                                                        <AppButton
                                                            key={`open-${child.id}`}
                                                            intent="tertiary"
                                                            size="sm"
                                                            icon={<RightOutlined />}
                                                            onClick={() => {
                                                                setSelectedDept(child);
                                                                setExpandedKeys((prev) => [...new Set([...prev, selectedDept.id])]);
                                                            }}
                                                        >
                                                            {t('common.buttons.detail')}
                                                        </AppButton>,
                                                    ]}
                                                >
                                                    <List.Item.Meta
                                                        title={<Text strong>{child.name}</Text>}
                                                        description={
                                                            child.manager ? (
                                                                <Tag>{getManagerDisplay(child.manager)}</Tag>
                                                            ) : (
                                                                <Text type="secondary">{t('organizationList.detail.unset')}</Text>
                                                            )
                                                        }
                                                    />
                                                </List.Item>
                                            )}
                                        />
                                    ) : (
                                        <Empty description={t('organizationList.children.empty')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                                    )}
                                </Card>
                            </Space>
                        ) : (
                            <Empty
                                image={<ApartmentOutlined style={{ fontSize: 48, color: '#94a3b8' }} />}
                                description={t('organizationList.empty.selectHint')}
                            >
                                <AppButton intent="secondary" onClick={() => openCreateModal(null)} icon={<PlusOutlined />}>
                                    {t('organizationList.page.createRoot')}
                                </AppButton>
                            </Empty>
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
                title={editingId ? t('organizationList.modal.editTitle') : t('organizationList.modal.createTitle')}
                width={480}
            >
                <AppForm form={form} onFinish={handleSubmit}>
                    <AppForm.Item name="name" label={t('organizationList.form.name')} rules={[{ required: true, message: t('organizationList.form.validation.nameRequired') }]}>
                        <Input placeholder={t('organizationList.form.placeholders.name')} />
                    </AppForm.Item>
                    <AppForm.Item name="parent_id" label={t('organizationList.form.parent')}>
                        <Select
                            placeholder={t('organizationList.form.placeholders.root')}
                            allowClear
                            options={[
                                { value: null, label: t('organizationList.form.placeholders.root') },
                                ...allDepts.filter(d => d.id !== editingId).map(d => ({ value: d.id, label: d.name }))
                            ]}
                        />
                    </AppForm.Item>
                    <AppForm.Item name="manager" label={t('organizationList.form.manager')}>
                        <Select
                            placeholder={t('organizationList.form.placeholders.manager')}
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
                    <AppForm.Item name="description" label={t('organizationList.form.description')}>
                        <TextArea placeholder={t('organizationList.form.placeholders.description')} rows={3} />
                    </AppForm.Item>
                </AppForm>
            </AppModal>
        </div>
    );
};

export default OrganizationList;
