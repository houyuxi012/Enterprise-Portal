import React, { useState, useEffect } from 'react';
import App from 'antd/es/app';
import Input from 'antd/es/input';
import Select from 'antd/es/select';
import Popconfirm from 'antd/es/popconfirm';
import Switch from 'antd/es/switch';
import AutoComplete from 'antd/es/auto-complete';
import Tooltip from 'antd/es/tooltip';
import Card from 'antd/es/card';
import Col from 'antd/es/grid/col';
import Row from 'antd/es/grid/row';
import Space from 'antd/es/space';
import Typography from 'antd/es/typography';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { Announcement } from '@/types';
import ApiClient, { type AnnouncementUpsertPayload } from '@/services/api';
import type { ColumnsType } from 'antd/es/table';
import {
    AppButton,
    AppTable,
    AppModal,
    AppForm,
    AppTag,
    AppPageHeader,
} from '@/modules/admin/components/ui';

const { Option } = Select;
const { TextArea } = Input;
const { Text } = Typography;

const TAG_CODES = ['announcement', 'maintenance', 'warning', 'update', 'activity', 'recruitment'] as const;

const resolveErrorMessage = (error: unknown, fallback: string): string => {
    if (
        error
        && typeof error === 'object'
        && 'response' in error
        && typeof (error as { response?: unknown }).response === 'object'
        && (error as { response?: { data?: unknown } }).response
        && 'data' in (error as { response: { data?: unknown } }).response
    ) {
        const data = (error as { response: { data?: { detail?: unknown } } }).response.data;
        const detail = data?.detail;
        if (typeof detail === 'string' && detail.trim()) return detail;
    }
    if (error instanceof Error && error.message.trim()) return error.message;
    return fallback;
};

