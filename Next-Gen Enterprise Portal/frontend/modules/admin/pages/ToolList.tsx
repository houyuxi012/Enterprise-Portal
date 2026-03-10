import React, { useState, useEffect } from 'react';
import { App, Card, Image, Input, InputNumber, List, Popconfirm, Select, Space, Tag, Typography, Upload } from 'antd';
import type { GetProp, UploadFile, UploadProps } from 'antd';
import { AppstoreOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { QuickToolDTO, QuickToolUpsertPayload } from '@/services/api';
import ApiClient from '@/services/api';
import {
    AppButton,
    AppModal,
    AppForm,
    AppPageHeader,
} from '@/modules/admin/components/ui';

const { Option } = Select;

type FileType = Parameters<GetProp<UploadProps, 'beforeUpload'>>[0];

const getBase64 = (file: FileType): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
    });

const CATEGORY_CODES = [
    'administration',
    'it',
    'finance',
    'hr',
    'engineering',
    'design',
    'marketing',
    'legal',
    'general',
    'other',
] as const;

const { Text, Title } = Typography;

const IconPreview = ({ image }: { image?: string }) => {
    return (
        <Card size="small" className="admin-card-subtle" styles={{ body: { width: 48, height: 48, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' } }}>
            {image ? (
                <img src={image} alt="icon" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
                <AppstoreOutlined />
            )}
        </Card>
    );
};

const ToolList: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { message } = App.useApp();
    const [tools, setTools] = useState<QuickToolDTO[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTool, setEditingTool] = useState<QuickToolDTO | null>(null);
    const [loading, setLoading] = useState(false);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [form] = AppForm.useForm();
    const categoryAliases = React.useMemo(() => {
        const aliases: Record<string, string> = {};
        CATEGORY_CODES.forEach((code) => {
            aliases[code] = code;
            aliases[code.toUpperCase()] = code;
            const zhLabel = String(i18n.t(`toolList.categories.${code}`, { lng: 'zh-CN' })).trim();
            const enLabel = String(i18n.t(`toolList.categories.${code}`, { lng: 'en-US' })).trim();
            if (zhLabel) aliases[zhLabel] = code;
            if (enLabel) aliases[enLabel] = code;
        });
        return aliases;
    }, [i18n.resolvedLanguage]);

    const normalizeCategory = (value?: string): string => {
        const raw = String(value || '').trim();
        return categoryAliases[raw] || raw || 'general';
    };

    // Upload state
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewImage, setPreviewImage] = useState('');
    const [fileList, setFileList] = useState<UploadFile[]>([]);

    useEffect(() => {
        fetchTools();
    }, []);

    const fetchTools = async () => {
        setLoading(true);
        try {
            const data = await ApiClient.getTools();
            setTools(data);
        } catch (error) {
            message.error(t('toolList.messages.loadFailed'));
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await ApiClient.deleteTool(id);
            message.success(t('toolList.messages.deleteSuccess'));
            fetchTools();
        } catch (error) {
            message.error(t('toolList.messages.deleteFailed'));
        }
    };

    const handleEdit = (tool: QuickToolDTO) => {
        setEditingTool(tool);
        form.setFieldsValue({
            ...tool,
            category: normalizeCategory(tool.category),
        });
        // Init fileList for existing image
        if (tool.image) {
            setFileList([
                {
                    uid: '-1',
                    name: 'image.png',
                    status: 'done',
                    url: tool.image,
                }
            ]);
        } else {
            setFileList([]);
        }
        setIsModalOpen(true);
    };

    const handleAddNew = () => {
        setEditingTool(null);
        form.resetFields();
        form.setFieldsValue({
            category: 'general',
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

    const handleSubmit = async (values: QuickToolUpsertPayload) => {
        const payload: QuickToolUpsertPayload = {
            ...values,
            image: values.image ?? editingTool?.image,
        };
        try {
            setSubmitLoading(true);
            if (editingTool) {
                await ApiClient.updateTool(editingTool.id, payload);
                message.success(t('toolList.messages.updateSuccess'));
            } else {
                await ApiClient.createTool(payload);
                message.success(t('toolList.messages.createSuccess'));
            }
            setIsModalOpen(false);
            fetchTools();
        } catch (error) {
            message.error(t('toolList.messages.actionFailed'));
        } finally {
            setSubmitLoading(false);
        }
    };

    return (
        <div className="admin-page admin-page-spaced">
            <AppPageHeader
                title={t('toolList.page.title')}
                subtitle={t('toolList.page.subtitle')}
                action={
                    <AppButton intent="primary" icon={<PlusOutlined />} onClick={handleAddNew}>
                        {t('toolList.page.createButton')}
                    </AppButton>
                }
            />

            <List
                grid={{ gutter: 28, xs: 1, sm: 2, md: 2, lg: 3, xl: 4, xxl: 4 }}
                dataSource={tools}
                loading={loading}
                className="pb-10"
                renderItem={(item) => (
                    <List.Item>
                        <Card
                            hoverable
                            className="admin-card admin-card-subtle h-full"
                            styles={{ body: { padding: 24 } }}
                            actions={[
                                <AppButton key="edit" intent="tertiary" iconOnly size="sm" icon={<EditOutlined />} onClick={() => handleEdit(item)} />,
                                <Popconfirm key="delete" title={t('toolList.popconfirm.deleteTitle')} onConfirm={() => handleDelete(item.id)}>
                                    <AppButton intent="danger" iconOnly size="sm" icon={<DeleteOutlined />} />
                                </Popconfirm>,
                            ]}
                        >
                            <Space direction="vertical" align="center" size={12} style={{ width: '100%' }}>
                                <div>
                                    <IconPreview image={item.image} />
                                </div>
                                <Title level={5} style={{ margin: 0, textAlign: 'center' }}>{item.name}</Title>
                                <Tag color="blue">
                                    {t(`toolList.categories.${normalizeCategory(item.category)}`, { defaultValue: item.category })}
                                </Tag>
                                <Text type="secondary" ellipsis={{ tooltip: item.url }} style={{ maxWidth: '100%', textAlign: 'center' }}>
                                    {item.url}
                                </Text>
                            </Space>
                        </Card>
                    </List.Item>
                )}
            />

            <AppModal
                title={editingTool ? t('toolList.modal.editTitle') : t('toolList.modal.createTitle')}
                open={isModalOpen}
                onOk={() => form.submit()}
                onCancel={() => setIsModalOpen(false)}
                confirmLoading={submitLoading}
            >
                <AppForm form={form} onFinish={handleSubmit}>
                    <AppForm.Item
                        label={t('toolList.form.icon')}
                        help={t('toolList.form.iconHint')}
                    >
                        <AppForm.Item name="image" noStyle>
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
                                    message.success(t('toolList.messages.uploadSuccess'));
                                    onSuccess?.(url);
                                } catch (err) {
                                    message.error(t('toolList.messages.uploadFailed'));
                                    onError?.(err as Error);
                                }
                            }}
                        >
                            {fileList.length >= 1 ? null : (
                                <button style={{ border: 0, background: 'none' }} type="button">
                                    <PlusOutlined />
                                    <div style={{ marginTop: 8 }}>{t('toolList.form.uploadIcon')}</div>
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
                    </AppForm.Item>

                    <Card size="small" className="admin-card-subtle">
                        <Space direction="vertical" size={16} style={{ width: '100%' }}>
                            <AppForm.Item name="name" label={t('toolList.form.name')} rules={[{ required: true, message: t('toolList.form.validation.nameRequired') }]}>
                                <Input placeholder={t('toolList.form.placeholders.name')} />
                            </AppForm.Item>
                            <AppForm.Item name="url" label={t('toolList.form.url')} rules={[{ required: true, message: t('toolList.form.validation.urlRequired') }]}>
                                <Input placeholder={t('toolList.form.placeholders.url')} />
                            </AppForm.Item>
                            <Space size={16} style={{ width: '100%' }} align="start">
                                <div style={{ flex: 1 }}>
                                    <AppForm.Item name="category" label={t('toolList.form.category')}>
                                        <Select placeholder={t('toolList.form.placeholders.category')}>
                                            <Option value="administration">{t('toolList.categories.administration')}</Option>
                                            <Option value="it">{t('toolList.categories.it')}</Option>
                                            <Option value="finance">{t('toolList.categories.finance')}</Option>
                                            <Option value="hr">{t('toolList.categories.hr')}</Option>
                                            <Option value="engineering">{t('toolList.categories.engineering')}</Option>
                                            <Option value="design">{t('toolList.categories.design')}</Option>
                                            <Option value="marketing">{t('toolList.categories.marketing')}</Option>
                                            <Option value="legal">{t('toolList.categories.legal')}</Option>
                                            <Option value="general">{t('toolList.categories.general')}</Option>
                                            <Option value="other">{t('toolList.categories.other')}</Option>
                                        </Select>
                                    </AppForm.Item>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <AppForm.Item name="sort_order" label={t('toolList.form.sortOrder')}>
                                        <InputNumber style={{ width: '100%' }} min={0} placeholder={t('toolList.form.placeholders.sortOrder')} />
                                    </AppForm.Item>
                                </div>
                            </Space>
                            <AppForm.Item name="description" label={t('toolList.form.description')}>
                                <Input.TextArea rows={3} placeholder={t('toolList.form.placeholders.description')} />
                            </AppForm.Item>
                        </Space>
                    </Card>
                </AppForm>
            </AppModal>
        </div>
    );
};

export default ToolList;
