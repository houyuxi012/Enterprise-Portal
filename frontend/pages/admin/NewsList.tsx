import React, { useState, useEffect } from 'react';
import { Input, DatePicker, Select, Popconfirm, message, Upload, Switch, Image, Card } from 'antd';
import type { GetProp, UploadFile, UploadProps } from 'antd';
import { Plus, Edit, Trash2, Search } from 'lucide-react';
import { PlusOutlined } from '@ant-design/icons';
import { NewsItem } from '../../types';
import ApiClient from '../../services/api';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import {
    AppButton,
    AppTable,
    AppModal,
    AppForm,
    AppPageHeader,
    AppFilterBar,
} from '../../components/admin';

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
    const [form] = AppForm.useForm();
    const [loading, setLoading] = useState(false);
    const [submitLoading, setSubmitLoading] = useState(false);

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
            message.error('加载资讯失败');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: any) => {
        try {
            await ApiClient.deleteNews(id);
            message.success('资讯已删除');
            fetchNews();
        } catch (error) {
            message.error('删除失败');
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

    const handleSubmit = async (values: any) => {
        try {
            setSubmitLoading(true);
            const payload = {
                ...values,
                date: values.date.format('YYYY-MM-DD')
            };

            if (editingNews) {
                await ApiClient.updateNews(Number(editingNews.id), payload);
                message.success('资讯已更新');
            } else {
                await ApiClient.createNews(payload);
                message.success('资讯已发布');
            }
            setIsModalOpen(false);
            fetchNews();
        } catch (error: any) {
            const errorDetail = error?.response?.data?.detail || error?.message || '未知错误';
            const errorMsg = typeof errorDetail === 'object' ? JSON.stringify(errorDetail) : errorDetail;
            message.error('操作失败: ' + errorMsg);
        } finally {
            setSubmitLoading(false);
        }
    };

    const filteredNews = news.filter(n =>
        n.title.toLowerCase().includes(textSearch.toLowerCase())
    );

    const columns: ColumnsType<NewsItem> = [
        {
            title: '封面',
            dataIndex: 'image',
            key: 'image',
            width: 80,
            render: (image: string) => (
                <div className="w-12 h-8 rounded-lg overflow-hidden border border-slate-200 shadow-sm">
                    <img src={image} alt="cover" className="w-full h-full object-cover" />
                </div>
            )
        },
        {
            title: '标题',
            dataIndex: 'title',
            key: 'title',
            render: (text: string, record: NewsItem) => (
                <div className="flex items-center space-x-2">
                    {record.is_top && (
                        <span className="bg-rose-50 text-rose-600 text-[10px] font-bold px-1.5 py-0.5 rounded border border-rose-100">
                            置顶
                        </span>
                    )}
                    <span className="font-bold text-slate-700 dark:text-slate-200">{text}</span>
                </div>
            )
        },
        {
            title: '分类',
            dataIndex: 'category',
            key: 'category',
            width: 100,
            render: (category: string) => (
                <span className="bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300 text-xs font-bold px-2.5 py-1 rounded-lg border border-indigo-100 dark:border-indigo-800">
                    {category}
                </span>
            ),
        },
        {
            title: '发布日期',
            dataIndex: 'date',
            key: 'date',
            width: 120,
            render: (date: string) => (
                <span className="text-slate-500 font-medium text-xs">{date}</span>
            )
        },
        {
            title: '操作',
            key: 'action',
            width: 160,
            render: (_: any, record: NewsItem) => (
                <div className="flex gap-2">
                    <AppButton
                        intent="tertiary"
                        size="sm"
                        icon={<Edit size={14} />}
                        onClick={() => handleEdit(record)}
                    >
                        编辑
                    </AppButton>
                    <Popconfirm title="确定删除?" onConfirm={() => handleDelete(record.id)}>
                        <AppButton intent="danger" size="sm" icon={<Trash2 size={14} />}>
                            删除
                        </AppButton>
                    </Popconfirm>
                </div>
            ),
        },
    ];

    return (
        <div className="admin-page p-6 bg-slate-50/50 dark:bg-slate-900/50 min-h-full -m-6">
            <AppPageHeader
                title="资讯内容管理"
                subtitle="发布和编辑企业新闻动态"
                action={
                    <AppButton intent="primary" icon={<Plus size={16} />} onClick={handleAddNew}>
                        发布资讯
                    </AppButton>
                }
            />

            <AppFilterBar>
                <AppFilterBar.Search
                    placeholder="搜索标题..."
                    value={textSearch}
                    onChange={e => setTextSearch(e.target.value)}
                    onSearch={setTextSearch}
                />
            </AppFilterBar>

            <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
                <AppTable
                    columns={columns}
                    dataSource={filteredNews}
                    rowKey="id"
                    loading={loading}
                    emptyText="暂无资讯数据"
                />
            </Card>

            <AppModal
                title={editingNews ? '编辑资讯' : '发布新的资讯动态'}
                open={isModalOpen}
                onOk={() => form.submit()}
                onCancel={() => setIsModalOpen(false)}
                confirmLoading={submitLoading}
                width={800}
                okText="确认发布"
            >
                <AppForm form={form} onFinish={handleSubmit}>
                    {/* Hidden Author Field */}
                    <AppForm.Item name="author" hidden>
                        <Input />
                    </AppForm.Item>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Left Column: Image Upload */}
                        <div className="md:col-span-1 space-y-4">
                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">封面图片</h3>
                            <AppForm.Item name="image" rules={[{ required: true, message: '请上传封面图片' }]} noStyle>
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

                            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700 mt-4">
                                <AppForm.Item name="is_top" label="置顶推广" valuePropName="checked" className="mb-0">
                                    <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                                </AppForm.Item>
                                <p className="text-xs text-slate-400 mt-2">开启后，该资讯将优先显示在首页轮播或置顶位置。</p>
                            </div>
                        </div>

                        {/* Right Column: Info & Content */}
                        <div className="md:col-span-2 space-y-4">
                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">基本信息</h3>
                            <AppForm.Item name="title" label="资讯标题" rules={[{ required: true, message: '请输入标题' }]}>
                                <Input placeholder="请输入引人注目的标题" />
                            </AppForm.Item>

                            <div className="grid grid-cols-2 gap-4">
                                <AppForm.Item name="category" label="所属分类" rules={[{ required: true, message: '请选择分类' }]}>
                                    <Select placeholder="选择分类">
                                        <Option value="公告">公告</Option>
                                        <Option value="活动">活动</Option>
                                        <Option value="政策">政策</Option>
                                        <Option value="文化">文化</Option>
                                    </Select>
                                </AppForm.Item>
                                <AppForm.Item name="date" label="发布日期" rules={[{ required: true, message: '请选择日期' }]}>
                                    <DatePicker style={{ width: '100%' }} />
                                </AppForm.Item>
                            </div>

                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider pt-2">内容详情</h3>
                            <AppForm.Item name="summary" label="资讯摘要" rules={[{ required: true, message: '请输入摘要' }]}>
                                <TextArea
                                    rows={6}
                                    placeholder="请输入主要内容摘要..."
                                    maxLength={200}
                                    showCount
                                />
                            </AppForm.Item>
                        </div>
                    </div>
                </AppForm>
            </AppModal>
        </div>
    );
};

export default NewsList;
