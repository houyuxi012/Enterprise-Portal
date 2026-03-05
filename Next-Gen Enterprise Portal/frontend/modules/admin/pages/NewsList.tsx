import React, { useState, useEffect } from 'react';
import { Input, DatePicker, Select, Popconfirm, message, Upload, Switch, Image, Card } from 'antd';
import type { GetProp, UploadFile, UploadProps } from 'antd';
import { Plus, Edit, Trash2, Search } from 'lucide-react';
import { PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { NewsItem } from '@/types';
import ApiClient from '@/services/api';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import {
    AppButton,
    AppTable,
    AppModal,
    AppForm,
    AppPageHeader,
    AppFilterBar,
} from '@/components/admin';

type FileType = Parameters<GetProp<UploadProps, 'beforeUpload'>>[0];

const getBase64 = (file: FileType): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
    });

const { Option } = Select;
const { TextArea } = Input;

const CATEGORY_CODES = ['announcement', 'activity', 'policy', 'culture'] as const;

const NewsList: React.FC = () => {
    const { t, i18n } = useTranslation();
    const [news, setNews] = useState<NewsItem[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingNews, setEditingNews] = useState<NewsItem | null>(null);
    const [textSearch, setTextSearch] = useState('');
    const [form] = AppForm.useForm();
    const [loading, setLoading] = useState(false);
    const [submitLoading, setSubmitLoading] = useState(false);
    const categoryAliases = React.useMemo(() => {
        const aliases: Record<string, string> = {};
        CATEGORY_CODES.forEach((code) => {
            aliases[code] = code;
            const zhLabel = String(i18n.t(`newsList.categories.${code}`, { lng: 'zh-CN' })).trim();
            const enLabel = String(i18n.t(`newsList.categories.${code}`, { lng: 'en-US' })).trim();
            if (zhLabel) aliases[zhLabel] = code;
            if (enLabel) aliases[enLabel] = code;
        });
        return aliases;
    }, [i18n.resolvedLanguage]);

    const normalizeCategory = (value?: string): string => {
        const raw = String(value || '').trim();
        return categoryAliases[raw] || raw || 'announcement';
    };

    // Upload state
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewImage, setPreviewImage] = useState('');
    const [fileList, setFileList] = useState<UploadFile[]>([]);

    useEffect(() => {
        fetchNews();
    }, []);

    const fetchNews = async () => {
        setLoading(true);
        try {
            const data = await ApiClient.getNews();
            setNews(data);
        } catch (error) {
            console.error(error);
            message.error(t('newsList.messages.loadFailed'));
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: any) => {
        try {
            await ApiClient.deleteNews(id);
            message.success(t('newsList.messages.deleteSuccess'));
            fetchNews();
        } catch (error) {
            message.error(t('newsList.messages.deleteFailed'));
        }
    };

    const handleEdit = (item: NewsItem) => {
        setEditingNews(item);
        form.setFieldsValue({
            ...item,
            category: normalizeCategory(item.category),
            date: dayjs(item.date)
        });

        // Init fileList for existing image
        if (item.image) {
            setFileList([
                {
                    uid: '-1',
                    name: 'image.png',
                    status: 'done',
                    url: item.image,
                }
            ]);
        } else {
            setFileList([]);
        }

        setIsModalOpen(true);
    };

    const handleAddNew = () => {
        setEditingNews(null);
        form.resetFields();
        form.setFieldsValue({
            category: 'announcement',
            date: dayjs(),
            author: 'Admin',
            image: ''
        });
        setFileList([]);
        setIsModalOpen(true);
    };

    const handlePreview = async (file: UploadFile) => {
        if (!file.url && !file.preview) {
            file.preview = await getBase64(file.originFileObj as FileType);
        }

        setPreviewImage(file.url || (file.preview as string));
        setPreviewOpen(true);
    };

    const handleChange: UploadProps['onChange'] = ({ fileList: newFileList }) =>
        setFileList(newFileList);

    const handleSubmit = async (values: any) => {
        try {
            setSubmitLoading(true);
            const payload = {
                ...values,
                date: values.date.format('YYYY-MM-DD')
            };

            if (editingNews) {
                await ApiClient.updateNews(Number(editingNews.id), payload);
                message.success(t('newsList.messages.updateSuccess'));
            } else {
                await ApiClient.createNews(payload);
                message.success(t('newsList.messages.createSuccess'));
            }
            setIsModalOpen(false);
            fetchNews();
        } catch (error: any) {
            const errorDetail = error?.response?.data?.detail || error?.message || t('newsList.messages.unknownError');
            const errorMsg = typeof errorDetail === 'object' ? JSON.stringify(errorDetail) : errorDetail;
            message.error(t('newsList.messages.actionFailed', { reason: errorMsg }));
        } finally {
            setSubmitLoading(false);
        }
    };

    const filteredNews = news.filter(n =>
        n.title.toLowerCase().includes(textSearch.toLowerCase())
    );

    const columns: ColumnsType<NewsItem> = [
        {
            title: t('newsList.table.cover'),
            dataIndex: 'image',
            key: 'image',
            width: 80,
            render: (image: string) => (
                <div className="w-12 h-8 rounded-lg overflow-hidden border border-slate-200 shadow-sm">
                    <img src={image} alt={t('newsList.table.coverAlt')} className="w-full h-full object-cover" />
                </div>
            )
        },
        {
            title: t('newsList.table.title'),
            dataIndex: 'title',
            key: 'title',
            render: (text: string, record: NewsItem) => (
                <div className="flex items-center space-x-2">
                    {record.is_top && (
                        <span className="bg-rose-50 text-rose-600 text-[10px] font-bold px-1.5 py-0.5 rounded border border-rose-100">
                            {t('newsList.table.topBadge')}
                        </span>
                    )}
                    <span className="font-bold text-slate-700 dark:text-slate-200">{text}</span>
                </div>
            )
        },
        {
            title: t('newsList.table.category'),
            dataIndex: 'category',
            key: 'category',
            width: 100,
            render: (category: string) => (
                <span className="bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300 text-xs font-bold px-2.5 py-1 rounded-lg border border-indigo-100 dark:border-indigo-800">
                    {t(`newsList.categories.${normalizeCategory(category)}`, { defaultValue: category })}
                </span>
            ),
        },
        {
            title: t('newsList.table.publishDate'),
            dataIndex: 'date',
            key: 'date',
            width: 120,
            render: (date: string) => (
                <span className="text-slate-500 font-medium text-xs">{date}</span>
            )
        },
        {
            title: t('newsList.table.actions'),
            key: 'action',
            width: 160,
            render: (_: any, record: NewsItem) => (
                <div className="flex gap-2">
                    <AppButton
                        intent="tertiary"
                        size="sm"
                        icon={<Edit size={14} />}
                        onClick={() => handleEdit(record)}
                    >
                        {t('common.buttons.edit')}
                    </AppButton>
                    <Popconfirm title={t('newsList.confirm.deleteTitle')} onConfirm={() => handleDelete(record.id)}>
                        <AppButton intent="danger" size="sm" icon={<Trash2 size={14} />}>
                            {t('common.buttons.delete')}
                        </AppButton>
                    </Popconfirm>
                </div>
            ),
        },
    ];

    return (
        <div className="admin-page p-6 bg-slate-50/50 dark:bg-slate-900/50 min-h-full -m-6">
            <AppPageHeader
                title={t('newsList.page.title')}
                subtitle={t('newsList.page.subtitle')}
                action={
                    <AppButton intent="primary" icon={<Plus size={16} />} onClick={handleAddNew}>
                        {t('newsList.page.publishButton')}
                    </AppButton>
                }
            />

            <AppFilterBar>
                <AppFilterBar.Search
                    placeholder={t('newsList.filters.searchPlaceholder')}
                    value={textSearch}
                    onChange={e => setTextSearch(e.target.value)}
                    onSearch={setTextSearch}
                />
            </AppFilterBar>

            <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
                <AppTable
                    columns={columns}
                    dataSource={filteredNews}
                    rowKey="id"
                    loading={loading}
                    emptyText={t('newsList.table.empty')}
                />
            </Card>

            <AppModal
                title={editingNews ? t('newsList.modal.editTitle') : t('newsList.modal.createTitle')}
                open={isModalOpen}
                onOk={() => form.submit()}
                onCancel={() => setIsModalOpen(false)}
                confirmLoading={submitLoading}
                width={800}
                okText={t('newsList.modal.okText')}
            >
                <AppForm form={form} onFinish={handleSubmit}>
                    {/* Hidden Author Field */}
                    <AppForm.Item name="author" hidden>
                        <Input />
                    </AppForm.Item>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Left Column: Image Upload */}
                        <div className="md:col-span-1 space-y-4">
                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">{t('newsList.modal.sections.cover')}</h3>
                            <AppForm.Item name="image" rules={[{ required: true, message: t('newsList.form.validation.imageRequired') }]} noStyle>
                                <Input hidden />
                            </AppForm.Item>

                            <Upload
                                listType="picture-card"
                                fileList={fileList}
                                onPreview={handlePreview}
                                onChange={handleChange}
                                maxCount={1}
                                customRequest={async ({ file, onSuccess, onError }) => {
                                    try {
                                        const url = await ApiClient.uploadImage(file as File);
                                        form.setFieldsValue({ image: url });
                                        message.success(t('newsList.messages.uploadSuccess'));
                                        onSuccess?.(url);
                                    } catch (err) {
                                        message.error(t('newsList.messages.uploadFailed'));
                                        onError?.(err as Error);
                                    }
                                }}
                            >
                                {fileList.length >= 1 ? null : (
                                    <button style={{ border: 0, background: 'none' }} type="button">
                                        <PlusOutlined />
                                        <div style={{ marginTop: 8 }}>{t('newsList.form.uploadCover')}</div>
                                    </button>
                                )}
                            </Upload>

                            {previewImage && (
                                <Image
                                    wrapperStyle={{ display: 'none' }}
                                    preview={{
                                        visible: previewOpen,
                                        onVisibleChange: (visible) => setPreviewOpen(visible),
                                        afterOpenChange: (visible) => !visible && setPreviewImage(''),
                                    }}
                                    src={previewImage}
                                />
                            )}

                            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700 mt-4">
                                <AppForm.Item name="is_top" label={t('newsList.form.topPromotion')} valuePropName="checked" className="mb-0">
                                    <Switch checkedChildren={t('newsList.form.switch.on')} unCheckedChildren={t('newsList.form.switch.off')} />
                                </AppForm.Item>
                                <p className="text-xs text-slate-400 mt-2">{t('newsList.form.topPromotionHint')}</p>
                            </div>
                        </div>

                        {/* Right Column: Info & Content */}
                        <div className="md:col-span-2 space-y-4">
                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">{t('newsList.modal.sections.basic')}</h3>
                            <AppForm.Item name="title" label={t('newsList.form.title')} rules={[{ required: true, message: t('newsList.form.validation.titleRequired') }]}>
                                <Input placeholder={t('newsList.form.placeholders.title')} />
                            </AppForm.Item>

                            <div className="grid grid-cols-2 gap-4">
                                <AppForm.Item name="category" label={t('newsList.form.category')} rules={[{ required: true, message: t('newsList.form.validation.categoryRequired') }]}>
                                    <Select placeholder={t('newsList.form.placeholders.category')}>
                                        <Option value="announcement">{t('newsList.categories.announcement')}</Option>
                                        <Option value="activity">{t('newsList.categories.activity')}</Option>
                                        <Option value="policy">{t('newsList.categories.policy')}</Option>
                                        <Option value="culture">{t('newsList.categories.culture')}</Option>
                                    </Select>
                                </AppForm.Item>
                                <AppForm.Item name="date" label={t('newsList.form.publishDate')} rules={[{ required: true, message: t('newsList.form.validation.dateRequired') }]}>
                                    <DatePicker style={{ width: '100%' }} />
                                </AppForm.Item>
                            </div>

                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider pt-2">{t('newsList.modal.sections.content')}</h3>
                            <AppForm.Item name="summary" label={t('newsList.form.summary')} rules={[{ required: true, message: t('newsList.form.validation.summaryRequired') }]}>
                                <TextArea
                                    rows={6}
                                    placeholder={t('newsList.form.placeholders.summary')}
                                    maxLength={200}
                                    showCount
                                />
                            </AppForm.Item>
                        </div>
                    </div>
                </AppForm>
            </AppModal>
        </div>
    );
};

export default NewsList;
