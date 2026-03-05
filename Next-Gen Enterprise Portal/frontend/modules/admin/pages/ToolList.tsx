import React, { useState, useEffect } from 'react';
import { Input, Select, Popconfirm, message, Card, Upload, Image, List, InputNumber } from 'antd';
import type { GetProp, UploadFile, UploadProps } from 'antd';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { QuickToolDTO, QuickToolUpsertPayload } from '@/services/api';
import ApiClient from '@/services/api';
import { getIcon } from '@/shared/utils/iconMap';
import { getColorClass } from '@/shared/utils/colorMap';
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

const resolveIconTextColorClass = (colorName: string): string => {
    const colorClass = getColorClass(colorName || 'blue');
    const textColorClass = colorClass
        .split(/\s+/)
        .find((token) => token.startsWith('text-'));
    return textColorClass || 'text-blue-600';
};

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

// Helper to render icon preview
const IconPreview = ({ iconName, color, image }: { iconName: string, color: string, image?: string }) => {
    if (image) {
        return (
            <div className="w-10 h-10 rounded-xl overflow-hidden border border-slate-100 dark:border-slate-700 shadow-sm flex items-center justify-center bg-white dark:bg-slate-800">
                <img src={image} alt="icon" className="w-full h-full object-cover" />
            </div>
        );
    }

    const iconTextColorClass = resolveIconTextColorClass(color);

    return (
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border border-slate-100 dark:border-slate-700 shadow-sm bg-white dark:bg-slate-800 ${iconTextColorClass}`}>
            {getIcon(iconName, { size: 18 })}
        </div>
    );
};

const ToolList: React.FC = () => {
    const { t, i18n } = useTranslation();
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
            color: 'blue',
            icon_name: 'Link',
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
        try {
            setSubmitLoading(true);
            if (editingTool) {
                await ApiClient.updateTool(editingTool.id, values);
                message.success(t('toolList.messages.updateSuccess'));
            } else {
                await ApiClient.createTool(values);
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
        <div className="admin-page p-6 bg-slate-50/50 dark:bg-slate-900/50 min-h-full -m-6">
            <AppPageHeader
                title={t('toolList.page.title')}
                subtitle={t('toolList.page.subtitle')}
                action={
                    <AppButton intent="primary" icon={<Plus size={16} />} onClick={handleAddNew}>
                        {t('toolList.page.createButton')}
                    </AppButton>
                }
            />

            <List
                grid={{ gutter: 28, xs: 1, sm: 2, md: 2, lg: 3, xl: 4, xxl: 4 }}
                dataSource={tools}
                loading={loading}
                className="pb-10"
                renderItem={item => (
                    <List.Item>
                        <Card
                            hoverable
                            className="rounded-xl overflow-hidden border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-lg transition-all duration-300 bg-white dark:bg-slate-800 group"
                            bodyStyle={{ padding: 24 }}
                            actions={[
                                <AppButton key="edit" intent="tertiary" iconOnly size="sm" icon={<Edit size={14} />} onClick={() => handleEdit(item)} />,
                                <Popconfirm key="delete" title={t('toolList.popconfirm.deleteTitle')} onConfirm={() => handleDelete(item.id)}>
                                    <AppButton intent="danger" iconOnly size="sm" icon={<Trash2 size={14} />} />
                                </Popconfirm>,
                            ]}
                        >
                            <div className="flex flex-col items-center text-center pt-2 pb-2">
                                <div className="mb-4 transform group-hover:scale-110 transition-transform duration-300">
                                    <IconPreview iconName={item.icon_name} color={item.color} image={item.image} />
                                </div>
                                <h3 className="font-black text-slate-800 dark:text-slate-100 text-lg mb-1">{item.name}</h3>
                                <span className="text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-700 dark:text-slate-400 px-2 py-0.5 rounded-lg">
                                    {t(`toolList.categories.${normalizeCategory(item.category)}`, { defaultValue: item.category })}
                                </span>
                                <p className="text-xs text-slate-400 mt-3 truncate w-full px-2">{item.url}</p>
                            </div>
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
                    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-4 items-start">
                        <AppForm.Item label={t('toolList.form.icon')} className="mb-0">
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
                        <div>
                            <AppForm.Item name="color" label={t('toolList.form.color')}>
                                <Select placeholder={t('toolList.form.placeholders.color')}>
                                    <Option value="blue">{t('toolList.colors.blue')}</Option>
                                    <Option value="purple">{t('toolList.colors.purple')}</Option>
                                    <Option value="emerald">{t('toolList.colors.emerald')}</Option>
                                    <Option value="rose">{t('toolList.colors.rose')}</Option>
                                    <Option value="orange">{t('toolList.colors.orange')}</Option>
                                </Select>
                            </AppForm.Item>
                            <AppForm.Item name="icon_name" label={t('toolList.form.iconName')}>
                                <Input placeholder={t('toolList.form.placeholders.iconName')} />
                            </AppForm.Item>
                        </div>
                    </div>

                    <AppForm.Item name="name" label={t('toolList.form.name')} rules={[{ required: true, message: t('toolList.form.validation.nameRequired') }]}>
                        <Input placeholder={t('toolList.form.placeholders.name')} />
                    </AppForm.Item>
                    <AppForm.Item name="url" label={t('toolList.form.url')} rules={[{ required: true, message: t('toolList.form.validation.urlRequired') }]}>
                        <Input placeholder={t('toolList.form.placeholders.url')} />
                    </AppForm.Item>
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
                    <AppForm.Item name="sort_order" label={t('toolList.form.sortOrder')}>
                        <InputNumber style={{ width: '100%' }} min={0} placeholder={t('toolList.form.placeholders.sortOrder')} />
                    </AppForm.Item>
                    <AppForm.Item name="description" label={t('toolList.form.description')}>
                        <Input.TextArea rows={3} placeholder={t('toolList.form.placeholders.description')} />
                    </AppForm.Item>
                </AppForm>
            </AppModal>
        </div>
    );
};

export default ToolList;
