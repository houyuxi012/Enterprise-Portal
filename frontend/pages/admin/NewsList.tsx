import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, DatePicker, Select, Popconfirm, message, Tag, Upload, Space, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, UploadOutlined, PictureOutlined } from '@ant-design/icons';
import { NewsItem } from '../../types';
import ApiClient from '../../services/api';
import dayjs from 'dayjs';

const { Option } = Select;
const { TextArea } = Input;

const NewsList: React.FC = () => {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingNews, setEditingNews] = useState<NewsItem | null>(null);
    const [textSearch, setTextSearch] = useState('');
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchNews();
    }, []);

    const fetchNews = async () => {
        setLoading(true);
        try {
            const data = await ApiClient.getNews();
            setNews(data);
        } catch (error) {
            console.error(error);
            message.error('Failed to fetch news');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: any) => {
        try {
            await ApiClient.deleteNews(id);
            message.success('News deleted');
            fetchNews();
        } catch (error) {
            message.error('Failed to delete news');
        }
    };

    const handleEdit = (item: NewsItem) => {
        setEditingNews(item);
        form.setFieldsValue({
            ...item,
            date: dayjs(item.date)
        });
        setIsModalOpen(true);
    };

    const handleAddNew = () => {
        setEditingNews(null);
        form.resetFields();
        form.setFieldsValue({
            category: '公告',
            date: dayjs(),
            author: 'Admin',
            image: 'https://picsum.photos/seed/new/400/200'
        });
        setIsModalOpen(true);
    };

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            const payload = {
                ...values,
                date: values.date.format('YYYY-MM-DD')
            };

            if (editingNews) {
                await ApiClient.updateNews(Number(editingNews.id), payload);
                message.success('News updated');
            } else {
                await ApiClient.createNews(payload);
                message.success('News created');
            }
            setIsModalOpen(false);
            fetchNews();
        } catch (error) {
            console.error(error);
        }
    };

    const filteredNews = news.filter(n =>
        n.title.toLowerCase().includes(textSearch.toLowerCase())
    );

    const columns = [
        {
            title: '封面',
            dataIndex: 'image',
            key: 'image',
            width: '10%',
            render: (image: string) => (
                <div className="w-16 h-10 rounded-lg overflow-hidden border border-slate-200">
                    <img src={image} alt="cover" className="w-full h-full object-cover" />
                </div>
            )
        },
        {
            title: '标题',
            dataIndex: 'title',
            key: 'title',
            width: '25%',
            render: (text: string) => <span className="font-bold">{text}</span>
        },
        {
            title: '摘要',
            dataIndex: 'summary',
            key: 'summary',
            ellipsis: {
                showTitle: false,
            },
            render: (summary: string) => (
                <Tooltip placement="topLeft" title={summary}>
                    {summary}
                </Tooltip>
            ),
        },
        {
            title: '分类',
            dataIndex: 'category',
            key: 'category',
            width: '10%',
            render: (category: string) => (
                <Tag color="cyan">{category}</Tag>
            ),
        },
        {
            title: '发布日期',
            dataIndex: 'date',
            key: 'date',
            width: '15%',
            render: (date: string) => <span className="text-gray-500">{date}</span>
        },
        {
            title: '操作',
            key: 'action',
            width: '15%',
            render: (_: any, record: NewsItem) => (
                <Space size="middle">
                    <Button
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                        className="text-blue-600 hover:text-blue-700"
                    >
                        编辑
                    </Button>
                    <Popconfirm title="确定删除?" onConfirm={() => handleDelete(record.id)}>
                        <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                        >
                            删除
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 dark:bg-slate-800 dark:border-slate-700">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold dark:text-white">资讯内容管理</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">发布和编辑企业新闻动态</p>
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAddNew} size="large" className="rounded-xl px-6">发布资讯</Button>
            </div>
            <div className="mb-6 flex space-x-4">
                <Input
                    placeholder="搜索标题..."
                    prefix={<SearchOutlined />}
                    onChange={e => setTextSearch(e.target.value)}
                    className="w-80 rounded-xl"
                    size="large"
                />
            </div>

            <Table
                columns={columns}
                dataSource={filteredNews}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 8 }}
            />

            <Modal
                title={editingNews ? '编辑资讯' : '发布资讯'}
                open={isModalOpen}
                onOk={handleOk}
                onCancel={() => setIsModalOpen(false)}
                width={700}
                className="rounded-2xl overflow-hidden"
            >
                <Form form={form} layout="vertical" className="pt-4">
                    <Form.Item name="title" label="标题" rules={[{ required: true }]}>
                        <Input className="rounded-lg" size="large" />
                    </Form.Item>
                    <div className="grid grid-cols-2 gap-4">
                        <Form.Item name="category" label="分类" rules={[{ required: true }]}>
                            <Select size="large" className="rounded-lg">
                                <Option value="公告">公告</Option>
                                <Option value="活动">活动</Option>
                                <Option value="政策">政策</Option>
                                <Option value="文化">文化</Option>
                            </Select>
                        </Form.Item>
                        <Form.Item name="date" label="日期" rules={[{ required: true }]}>
                            <DatePicker style={{ width: '100%' }} size="large" className="rounded-lg" />
                        </Form.Item>
                    </div>
                    <Form.Item name="summary" label="摘要" rules={[{ required: true }]}>
                        <TextArea rows={4} className="rounded-lg" />
                    </Form.Item>
                    <Form.Item label="封面图片" name="image">
                        <div className="space-y-4">
                            <Form.Item name="image" noStyle>
                                <Input hidden />
                            </Form.Item>
                            {form.getFieldValue('image') && (
                                <div className="w-full h-48 rounded-xl overflow-hidden border border-slate-200 shadow-sm relative group">
                                    <img src={form.getFieldValue('image')} alt="cover" className="w-full h-full object-cover" />
                                </div>
                            )}
                            <Upload
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
                                showUploadList={false}
                            >
                                <Button icon={<UploadOutlined />} size="large" className="rounded-xl w-full">点击上传封面图片</Button>
                            </Upload>
                        </div>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default NewsList;
