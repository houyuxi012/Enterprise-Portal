import React, { useState, useEffect } from 'react';
import { App, Card, Col, DatePicker, Image, Input, Popconfirm, Row, Select, Space, Switch, Tag, Typography, Upload } from 'antd';
import type { GetProp, UploadFile, UploadProps } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { NewsItem } from '@/types';
import ApiClient from '@/services/api';
import dayjs, { type Dayjs } from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import {
    AppButton,
    AppTable,
    AppModal,
    AppForm,
    AppPageHeader,
    AppFilterBar,
} from '@/modules/admin/components/ui';

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
const { Text, Title } = Typography;

const CATEGORY_CODES = ['announcement', 'activity', 'policy', 'culture'] as const;

type NewsFormValues = {
    title: string;
    summary: string;
    category: string;
    date: Dayjs;
    author: string;
    image: string;
    is_top?: boolean;
};

type ApiErrorShape = {
    message?: string;
    response?: {
        data?: {
            detail?: unknown;
        };
    };
};

const resolveErrorMessage = (error: unknown, fallback: string): string => {
    const normalized = (error as ApiErrorShape) || {};
    const detail = normalized.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (detail && typeof detail === 'object') {
        return JSON.stringify(detail);
    }
    if (normalized.message && normalized.message.trim()) return normalized.message;
    return fallback;
};

const NewsList: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { message } = App.useApp();
    const [news, setNews] = useState<NewsItem[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingNews, setEditingNews] = useState<NewsItem | null>(null);
    const [textSearch, setTextSearch] = useState('');
    const [form] = AppForm.useForm<NewsFormValues>();
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

    const handleDelete = async (id: number | string) => {
        try {
            await ApiClient.deleteNews(Number(id));
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

    const handleSubmit = async (values: NewsFormValues) => {
        try {
            setSubmitLoading(true);
            const payload = {
                ...values,
                date: values.date.format('YYYY-MM-DD')
            };

            if (editingNews) {
                await ApiClient.updateNews(Number(editingNews.id), payload as Partial<NewsItem>);
                message.success(t('newsList.messages.updateSuccess'));
            } else {
                await ApiClient.createNews(payload as Partial<NewsItem>);
                message.success(t('newsList.messages.createSuccess'));
            }
            setIsModalOpen(false);
            fetchNews();
        } catch (error: unknown) {
            const errorMsg = resolveErrorMessage(error, t('newsList.messages.unknownError'));
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
                <Image src={image} alt={t('newsList.table.coverAlt')} width={48} height={32} preview={false} style={{ borderRadius: 8, objectFit: 'cover' }} />
            ),
        },
        {
            title: t('newsList.table.title'),
            dataIndex: 'title',
            key: 'title',
            render: (text: string, record: NewsItem) => (
                <Space size={8}>
                    {record.is_top && (
                        <Tag color="red">
                            {t('newsList.table.topBadge')}
                        </Tag>
                    )}
                    <Text strong>{text}</Text>
                </Space>
            ),
        },
        {
            title: t('newsList.table.category'),
            dataIndex: 'category',
            key: 'category',
            width: 100,
            render: (category: string) => (
                <Tag color="blue">
                    {t(`newsList.categories.${normalizeCategory(category)}`, { defaultValue: category })}
                </Tag>
            ),
        },
        {
            title: t('newsList.table.publishDate'),
            dataIndex: 'date',
            key: 'date',
            width: 120,
            render: (date: string) => (
                <Text type="secondary">{date}</Text>
            ),
        },
        {
            title: t('newsList.table.actions'),
            key: 'action',
            width: 160,
            render: (_: unknown, record: NewsItem) => (
                <Space size={8}>
                    <AppButton
                        intent="tertiary"
                        size="sm"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                    >
                        {t('common.buttons.edit')}
                    </AppButton>
                    <Popconfirm title={t('newsList.confirm.deleteTitle')} onConfirm={() => handleDelete(record.id)}>
                        <AppButton intent="danger" size="sm" icon={<DeleteOutlined />}>
                            {t('common.buttons.delete')}
                        </AppButton>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div className="admin-page admin-page-spaced">
            <AppPageHeader
                title={t('newsList.page.title')}
                subtitle={t('newsList.page.subtitle')}
                action={
                    <AppButton intent="primary" icon={<PlusOutlined />} onClick={handleAddNew}>
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

            <Card className="admin-card overflow-hidden">
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
                    <AppForm.Item name="author" hidden>
                        <Input />
                    </AppForm.Item>

                    <Row gutter={16}>
                        <Col xs={24} md={8}>
                            <Card size="small" className="admin-card-subtle" title={<Title level={5} style={{ margin: 0 }}>{t('newsList.modal.sections.cover')}</Title>}>
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

                                <Card size="small" className="admin-card-subtle" styles={{ body: { padding: 12 } }}>
                                <AppForm.Item name="is_top" label={t('newsList.form.topPromotion')} valuePropName="checked" className="mb-0">
                                    <Switch checkedChildren={t('newsList.form.switch.on')} unCheckedChildren={t('newsList.form.switch.off')} />
                                </AppForm.Item>
                                    <Text type="secondary">{t('newsList.form.topPromotionHint')}</Text>
                                </Card>
                            </Card>
                        </Col>

                        <Col xs={24} md={16}>
                            <Card size="small" className="admin-card-subtle" title={<Title level={5} style={{ margin: 0 }}>{t('newsList.modal.sections.basic')}</Title>}>
                            <AppForm.Item name="title" label={t('newsList.form.title')} rules={[{ required: true, message: t('newsList.form.validation.titleRequired') }]}>
                                <Input placeholder={t('newsList.form.placeholders.title')} />
                            </AppForm.Item>

                                <Row gutter={16}>
                                    <Col xs={24} md={12}>
                                <AppForm.Item name="category" label={t('newsList.form.category')} rules={[{ required: true, message: t('newsList.form.validation.categoryRequired') }]}>
                                    <Select placeholder={t('newsList.form.placeholders.category')}>
                                        <Option value="announcement">{t('newsList.categories.announcement')}</Option>
                                        <Option value="activity">{t('newsList.categories.activity')}</Option>
                                        <Option value="policy">{t('newsList.categories.policy')}</Option>
                                        <Option value="culture">{t('newsList.categories.culture')}</Option>
                                    </Select>
                                </AppForm.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                <AppForm.Item name="date" label={t('newsList.form.publishDate')} rules={[{ required: true, message: t('newsList.form.validation.dateRequired') }]}>
                                    <DatePicker style={{ width: '100%' }} />
                                </AppForm.Item>
                                    </Col>
                                </Row>

                                <Card size="small" className="admin-card-subtle" title={<Title level={5} style={{ margin: 0 }}>{t('newsList.modal.sections.content')}</Title>}>
                            <AppForm.Item name="summary" label={t('newsList.form.summary')} rules={[{ required: true, message: t('newsList.form.validation.summaryRequired') }]} className="mb-0">
                                <TextArea
                                    rows={6}
                                    placeholder={t('newsList.form.placeholders.summary')}
                                    maxLength={200}
                                    showCount
                                />
                            </AppForm.Item>
                                </Card>
                            </Card>
                        </Col>
                    </Row>
                </AppForm>
            </AppModal>
        </div>
    );
};

export default NewsList;
