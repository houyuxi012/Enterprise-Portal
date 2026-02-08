import React, { useEffect, useState } from 'react';
import { Input, InputNumber, Switch, Upload, message, Popconfirm, Card } from 'antd';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { PlusOutlined } from '@ant-design/icons';
import ApiClient from '../../services/api';
import { CarouselItem } from '../../types';
import type { ColumnsType } from 'antd/es/table';
import {
    AppButton,
    AppTable,
    AppModal,
    AppForm,
    AppTag,
    AppPageHeader,
} from '../../components/admin';

const CarouselList: React.FC = () => {
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

    const handleSubmit = async (values: any) => {
        try {
            setSubmitLoading(true);
            values.image = imageUrl;

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
            const errorMsg = error?.response?.data?.detail || error?.message || '未知错误';
            message.error('操作失败: ' + (typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg));
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
            message.success('上传成功');
        } catch (err) {
            onError(err);
            message.error('上传失败');
        }
    };

    const columns: ColumnsType<CarouselItem> = [
        {
            title: '预览',
            dataIndex: 'image',
            key: 'image',
            width: 150,
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
            width: 100,
            render: (text: string) => <AppTag status="info">{text}</AppTag>
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
            width: 80,
            render: (text: number) => <span className="font-mono font-bold text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">{text}</span>
        },
        {
            title: '状态',
            dataIndex: 'is_active',
            key: 'is_active',
            width: 100,
            render: (active: boolean) => (
                <AppTag status={active ? 'success' : 'default'}>
                    {active ? '显示中' : '已隐藏'}
                </AppTag>
            )
        },
        {
            title: '操作',
            key: 'action',
            width: 120,
            render: (_: any, record: CarouselItem) => (
                <div className="flex gap-1">
                    <AppButton intent="tertiary" iconOnly size="sm" icon={<Edit size={14} />} onClick={() => handleEdit(record)} />
                    <Popconfirm title="确定删除?" onConfirm={() => handleDelete(record.id)}>
                        <AppButton intent="danger" iconOnly size="sm" icon={<Trash2 size={14} />} />
                    </Popconfirm>
                </div>
            ),
        },
    ];

    return (
        <div className="admin-page p-6 bg-slate-50/50 dark:bg-slate-900/50 min-h-full -m-6">
            <AppPageHeader
                title="轮播管理"
                subtitle="管理首页顶部轮播图展示内容"
                action={
                    <AppButton intent="primary" icon={<Plus size={16} />} onClick={handleAdd}>
                        新增轮播
                    </AppButton>
                }
            />

            <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
                <AppTable
                    columns={columns}
                    dataSource={items}
                    rowKey="id"
                    loading={loading}
                    emptyText="暂无轮播图数据"
                />
            </Card>

            <AppModal
                title={editingItem ? "编辑轮播图" : "新增轮播图"}
                open={isModalOpen}
                onOk={() => form.submit()}
                onCancel={() => setIsModalOpen(false)}
                confirmLoading={submitLoading}
            >
                <AppForm form={form} onFinish={handleSubmit}>
                    <AppForm.Item label="标题" name="title" rules={[{ required: true, message: '请输入标题' }]}>
                        <Input placeholder="请输入轮播标题" />
                    </AppForm.Item>
                    <AppForm.Item label="图片">
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
                    </AppForm.Item>
                    <AppForm.Item label="徽标 (如: 焦点新闻)" name="badge" rules={[{ required: true, message: '请输入徽标' }]}>
                        <Input placeholder="如: 焦点新闻、热门动态" />
                    </AppForm.Item>
                    <AppForm.Item label="链接URL" name="url" rules={[{ required: true, message: '请输入链接' }]}>
                        <Input placeholder="点击跳转的链接地址" />
                    </AppForm.Item>
                    <AppForm.Item label="排序 (越小越前)" name="sort_order" initialValue={0}>
                        <InputNumber style={{ width: '100%' }} min={0} />
                    </AppForm.Item>
                    <AppForm.Item label="是否显示" name="is_active" valuePropName="checked" initialValue={true}>
                        <Switch checkedChildren="显示" unCheckedChildren="隐藏" />
                    </AppForm.Item>
                </AppForm>
            </AppModal>
        </div>
    );
};

export default CarouselList;
