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
            <div className="w-10 h-10 rounded-xl overflow-hidden border border-slate-100 flex items-center justify-center bg-white">
                <img src={image} alt="icon" className="w-full h-full object-cover" />
            </div>
        );
    }

    const colorClass = getColorClass(color);

    return (
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorClass}`}>
            {getIcon(iconName, { size: 20 })}
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
        <div className="site-card-wrapper">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">应用管理</h2>
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAddNew} size="large">新增应用</Button>
            </div>

            <List
                grid={{ gutter: 16, xs: 1, sm: 2, md: 3, lg: 4, xl: 4, xxl: 6 }}
                dataSource={tools}
                loading={loading}
                renderItem={item => (
                    <List.Item>
                        <Card
                            actions={[
                                <EditOutlined key="edit" onClick={() => handleEdit(item)} />,
                                <Popconfirm title="确定删除?" onConfirm={() => handleDelete(item.id)}>
                                    <DeleteOutlined key="delete" style={{ color: 'red' }} />
                                </Popconfirm>,
                            ]}
                        >
                            <Card.Meta
                                avatar={<IconPreview iconName={item.icon_name} color={item.color} image={item.image} />}
                                title={item.name}
                                description={
                                    <div className="text-xs text-gray-400 truncate">
                                        <Tag>{item.category}</Tag>
                                        <div className="mt-1">{item.url}</div>
                                    </div>
                                }
                            />
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
