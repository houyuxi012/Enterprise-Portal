import React, { useState, useEffect } from 'react';
import { List, Button, Modal, Form, Input, Select, Popconfirm, message, Card, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, AppstoreOutlined } from '@ant-design/icons';
import { QuickToolDTO } from '../../services/api';
import ApiClient from '../../services/api';
import * as LucideIcons from 'lucide-react';

const { Option } = Select;

// Helper to render icon preview
const IconPreview = ({ iconName, color }: { iconName: string, color: string }) => {
    // @ts-ignore
    const Icon = LucideIcons[iconName] || LucideIcons.AppWindow;
    const colorMap: any = {
        'blue': 'text-blue-600 bg-blue-50',
        'purple': 'text-purple-600 bg-purple-50',
        'emerald': 'text-emerald-600 bg-emerald-50',
        'rose': 'text-rose-600 bg-rose-50',
        'orange': 'text-orange-600 bg-orange-50',
        'indigo': 'text-indigo-600 bg-indigo-50',
    };
    const colorClass = colorMap[color] || colorMap['blue'];

    return (
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorClass}`}>
            <Icon size={20} />
        </div>
    );
};

const ToolList: React.FC = () => {
    const [tools, setTools] = useState<QuickToolDTO[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTool, setEditingTool] = useState<QuickToolDTO | null>(null);
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm();

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
        setIsModalOpen(true);
    };

    const handleAddNew = () => {
        setEditingTool(null);
        form.resetFields();
        form.setFieldsValue({
            color: 'blue',
            icon_name: 'Link'
        });
        setIsModalOpen(true);
    };

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
                <h2 className="text-2xl font-bold">应用工具管理</h2>
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
                                avatar={<IconPreview iconName={item.icon_name} color={item.color} />}
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
                        <Form.Item name="color" label="颜色主题">
                            <Select>
                                <Option value="blue">Blue</Option>
                                <Option value="purple">Purple</Option>
                                <Option value="emerald">Emerald</Option>
                                <Option value="rose">Rose</Option>
                                <Option value="orange">Orange</Option>
                            </Select>
                        </Form.Item>
                    </div>
                    <Form.Item name="icon_name" label="图标 (Lucide Icon Name)">
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