const AnnouncementList: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { message } = App.useApp();
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<Announcement | null>(null);
    const [loading, setLoading] = useState(false);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [form] = AppForm.useForm();
    const tagAliases = React.useMemo(() => {
        const aliases: Record<string, string> = {};
        TAG_CODES.forEach((code) => {
            aliases[code] = code;
            const zhLabel = String(i18n.t(`announcementList.tags.${code}`, { lng: 'zh-CN' })).trim();
            const enLabel = String(i18n.t(`announcementList.tags.${code}`, { lng: 'en-US' })).trim();
            if (zhLabel) aliases[zhLabel] = code;
            if (enLabel) aliases[enLabel] = code;
        });
        return aliases;
    }, [i18n.resolvedLanguage]);

    const normalizeTag = (value?: string): string => {
        const raw = String(value || '').trim();
        return tagAliases[raw] || raw || 'announcement';
    };

    const formatPublishTime = (record: Announcement) => {
        const createdAt = record.created_at ? new Date(record.created_at) : null;
        if (createdAt && !Number.isNaN(createdAt.getTime())) {
            const locale = i18n.resolvedLanguage === 'zh-CN' ? 'zh-CN' : 'en-US';
            return createdAt.toLocaleString(locale, {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
            });
        }
        return record.time || '-';
    };

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const data = await ApiClient.getAnnouncements();
            setAnnouncements(data);
        } catch (error) {
            message.error(t('announcementList.messages.loadFailed'));
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await ApiClient.deleteAnnouncement(Number(id));
            message.success(t('announcementList.messages.deleteSuccess'));
            fetchData();
        } catch (error) {
            message.error(t('announcementList.messages.deleteFailed'));
        }
    };

    const handleEdit = (item: Announcement) => {
        setEditingItem(item);
        form.setFieldsValue(item);
        setIsModalOpen(true);
    };

    const handleAddNew = () => {
        setEditingItem(null);
        form.resetFields();
        form.setFieldsValue({
            tag: 'announcement',
            color: 'blue',
            is_urgent: false,
        });
        setIsModalOpen(true);
    };

    const handleSubmit = async (values: AnnouncementUpsertPayload) => {
        try {
            setSubmitLoading(true);
            const payload = {
                ...values,
                tag: normalizeTag(values.tag),
            };
            if (editingItem) {
                await ApiClient.updateAnnouncement(Number(editingItem.id), payload);
                message.success(t('announcementList.messages.updateSuccess'));
            } else {
                await ApiClient.createAnnouncement(payload);
                message.success(t('announcementList.messages.createSuccess'));
            }
            setIsModalOpen(false);
            fetchData();
        } catch (error: unknown) {
            const errorMsg = resolveErrorMessage(error, t('announcementList.messages.unknownError'));
            message.error(t('announcementList.messages.actionFailed', { reason: errorMsg }));
        } finally {
            setSubmitLoading(false);
        }
    };

    const columns: ColumnsType<Announcement> = [
        {
            title: t('announcementList.table.title'),
            dataIndex: 'title',
            key: 'title',
            render: (text: string) => <Text strong>{text}</Text>,
        },
        {
            title: t('announcementList.table.content'),
            dataIndex: 'content',
            key: 'content',
            ellipsis: { showTitle: false },
            render: (content: string) => (
                <Tooltip placement="topLeft" title={content}>
                    <Text type="secondary">{content}</Text>
                </Tooltip>
            ),
        },
        {
            title: t('announcementList.table.tag'),
            key: 'tag',
            width: 100,
            render: (_: unknown, record: Announcement) => (
                <AppTag status="info">{t(`announcementList.tags.${normalizeTag(record.tag)}`, { defaultValue: record.tag })}</AppTag>
            ),
        },
        {
            title: t('announcementList.table.status'),
            dataIndex: 'is_urgent',
            key: 'is_urgent',
            width: 100,
            render: (urgent: boolean) => (
                <AppTag status={urgent ? 'error' : 'default'}>
                    {urgent ? t('announcementList.status.urgent') : t('announcementList.status.normal')}
                </AppTag>
            ),
        },
        {
            title: t('announcementList.table.publishTime'),
            key: 'time',
            width: 120,
            render: (_: string, record: Announcement) => (
                <Text type="secondary">{formatPublishTime(record)}</Text>
            ),
        },
        {
            title: t('announcementList.table.actions'),
            key: 'action',
            width: 160,
            render: (_: unknown, record: Announcement) => (
                <Space size="small">
                    <AppButton intent="tertiary" size="sm" icon={<EditOutlined />} onClick={() => handleEdit(record)}>{t('common.buttons.edit')}</AppButton>
                    <Popconfirm title={t('announcementList.confirm.deleteTitle')} onConfirm={() => handleDelete(record.id)}>
                        <AppButton intent="danger" size="sm" icon={<DeleteOutlined />}>{t('common.buttons.delete')}</AppButton>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div className="admin-page admin-page-spaced">
            <AppPageHeader
                title={t('announcementList.page.title')}
                subtitle={t('announcementList.page.subtitle')}
                action={
                    <AppButton intent="primary" icon={<PlusOutlined />} onClick={handleAddNew}>
                        {t('announcementList.page.publishButton')}
                    </AppButton>
                }
            />

            <Card className="admin-card overflow-hidden">
                <AppTable
                    columns={columns}
                    dataSource={announcements}
                    rowKey="id"
                    loading={loading}
                    emptyText={t('announcementList.table.empty')}
                />
            </Card>

            <AppModal
                title={editingItem ? t('announcementList.modal.editTitle') : t('announcementList.modal.createTitle')}
                open={isModalOpen}
                onOk={() => form.submit()}
                onCancel={() => setIsModalOpen(false)}
                confirmLoading={submitLoading}
            >
                <AppForm form={form} onFinish={handleSubmit}>
                    <AppForm.Item name="title" label={t('announcementList.form.title')} rules={[{ required: true, message: t('announcementList.form.validation.titleRequired') }]}>
                        <Input placeholder={t('announcementList.form.placeholders.title')} />
                    </AppForm.Item>
                    <AppForm.Item name="content" label={t('announcementList.form.content')} rules={[{ required: true, message: t('announcementList.form.validation.contentRequired') }]}>
                        <TextArea rows={4} placeholder={t('announcementList.form.placeholders.content')} />
                    </AppForm.Item>
                    <Card size="small" className="admin-card-subtle">
                        <Row gutter={16}>
                            <Col xs={24} md={12}>
                                <AppForm.Item name="tag" label={t('announcementList.form.tag')} rules={[{ required: true, message: t('announcementList.form.validation.tagRequired') }]}>
                                    <AutoComplete
                                        options={[
                                            { value: 'announcement', label: t('announcementList.tags.announcement') },
                                            { value: 'maintenance', label: t('announcementList.tags.maintenance') },
                                            { value: 'warning', label: t('announcementList.tags.warning') },
                                            { value: 'update', label: t('announcementList.tags.update') },
                                            { value: 'activity', label: t('announcementList.tags.activity') },
                                            { value: 'recruitment', label: t('announcementList.tags.recruitment') }
                                        ]}
                                        placeholder={t('announcementList.form.placeholders.tag')}
                                    />
                                </AppForm.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <AppForm.Item name="color" label={t('announcementList.form.color')} rules={[{ required: true, message: t('announcementList.form.validation.colorRequired') }]}>
                                    <Select placeholder={t('announcementList.form.placeholders.color')}>
                                        <Option value="blue">{t('announcementList.colors.blue')}</Option>
                                        <Option value="yellow">{t('announcementList.colors.yellow')}</Option>
                                        <Option value="red">{t('announcementList.colors.red')}</Option>
                                        <Option value="green">{t('announcementList.colors.green')}</Option>
                                    </Select>
                                </AppForm.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <AppForm.Item name="is_urgent" label={t('announcementList.form.urgent')} valuePropName="checked">
                                    <Switch checkedChildren={t('announcementList.status.urgent')} unCheckedChildren={t('announcementList.status.normalShort')} />
                                </AppForm.Item>
                            </Col>
                        </Row>
                    </Card>
                </AppForm>
            </AppModal>
        </div>
    );
};

export default AnnouncementList;
