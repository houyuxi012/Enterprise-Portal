import React, { useState, useEffect } from 'react';
import { Input, Select, Popconfirm, message, Card, Upload, Image, List, InputNumber } from 'antd';
import type { GetProp, UploadFile, UploadProps } from 'antd';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { PlusOutlined } from '@ant-design/icons';
import { QuickToolDTO } from '../../services/api';
import ApiClient from '../../services/api';
import { getIcon } from '../../utils/iconMap';
import { getColorClass } from '../../utils/colorMap';
import {
    AppButton,
    AppModal,
    AppForm,
    AppPageHeader,
} from '../../components/admin';

const { Option } = Select;

type FileType = Parameters<GetProp<UploadProps, 'beforeUpload'>>[0];

const getBase64 = (file: FileType): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
    });

// Helper to render icon preview
const IconPreview = ({ iconName, color, image }: { iconName: string, color: string, image?: string }) => {
    if (image) {
        return (
            <div className="w-12 h-12 rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-700 shadow-sm flex items-center justify-center bg-white dark:bg-slate-800">
                <img src={image} alt="icon" className="w-full h-full object-cover" />
            </div>
        );
    }

    const colorClass = getColorClass(color);

    return (
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg shadow-${color}-500/20 ${colorClass} text-white`}>
            {getIcon(iconName, { size: 24 })}
        </div>
    );
};

const ToolList: React.FC = () => {
    const [tools, setTools] = useState<QuickToolDTO[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTool, setEditingTool] = useState<QuickToolDTO | null>(null);
    const [loading, setLoading] = useState(false);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [form] = AppForm.useForm();

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
            message.error('加载应用失败');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await ApiClient.deleteTool(id);
            message.success('应用已删除');
            fetchTools();
        } catch (error) {
            message.error('删除失败');
        }
    };

    const handleEdit = (tool: QuickToolDTO) => {
        setEditingTool(tool);
        form.setFieldsValue(tool);
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
            if (editingTool) {
                await ApiClient.updateTool(editingTool.id, values);
                message.success('应用已更新');
            } else {
                await ApiClient.createTool(values);
                message.success('应用已创建');
            }
            setIsModalOpen(false);
            fetchTools();
        } catch (error) {
            message.error('操作失败，请检查网络或联系管理员');
        } finally {
            setSubmitLoading(false);
        }
    };

    return (
        <div className="admin-page p-6 bg-slate-50/50 dark:bg-slate-900/50 min-h-full -m-6">
            <AppPageHeader
                title="应用中心管理"
                subtitle="管理首页快捷方式与工具卡片"
                action={
                    <AppButton intent="primary" icon={<Plus size={16} />} onClick={handleAddNew}>
                        新增应用
                    </AppButton>
                }
            />

            <List
                grid={{ gutter: 24, xs: 1, sm: 2, md: 3, lg: 4, xl: 4, xxl: 6 }}
                dataSource={tools}
                loading={loading}
                className="pb-10"
                renderItem={item => (
                    <List.Item>
                        <Card
                            hoverable
                            className="rounded-xl overflow-hidden border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-lg transition-all duration-300 bg-white dark:bg-slate-800 group"
                            actions={[
                                <AppButton key="edit" intent="tertiary" iconOnly size="sm" icon={<Edit size={14} />} onClick={() => handleEdit(item)} />,
                                <Popconfirm key="delete" title="确定删除?" onConfirm={() => handleDelete(item.id)}>
                                    <AppButton intent="danger" iconOnly size="sm" icon={<Trash2 size={14} />} />
                                </Popconfirm>,
                            ]}
                        >
                            <div className="flex flex-col items-center text-center pt-2 pb-2">
                                <div className="mb-4 transform group-hover:scale-110 transition-transform duration-300">
                                    <IconPreview iconName={item.icon_name} color={item.color} image={item.image} />
                                </div>
                                <h3 className="font-black text-slate-800 dark:text-slate-100 text-lg mb-1">{item.name}</h3>
                                <span className="text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-700 dark:text-slate-400 px-2 py-0.5 rounded-lg">{item.category}</span>
                                <p className="text-xs text-slate-400 mt-3 truncate w-full px-2">{item.url}</p>
                            </div>
                        </Card>
                    </List.Item>
                )}
            />

            <AppModal
                title={editingTool ? '编辑应用' : '新增应用'}
                open={isModalOpen}
                onOk={() => form.submit()}
                onCancel={() => setIsModalOpen(false)}
                confirmLoading={submitLoading}
            >
                <AppForm form={form} onFinish={handleSubmit}>
                    {/* Image Upload Area */}
                    <AppForm.Item label="应用图标 (优先显示自定义图片)">
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
                                    message.success('图片上传成功');
                                    onSuccess?.(url);
                                } catch (err) {
                                    message.error('图片上传失败');
                                    onError?.(err as Error);
                                }
                            }}
                        >
                            {fileList.length >= 1 ? null : (
                                <button style={{ border: 0, background: 'none' }} type="button">
                                    <PlusOutlined />
                                    <div style={{ marginTop: 8 }}>上传图标</div>
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

                    <AppForm.Item name="name" label="应用名称" rules={[{ required: true, message: '请输入应用名称' }]}>
                        <Input placeholder="请输入应用名称" />
                    </AppForm.Item>
                    <AppForm.Item name="url" label="链接 URL" rules={[{ required: true, message: '请输入链接' }]}>
                        <Input placeholder="应用跳转链接" />
                    </AppForm.Item>
                    <div className="grid grid-cols-2 gap-4">
                        <AppForm.Item name="category" label="分类">
                            <Select placeholder="选择分类">
                                <Option value="办公">办公</Option>
                                <Option value="开发">开发</Option>
                                <Option value="设计">设计</Option>
                                <Option value="其它">其它</Option>
                            </Select>
                        </AppForm.Item>
                        <AppForm.Item name="color" label="颜色主题 (无图片时生效)">
                            <Select placeholder="选择颜色">
                                <Option value="blue">蓝色</Option>
                                <Option value="purple">紫色</Option>
                                <Option value="emerald">翠绿</Option>
                                <Option value="rose">玫红</Option>
                                <Option value="orange">橙色</Option>
                            </Select>
                        </AppForm.Item>
                    </div>
                    <AppForm.Item name="sort_order" label="显示优先级 (数值越大越靠前)">
                        <InputNumber style={{ width: '100%' }} min={0} placeholder="0" />
                    </AppForm.Item>
                    <AppForm.Item name="icon_name" label="图标名称 (Lucide Icon, 无图片时生效)">
                        <Input placeholder="e.g. Mail, Github, Slack" />
                    </AppForm.Item>
                    <AppForm.Item name="description" label="描述">
                        <Input.TextArea rows={3} placeholder="应用描述（可选）" />
                    </AppForm.Item>
                </AppForm>
            </AppModal>
        </div>
    );
};

export default ToolList;
