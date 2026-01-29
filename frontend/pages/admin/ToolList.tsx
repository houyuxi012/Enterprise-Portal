import React, { useState, useEffect } from 'react';
import { List, Button, Modal, Form, Input, Select, Popconfirm, message, Card, Tag, Upload, Image } from 'antd';
import type { GetProp, UploadFile, UploadProps } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, AppstoreOutlined } from '@ant-design/icons';
import { QuickToolDTO } from '../../services/api';
import ApiClient from '../../services/api';
import * as LucideIcons from 'lucide-react';
import { getIcon } from '../../utils/iconMap';
import { getColorClass } from '../../utils/colorMap';

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
    const [form] = Form.useForm();

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
            message.error('Failed to fetch tools');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await ApiClient.deleteTool(id);
            message.success('Tool deleted');
            fetchTools();
        } catch (error) {
            message.error('Failed to delete tool');
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

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            if (editingTool) {
                await ApiClient.updateTool(editingTool.id, values);
                message.success('Tool updated');
            } else {
                await ApiClient.createTool(values);
                message.success('Tool created');
            }
            setIsModalOpen(false);
            fetchTools();
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-700 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-6 min-h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">应用中心管理</h2>
                    <p className="text-xs text-slate-400 font-bold mt-1">管理首页快捷方式与工具卡片</p>
                </div>
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={handleAddNew}
                    size="large"
                    className="rounded-xl px-6 bg-slate-900 hover:bg-slate-800 shadow-lg shadow-slate-900/20 border-0 h-10 font-bold transition-all hover:scale-105 active:scale-95"
                >
                    新增应用
                </Button>
            </div>

            <List
                grid={{ gutter: 24, xs: 1, sm: 2, md: 3, lg: 4, xl: 4, xxl: 6 }}
                dataSource={tools}
                loading={loading}
                className="pb-10"
                renderItem={item => (
                    <List.Item>
                        <Card
                            hoverable
                            className="rounded-[1.5rem] overflow-hidden border-0 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.1)] transition-all duration-300 bg-white dark:bg-slate-800 group"
                            actions={[
                                <EditOutlined key="edit" onClick={() => handleEdit(item)} className="text-slate-400 hover:text-blue-500 transition-colors" />,
                                <Popconfirm title="确定删除?" onConfirm={() => handleDelete(item.id)}>
                                    <DeleteOutlined key="delete" className="text-slate-400 hover:text-rose-500 transition-colors" />
                                </Popconfirm>,
                            ]}
                        >
                            <div className="flex flex-col items-center text-center pt-2 pb-2">
                                <div className="mb-4 transform group-hover:scale-110 transition-transform duration-300">
                                    <IconPreview iconName={item.icon_name} color={item.color} image={item.image} />
                                </div>
                                <h3 className="font-black text-slate-800 dark:text-slate-100 text-lg mb-1">{item.name}</h3>
                                <div className="flex items-center space-x-2 justify-center w-full">
                                    <Tag className="rounded-lg mr-0 font-bold border-0 bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400">{item.category}</Tag>
                                </div>
                                <p className="text-xs text-slate-400 mt-3 truncate w-full px-2">{item.url}</p>
                            </div>
                        </Card>
                    </List.Item>
                )}
            />

            <Modal
                title={editingTool ? '编辑应用' : '新增应用'}
                open={isModalOpen}
                onOk={handleOk}
                onCancel={() => setIsModalOpen(false)}
            >
                <Form form={form} layout="vertical">
                    {/* Image Upload Area */}
                    <Form.Item label="应用图标 (优先显示自定义图片)">
                        <Form.Item name="image" noStyle>
                            <Input hidden />
                        </Form.Item>
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
                    </Form.Item>

                    <Form.Item name="name" label="应用名称" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="url" label="链接 URL" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <div className="grid grid-cols-2 gap-4">
                        <Form.Item name="category" label="分类">
                            <Select>
                                <Option value="办公">办公</Option>
                                <Option value="开发">开发</Option>
                                <Option value="设计">设计</Option>
                                <Option value="其它">其它</Option>
                            </Select>
                        </Form.Item>
                        <Form.Item name="color" label="颜色主题 (无图片时生效)">
                            <Select>
                                <Option value="blue">Blue</Option>
                                <Option value="purple">Purple</Option>
                                <Option value="emerald">Emerald</Option>
                                <Option value="rose">Rose</Option>
                                <Option value="orange">Orange</Option>
                            </Select>
                        </Form.Item>
                    </div>
                    <Form.Item name="icon_name" label="图标名称 (Lucide Icon, 无图片时生效)">
                        <Input placeholder="e.g. Mail, Github, Slack" />
                    </Form.Item>
                    <Form.Item name="description" label="描述">
                        <Input.TextArea />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default ToolList;
