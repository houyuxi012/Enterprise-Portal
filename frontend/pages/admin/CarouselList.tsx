import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Switch, Upload, message, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import ApiClient from '../../services/api';
import { CarouselItem } from '../../types';

const CarouselList: React.FC = () => {
    const [items, setItems] = useState<CarouselItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<CarouselItem | null>(null);
    const [form] = Form.useForm();
    const [imageUrl, setImageUrl] = useState<string>('');

    const fetchItems = async () => {
        setLoading(true);
        try {
            const data = await ApiClient.getAdminCarouselItems();
            setItems(data);
        } catch (error) {
            message.error('获取轮播图失败');
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
            message.success('删除成功');
            fetchItems();
        } catch (error) {
            message.error('删除失败');
        }
    };

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            values.image = imageUrl; // Ensure image is set

            if (editingItem) {
                await ApiClient.updateCarouselItem(editingItem.id, values);
                message.success('更新成功');
            } else {
                await ApiClient.createCarouselItem(values);
                message.success('创建成功');
            }
            setIsModalOpen(false);
            fetchItems();
        } catch (error) {
            message.error('操作失败');
        }
    };

    const handleUpload = async (options: any) => {
        const { file, onSuccess, onError } = options;
        try {
            const url = await ApiClient.uploadImage(file);
            setImageUrl(url);
            onSuccess(url);
            message.success('上传成功');
        } catch (err) {
            onError(err);
            message.error('上传失败');
        }
    };

    const columns = [
        {
            title: '预览',
            dataIndex: 'image',
            key: 'image',
            render: (text: string) => <img src={text} alt="preview" style={{ width: 100, borderRadius: 8 }} />
        },
        {
            title: '标题',
            dataIndex: 'title',
            key: 'title',
        },
        {
            title: '徽标',
            dataIndex: 'badge',
            key: 'badge',
            render: (text: string) => <Tag color="blue">{text}</Tag>
        },
        {
            title: '链接',
            dataIndex: 'url',
            key: 'url',
        },
        {
            title: '排序',
            dataIndex: 'sort_order',
            key: 'sort_order',
        },
        {
            title: '状态',
            dataIndex: 'is_active',
            key: 'is_active',
            render: (active: boolean) => <Tag color={active ? 'green' : 'red'}>{active ? '显示' : '隐藏'}</Tag>
        },
        {
            title: '操作',
            key: 'action',
            render: (_: any, record: CarouselItem) => (
                <div className="space-x-2">
                    <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                    <Button icon={<DeleteOutlined />} danger onClick={() => handleDelete(record.id)} />
                </div>
            ),
        },
    ];

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-bold">轮播图管理</h1>
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增轮播</Button>
            </div>
            <Table
                columns={columns}
                dataSource={items}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 10 }}
            />

            <Modal
                title={editingItem ? "编辑轮播图" : "新增轮播图"}
                open={isModalOpen}
                onOk={handleOk}
                onCancel={() => setIsModalOpen(false)}
            >
                <Form form={form} layout="vertical">
                    <Form.Item label="标题" name="title" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item label="图片">
                        <Upload
                            customRequest={handleUpload}
                            showUploadList={false}
                            listType="picture-card"
                        >
                            {imageUrl ? <img src={imageUrl} alt="preview" style={{ width: '100%' }} /> : (
                                <div>
                                    <PlusOutlined />
                                    <div style={{ marginTop: 8 }}>上传</div>
                                </div>
                            )}
                        </Upload>
                    </Form.Item>
                    <Form.Item label="徽标 (如: 焦点新闻)" name="badge" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item label="链接URL" name="url" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item label="排序 (越小越前)" name="sort_order" initialValue={0}>
                        <InputNumber style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item label="是否显示" name="is_active" valuePropName="checked" initialValue={true}>
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default CarouselList;
