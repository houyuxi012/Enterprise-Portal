import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Switch, Upload, message, Tag, Popconfirm } from 'antd';
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
        } catch (error: any) {
            console.error('Carousel operation error:', error);
            const errorMsg = error?.response?.data?.detail || error?.message || '未知错误';
            message.error('操作失败: ' + (typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg));
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
            render: (text: string) => (
                <div className="w-32 h-20 rounded-xl overflow-hidden shadow-md relative group cursor-pointer">
                    <img src={text} alt="preview" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                </div>
            )
        },
        {
            title: '标题',
            dataIndex: 'title',
            key: 'title',
            render: (text: string) => <span className="font-bold text-slate-800 dark:text-slate-200">{text}</span>
        },
        {
            title: '徽标',
            dataIndex: 'badge',
            key: 'badge',
            render: (text: string) => <Tag color="blue" className="rounded-lg font-bold border-0 px-2">{text}</Tag>
        },
        {
            title: '链接',
            dataIndex: 'url',
            key: 'url',
            render: (text: string) => <a href={text} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline truncate max-w-[150px] block">{text}</a>
        },
        {
            title: '排序',
            dataIndex: 'sort_order',
            key: 'sort_order',
            render: (text: number) => <span className="font-mono font-bold text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">{text}</span>
        },
        {
            title: '状态',
            dataIndex: 'is_active',
            key: 'is_active',
            render: (active: boolean) => (
                <span className={`text-xs font-bold px-2 py-1 rounded-lg ${active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                    {active ? '显示中' : '已隐藏'}
                </span>
            )
        },
        {
            title: '操作',
            key: 'action',
            width: '15%',
            render: (_: any, record: CarouselItem) => (
                <div className="flex space-x-2">
                    <Button
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                        className="text-blue-600 hover:bg-blue-50 font-bold rounded-lg"
                    />
                    <Popconfirm title="确定删除?" onConfirm={() => handleDelete(record.id)}>
                        <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            className="hover:bg-red-50 font-bold rounded-lg"
                        />
                    </Popconfirm>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-700 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-6 min-h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">轮播管理</h2>
                    <p className="text-xs text-slate-400 font-bold mt-1">管理首页顶部轮播图展示内容</p>
                </div>
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={handleAdd}
                    size="large"
                    className="rounded-xl px-6 bg-slate-900 hover:bg-slate-800 shadow-lg shadow-slate-900/20 border-0 h-10 font-bold transition-all hover:scale-105 active:scale-95"
                >
                    新增轮播
                </Button>
            </div>

            {/* Content Card */}
            <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-8 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700/50">
                <Table
                    columns={columns}
                    dataSource={items}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 10, className: 'font-bold' }}
                    className="ant-table-custom"
                />
            </div>

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
