import React, { useState, useEffect } from 'react';
import { Input, Select, Popconfirm, message, Switch, AutoComplete, Tooltip, Card } from 'antd';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { Announcement } from '../../types';
import ApiClient from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import {
    AppButton,
    AppTable,
    AppModal,
    AppForm,
    AppTag,
    AppPageHeader,
} from '../../components/admin';

const { Option } = Select;
const { TextArea } = Input;

const AnnouncementList: React.FC = () => {
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<Announcement | null>(null);
    const [loading, setLoading] = useState(false);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [form] = AppForm.useForm();

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const data = await ApiClient.getAnnouncements();
            setAnnouncements(data);
        } catch (error) {
            message.error('加载公告失败');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: any) => {
        try {
            await ApiClient.deleteAnnouncement(id);
            message.success('公告已删除');
            fetchData();
        } catch (error) {
            message.error('删除失败');
        }
    };

    const handleEdit = (item: Announcement) => {
        setEditingItem(item);
        form.setFieldsValue(item);
        setIsModalOpen(true);
    };

    const handleAddNew = () => {
        setEditingItem(null);
        form.resetFields();
        form.setFieldsValue({
            tag: '通知',
            color: 'blue',
            is_urgent: false,
            time: '刚刚'
        });
        setIsModalOpen(true);
    };

    const handleSubmit = async (values: any) => {
        try {
            setSubmitLoading(true);
            if (editingItem) {
                await ApiClient.updateAnnouncement(Number(editingItem.id), values);
                message.success('公告已更新');
            } else {
                await ApiClient.createAnnouncement(values);
                message.success('公告已发布');
            }
            setIsModalOpen(false);
            fetchData();
        } catch (error: any) {
            const errorMsg = error.response?.data?.detail || error.message || '未知错误';
            message.error('操作失败: ' + errorMsg);
        } finally {
            setSubmitLoading(false);
        }
    };

    const columns: ColumnsType<Announcement> = [
        {
            title: '标题',
            dataIndex: 'title',
            key: 'title',
            render: (text: string) => <span className="font-black text-slate-800 dark:text-slate-200">{text}</span>
        },
        {
            title: '内容',
            dataIndex: 'content',
            key: 'content',
            ellipsis: { showTitle: false },
            render: (content: string) => (
                <Tooltip placement="topLeft" title={content}>
                    <span className="text-slate-500 text-sm">{content}</span>
                </Tooltip>
            ),
        },
        {
            title: '标签',
            key: 'tag',
            width: 100,
            render: (_: any, record: Announcement) => (
                <AppTag status="info">{record.tag}</AppTag>
            ),
        },
        {
            title: '状态',
            dataIndex: 'is_urgent',
            key: 'is_urgent',
            width: 100,
            render: (urgent: boolean) => (
                urgent ?
                    <span className="bg-rose-50 text-rose-600 px-2 py-0.5 rounded-lg text-xs font-black border border-rose-100 flex items-center w-fit">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5 animate-pulse"></span>
                        紧急
                    </span> :
                    <span className="text-xs font-bold text-slate-400">普通通知</span>
            )
        },
        {
            title: '发布时间',
            dataIndex: 'time',
            key: 'time',
            width: 120,
            render: (text: string) => <span className="text-xs font-bold text-slate-400">{text}</span>
        },
        {
            title: '操作',
            key: 'action',
            width: 160,
            render: (_: any, record: Announcement) => (
                <div className="flex gap-2">
                    <AppButton intent="tertiary" size="sm" icon={<Edit size={14} />} onClick={() => handleEdit(record)}>编辑</AppButton>
                    <Popconfirm title="确定删除?" onConfirm={() => handleDelete(record.id)}>
                        <AppButton intent="danger" size="sm" icon={<Trash2 size={14} />}>删除</AppButton>
                    </Popconfirm>
                </div>
            ),
        },
    ];

    return (
        <div className="admin-page p-6 bg-slate-50/50 dark:bg-slate-900/50 min-h-full -m-6">
            <AppPageHeader
                title="公告管理"
                subtitle="管理发布到首页的大屏通知"
                action={
                    <AppButton intent="primary" icon={<Plus size={16} />} onClick={handleAddNew}>
                        发布公告
                    </AppButton>
                }
            />

            <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
                <AppTable
                    columns={columns}
                    dataSource={announcements}
                    rowKey="id"
                    loading={loading}
                    emptyText="暂无公告数据"
                />
            </Card>

            <AppModal
                title={editingItem ? '编辑公告' : '发布公告'}
                open={isModalOpen}
                onOk={() => form.submit()}
                onCancel={() => setIsModalOpen(false)}
                confirmLoading={submitLoading}
            >
                <AppForm form={form} onFinish={handleSubmit}>
                    <AppForm.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
                        <Input placeholder="请输入公告标题" />
                    </AppForm.Item>
                    <AppForm.Item name="content" label="内容" rules={[{ required: true, message: '请输入内容' }]}>
                        <TextArea rows={4} placeholder="请输入公告内容" />
                    </AppForm.Item>
                    <div className="grid grid-cols-2 gap-4">
                        <AppForm.Item name="tag" label="标签" rules={[{ required: true, message: '请选择或输入标签' }]}>
                            <AutoComplete
                                options={[
                                    { value: '通知' },
                                    { value: '维护' },
                                    { value: '警告' },
                                    { value: '更新' },
                                    { value: '活动' },
                                    { value: '招聘' }
                                ]}
                                placeholder="选择或输入新标签"
                            />
                        </AppForm.Item>
                        <AppForm.Item name="color" label="颜色主题" rules={[{ required: true, message: '请选择颜色' }]}>
                            <Select placeholder="选择颜色">
                                <Option value="blue">蓝色</Option>
                                <Option value="yellow">黄色</Option>
                                <Option value="red">红色</Option>
                                <Option value="green">绿色</Option>
                            </Select>
                        </AppForm.Item>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <AppForm.Item name="time" label="显示时间" rules={[{ required: true, message: '请输入显示时间' }]}>
                            <Input placeholder="例如: 10分钟前" />
                        </AppForm.Item>
                        <AppForm.Item name="is_urgent" label="紧急提醒" valuePropName="checked">
                            <Switch checkedChildren="紧急" unCheckedChildren="普通" />
                        </AppForm.Item>
                    </div>
                </AppForm>
            </AppModal>
        </div>
    );
};

export default AnnouncementList;
