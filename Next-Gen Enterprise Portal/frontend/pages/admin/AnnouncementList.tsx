import React, { useState, useEffect } from 'react';
import { Input, Select, Popconfirm, message, Switch, AutoComplete, Tooltip, Card } from 'antd';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Announcement } from '../../types';
import ApiClient from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import {
    AppButton,
    AppTable,
    AppModal,
    AppForm,
    AppTag,
    AppPageHeader,
} from '../../components/admin';

const { Option } = Select;
const { TextArea } = Input;

const TAG_CODES = ['announcement', 'maintenance', 'warning', 'update', 'activity', 'recruitment'] as const;

const AnnouncementList: React.FC = () => {
    const { t, i18n } = useTranslation();
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

    const handleDelete = async (id: any) => {
        try {
            await ApiClient.deleteAnnouncement(id);
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

    const handleSubmit = async (values: any) => {
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
        } catch (error: any) {
            const errorMsg = error.response?.data?.detail || error.message || t('announcementList.messages.unknownError');
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
            render: (text: string) => <span className="font-black text-slate-800 dark:text-slate-200">{text}</span>
        },
        {
            title: t('announcementList.table.content'),
            dataIndex: 'content',
            key: 'content',
            ellipsis: { showTitle: false },
            render: (content: string) => (
                <Tooltip placement="topLeft" title={content}>
                    <span className="text-slate-500 text-sm">{content}</span>
                </Tooltip>
            ),
        },
        {
            title: t('announcementList.table.tag'),
            key: 'tag',
            width: 100,
            render: (_: any, record: Announcement) => (
                <AppTag status="info">{t(`announcementList.tags.${normalizeTag(record.tag)}`, { defaultValue: record.tag })}</AppTag>
            ),
        },
        {
            title: t('announcementList.table.status'),
            dataIndex: 'is_urgent',
            key: 'is_urgent',
            width: 100,
            render: (urgent: boolean) => (
                urgent ?
                    <span className="bg-rose-50 text-rose-600 px-2 py-0.5 rounded-lg text-xs font-black border border-rose-100 flex items-center w-fit">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5 animate-pulse"></span>
                        {t('announcementList.status.urgent')}
                    </span> :
                    <span className="text-xs font-bold text-slate-400">{t('announcementList.status.normal')}</span>
            )
        },
        {
            title: t('announcementList.table.publishTime'),
            key: 'time',
            width: 120,
            render: (_: string, record: Announcement) => (
                <span className="text-xs font-bold text-slate-400">{formatPublishTime(record)}</span>
            )
        },
        {
            title: t('announcementList.table.actions'),
            key: 'action',
            width: 160,
            render: (_: any, record: Announcement) => (
                <div className="flex gap-2">
                    <AppButton intent="tertiary" size="sm" icon={<Edit size={14} />} onClick={() => handleEdit(record)}>{t('common.buttons.edit')}</AppButton>
                    <Popconfirm title={t('announcementList.confirm.deleteTitle')} onConfirm={() => handleDelete(record.id)}>
                        <AppButton intent="danger" size="sm" icon={<Trash2 size={14} />}>{t('common.buttons.delete')}</AppButton>
                    </Popconfirm>
                </div>
            ),
        },
    ];

    return (
        <div className="admin-page p-6 bg-slate-50/50 dark:bg-slate-900/50 min-h-full -m-6">
            <AppPageHeader
                title={t('announcementList.page.title')}
                subtitle={t('announcementList.page.subtitle')}
                action={
                    <AppButton intent="primary" icon={<Plus size={16} />} onClick={handleAddNew}>
                        {t('announcementList.page.publishButton')}
                    </AppButton>
                }
            />

            <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
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
                    <div className="grid grid-cols-2 gap-4">
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
                        <AppForm.Item name="color" label={t('announcementList.form.color')} rules={[{ required: true, message: t('announcementList.form.validation.colorRequired') }]}>
                            <Select placeholder={t('announcementList.form.placeholders.color')}>
                                <Option value="blue">{t('announcementList.colors.blue')}</Option>
                                <Option value="yellow">{t('announcementList.colors.yellow')}</Option>
                                <Option value="red">{t('announcementList.colors.red')}</Option>
                                <Option value="green">{t('announcementList.colors.green')}</Option>
                            </Select>
                        </AppForm.Item>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <AppForm.Item name="is_urgent" label={t('announcementList.form.urgent')} valuePropName="checked">
                            <Switch checkedChildren={t('announcementList.status.urgent')} unCheckedChildren={t('announcementList.status.normalShort')} />
                        </AppForm.Item>
                    </div>
                </AppForm>
            </AppModal>
        </div>
    );
};

export default AnnouncementList;
