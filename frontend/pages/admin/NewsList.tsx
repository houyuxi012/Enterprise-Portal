import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, DatePicker, Select, Popconfirm, message, Tag, Upload, Space, Tooltip, Switch, Image } from 'antd';
import type { GetProp, UploadFile, UploadProps } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, UploadOutlined, PictureOutlined } from '@ant-design/icons';
import { NewsItem } from '../../types';
import ApiClient from '../../services/api';
import dayjs from 'dayjs';

type FileType = Parameters<GetProp<UploadProps, 'beforeUpload'>>[0];

const getBase64 = (file: FileType): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
    });

const { Option } = Select;
const { TextArea } = Input;

const NewsList: React.FC = () => {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingNews, setEditingNews] = useState<NewsItem | null>(null);
    const [textSearch, setTextSearch] = useState('');
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    // Upload state
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewImage, setPreviewImage] = useState('');
    const [fileList, setFileList] = useState<UploadFile[]>([]);

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

        // Init fileList for existing image
        if (item.image) {
            setFileList([
                {
                    uid: '-1',
                    name: 'image.png',
                    status: 'done',
                    url: item.image,
                }
            ]);
        } else {
            setFileList([]);
        }

        setIsModalOpen(true);
    };

    const handleAddNew = () => {
        setEditingNews(null);
        form.resetFields();
        form.setFieldsValue({
            category: '公告',
            date: dayjs(),
            author: 'Admin',
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

    // const { Dragger } = Upload; // No longer needed

    const handleOk = async () => {
        try {
            // alert('Debug: Starting submission...');
            const values = await form.validateFields();
            const payload = {
                ...values,
                date: values.date.format('YYYY-MM-DD')
            };

            // alert('Debug: Payload: ' + JSON.stringify(payload));

            if (editingNews) {
                await ApiClient.updateNews(Number(editingNews.id), payload);
                message.success('News updated');
            } else {
                await ApiClient.createNews(payload);
                message.success('News created');
            }
            setIsModalOpen(false);
            fetchNews();
        } catch (error: any) {
            console.error(error);
            // Check if it's a form validation error (Ant Design format)
            if (error.errorFields) {
                message.warning('请检查表单中标记红色的必填项');
                return;
            }

            const errorMsg = error.response?.data?.detail || error.message || 'Unknown error';
            alert('Debug Error: ' + errorMsg);
            message.error('操作失败: ' + errorMsg);
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
            render: (text: string, record: NewsItem) => (
                <Space>
                    {record.is_top && <Tag color="red">置顶</Tag>}
                    <span className="font-bold">{text}</span>
                </Space>
            )
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
                title={<div className="text-xl font-bold py-2">{editingNews ? '编辑资讯' : '发布新的资讯动态'}</div>}
                open={isModalOpen}
                onOk={handleOk}
                onCancel={() => setIsModalOpen(false)}
                width={800}
                className="rounded-3xl overflow-hidden"
                centered
                okText="确认发布"
                cancelText="取消"
                okButtonProps={{ size: 'large', className: 'rounded-xl px-8' }}
                cancelButtonProps={{ size: 'large', className: 'rounded-xl px-8' }}
            >
                <Form form={form} layout="vertical" className="pt-6 px-2">
                    {/* Hidden Author Field */}
                    <Form.Item name="author" hidden>
                        <Input />
                    </Form.Item>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {/* Left Column: Image Upload */}
                        <div className="md:col-span-1 space-y-4">
                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">封面图片</h3>
                            <Form.Item name="image" rules={[{ required: true, message: '请上传封面图片' }]} noStyle>
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
                                        <div style={{ marginTop: 8 }}>上传封面</div>
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

                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mt-4">
                                <Form.Item name="is_top" label="置顶推广" valuePropName="checked" className="mb-0">
                                    <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                                </Form.Item>
                                <p className="text-xs text-slate-400 mt-2">开启后，该资讯将优先显示在首页轮播或置顶位置。</p>
                            </div>
                        </div>

                        {/* Right Column: Info & Content */}
                        <div className="md:col-span-2 space-y-4">
                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">基本信息</h3>
                            <Form.Item name="title" label="资讯标题" rules={[{ required: true, message: '请输入标题' }]}>
                                <Input className="rounded-xl bg-slate-50 border-slate-200" size="large" placeholder="请输入引人注目的标题" />
                            </Form.Item>

                            <div className="grid grid-cols-2 gap-4">
                                <Form.Item name="category" label="所属分类" rules={[{ required: true, message: '请选择分类' }]}>
                                    <Select size="large" className="rounded-xl" placeholder="选择分类">
                                        <Option value="公告">公告</Option>
                                        <Option value="活动">活动</Option>
                                        <Option value="政策">政策</Option>
                                        <Option value="文化">文化</Option>
                                    </Select>
                                </Form.Item>
                                <Form.Item name="date" label="发布日期" rules={[{ required: true, message: '请选择日期' }]}>
                                    <DatePicker style={{ width: '100%' }} size="large" className="rounded-xl" />
                                </Form.Item>
                            </div>

                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider pt-2 mb-2">内容详情</h3>
                            <Form.Item name="summary" label="资讯摘要" rules={[{ required: true, message: '请输入摘要' }]}>
                                <TextArea
                                    rows={6}
                                    className="rounded-xl bg-slate-50 border-slate-200"
                                    placeholder="请输入主要内容摘要..."
                                    maxLength={200}
                                    showCount
                                />
                            </Form.Item>
                        </div>
                    </div>
                </Form>
            </Modal>
        </div>
    );
};

export default NewsList;
