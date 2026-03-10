import React, { useEffect, useState } from 'react';
import {
    App,
    Card,
    Col,
    Image,
    Input,
    InputNumber,
    Popconfirm,
    Row,
    Space,
    Switch,
    Typography,
    Upload,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient from '@/services/api';
import { CarouselItem } from '@/types';
import type { ColumnsType } from 'antd/es/table';
import {
    AppButton,
    AppTable,
    AppModal,
    AppForm,
    AppTag,
    AppPageHeader,
} from '@/modules/admin/components/ui';

const { Link, Text } = Typography;

const CarouselList: React.FC = () => {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [items, setItems] = useState<CarouselItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<CarouselItem | null>(null);
    const [form] = AppForm.useForm();
    const [imageUrl, setImageUrl] = useState<string>('');
    const [submitLoading, setSubmitLoading] = useState(false);

    const fetchItems = async () => {
        setLoading(true);
        try {
            const data = await ApiClient.getAdminCarouselItems();
            setItems(data);
        } catch (error) {
            message.error(t('carouselList.messages.loadFailed'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchItems();
    }, []);

    const handleAdd = () => {
        setEditingItem(null);
        setImageUrl('');
        form.resetFields();
        setIsModalOpen(true);
    };

    const handleEdit = (record: CarouselItem) => {
        setEditingItem(record);
        setImageUrl(record.image);
        form.setFieldsValue(record);
        setIsModalOpen(true);
    };

    const handleDelete = async (id: number) => {
        try {
            await ApiClient.deleteCarouselItem(id);
            message.success(t('carouselList.messages.deleteSuccess'));
            fetchItems();
        } catch (error) {
            message.error(t('carouselList.messages.deleteFailed'));
        }
    };

    const handleSubmit = async (values: any) => {
        try {
            setSubmitLoading(true);
            values.image = imageUrl;

            if (editingItem) {
                await ApiClient.updateCarouselItem(editingItem.id, values);
                message.success(t('carouselList.messages.updateSuccess'));
            } else {
                await ApiClient.createCarouselItem(values);
                message.success(t('carouselList.messages.createSuccess'));
            }
            setIsModalOpen(false);
            fetchItems();
        } catch (error: any) {
            const errorMsg = error?.response?.data?.detail || error?.message || t('carouselList.messages.unknownError');
            message.error(t('carouselList.messages.actionFailed', { reason: typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg }));
        } finally {
            setSubmitLoading(false);
        }
    };

    const handleUpload = async (options: any) => {
        const { file, onSuccess, onError } = options;
        try {
            const url = await ApiClient.uploadImage(file);
            setImageUrl(url);
            onSuccess(url);
            message.success(t('carouselList.messages.uploadSuccess'));
        } catch (err) {
            onError(err);
            message.error(t('carouselList.messages.uploadFailed'));
        }
    };

    const columns: ColumnsType<CarouselItem> = [
        {
            title: t('carouselList.table.preview'),
            dataIndex: 'image',
            key: 'image',
            width: 150,
            render: (text: string) => (
                <Image
                    src={text}
                    alt={t('carouselList.table.previewAlt')}
                    width={128}
                    height={80}
                    style={{ borderRadius: 12, objectFit: 'cover' }}
                    preview
                />
            ),
        },
        {
            title: t('carouselList.table.title'),
            dataIndex: 'title',
            key: 'title',
            render: (text: string) => <Text strong>{text}</Text>,
        },
        {
            title: t('carouselList.table.badge'),
            dataIndex: 'badge',
            key: 'badge',
            width: 100,
            render: (text: string) => <AppTag status="info">{text}</AppTag>
        },
        {
            title: t('carouselList.table.url'),
            dataIndex: 'url',
            key: 'url',
            render: (text: string) => (
                <Link href={text} target="_blank" rel="noreferrer" ellipsis>
                    {text}
                </Link>
            ),
        },
        {
            title: t('carouselList.table.sortOrder'),
            dataIndex: 'sort_order',
            key: 'sort_order',
            width: 80,
            render: (text: number) => <Text code>{text}</Text>,
        },
        {
            title: t('carouselList.table.status'),
            dataIndex: 'is_active',
            key: 'is_active',
            width: 100,
            render: (active: boolean) => (
                <AppTag status={active ? 'success' : 'default'}>
                    {active ? t('carouselList.status.visible') : t('carouselList.status.hidden')}
                </AppTag>
            )
        },
        {
            title: t('carouselList.table.actions'),
            key: 'action',
            width: 120,
            render: (_: any, record: CarouselItem) => (
                <Space size="small">
                    <AppButton intent="tertiary" iconOnly size="sm" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                    <Popconfirm title={t('carouselList.confirm.deleteTitle')} onConfirm={() => handleDelete(record.id)}>
                        <AppButton intent="danger" iconOnly size="sm" icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div className="admin-page admin-page-spaced">
            <AppPageHeader
                title={t('carouselList.page.title')}
                subtitle={t('carouselList.page.subtitle')}
                action={
                    <AppButton intent="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                        {t('carouselList.page.createButton')}
                    </AppButton>
                }
            />

            <Card className="admin-card overflow-hidden">
                <AppTable
                    columns={columns}
                    dataSource={items}
                    rowKey="id"
                    loading={loading}
                    emptyText={t('carouselList.table.empty')}
                />
            </Card>

            <AppModal
                title={editingItem ? t('carouselList.modal.editTitle') : t('carouselList.modal.createTitle')}
                open={isModalOpen}
                onOk={() => form.submit()}
                onCancel={() => setIsModalOpen(false)}
                confirmLoading={submitLoading}
            >
                <AppForm form={form} onFinish={handleSubmit}>
                    <AppForm.Item label={t('carouselList.form.title')} name="title" rules={[{ required: true, message: t('carouselList.form.validation.titleRequired') }]}>
                        <Input placeholder={t('carouselList.form.placeholders.title')} />
                    </AppForm.Item>
                    <Card size="small" className="admin-card-subtle">
                        <AppForm.Item label={t('carouselList.form.image')}>
                            <Upload
                                customRequest={handleUpload}
                                showUploadList={false}
                                listType="picture-card"
                            >
                                {imageUrl ? (
                                    <Image src={imageUrl} alt={t('carouselList.table.previewAlt')} width={120} preview={false} />
                                ) : (
                                    <div>
                                        <PlusOutlined />
                                        <div style={{ marginTop: 8 }}>{t('carouselList.form.upload')}</div>
                                    </div>
                                )}
                            </Upload>
                        </AppForm.Item>
                        <Row gutter={16}>
                            <Col xs={24} md={12}>
                                <AppForm.Item label={t('carouselList.form.badge')} name="badge" rules={[{ required: true, message: t('carouselList.form.validation.badgeRequired') }]}>
                                    <Input placeholder={t('carouselList.form.placeholders.badge')} />
                                </AppForm.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <AppForm.Item label={t('carouselList.form.url')} name="url" rules={[{ required: true, message: t('carouselList.form.validation.urlRequired') }]}>
                                    <Input placeholder={t('carouselList.form.placeholders.url')} />
                                </AppForm.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <AppForm.Item label={t('carouselList.form.sortOrder')} name="sort_order" initialValue={0}>
                                    <InputNumber style={{ width: '100%' }} min={0} />
                                </AppForm.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <AppForm.Item label={t('carouselList.form.visible')} name="is_active" valuePropName="checked" initialValue={true}>
                                    <Switch checkedChildren={t('carouselList.status.show')} unCheckedChildren={t('carouselList.status.hide')} />
                                </AppForm.Item>
                            </Col>
                        </Row>
                    </Card>
                </AppForm>
            </AppModal>
        </div>
    );
};

export default CarouselList;
