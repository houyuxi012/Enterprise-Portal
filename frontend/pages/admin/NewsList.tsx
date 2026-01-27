import React, { useState, useEffect } from 'react';
import { List, Button, Modal, Form, Input, DatePicker, Select, Popconfirm, message, Card, Space, Tag, Upload } from 'antd';
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

    return (
        <div className="site-card-wrapper">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">新闻资讯管理</h2>
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAddNew} size="large">发布资讯</Button>
            </div>
            <div className="mb-6">
                <Input
                    placeholder="搜索标题..."
                    prefix={<SearchOutlined />}
                    onChange={e => setTextSearch(e.target.value)}
                    style={{ width: 300 }}
                />
            </div>

            <List
                grid={{ gutter: 16, column: 3 }}
                dataSource={filteredNews}
                loading={loading}
                renderItem={item => (
                    <List.Item>
                        <Card
                            cover={<img alt="example" src={item.image} style={{ height: 160, objectFit: 'cover' }} />}
                            actions={[
                                <EditOutlined key="edit" onClick={() => handleEdit(item)} />,
                                <Popconfirm title="确定删除?" onConfirm={() => handleDelete(item.id)}>
                                    <DeleteOutlined key="delete" style={{ color: 'red' }} />
                                </Popconfirm>,
                            ]}
                        >
                            <Card.Meta
                                className="h-32"
                                title={<div className="truncate">{item.title}</div>}
                                description={
                                    <div>
                                        <div className="mb-2">
                                            <Tag color="blue">{item.category}</Tag>
                                            <span className="text-xs text-gray-400">{item.date}</span>
                                        </div>
                                        <div className="line-clamp-2 text-xs text-gray-500 h-10">{item.summary}</div>
                                    </div>
                                }
                            />
                        </Card>
                    </List.Item>
                )}
            />

            <Modal
                title={editingNews ? '编辑资讯' : '发布资讯'}
                open={isModalOpen}
                onOk={handleOk}
                onCancel={() => setIsModalOpen(false)}
                width={600}
            >
                <Form form={form} layout="vertical">
                    <Form.Item name="title" label="标题" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <div className="grid grid-cols-2 gap-4">
                        <Form.Item name="category" label="分类" rules={[{ required: true }]}>
                            <Select>
                                <Option value="公告">公告</Option>
                                <Option value="活动">活动</Option>
                                <Option value="政策">政策</Option>
                                <Option value="文化">文化</Option>
                            </Select>
                        </Form.Item>
                        <Form.Item name="date" label="日期" rules={[{ required: true }]}>
                            <DatePicker style={{ width: '100%' }} />
                        </Form.Item>
                    </div>
                    <Form.Item name="summary" label="摘要" rules={[{ required: true }]}>
                        <TextArea rows={4} />
                    </Form.Item>
                    <Form.Item label="封面图片" name="image">
                        <div className="space-y-2">
                            <Form.Item name="image" noStyle>
                                <Input hidden />
                            </Form.Item>
                            {form.getFieldValue('image') && (
                                <img src={form.getFieldValue('image')} alt="cover" className="w-full h-40 object-cover rounded-lg border" />
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
                                <Button icon={<UploadOutlined />}>上传封面图片</Button>
                            </Upload>
                        </div>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default NewsList;
