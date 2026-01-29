import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, Popconfirm, message, Switch, Tag, Space, Tooltip, AutoComplete } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { Announcement } from '../../types';
import ApiClient from '../../services/api';

const { Option } = Select;
const { TextArea } = Input;

const AnnouncementList: React.FC = () => {
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<Announcement | null>(null);
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm();

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const data = await ApiClient.getAnnouncements();
            setAnnouncements(data);
        } catch (error) {
            message.error('Failed to fetch announcements');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: any) => {
        try {
            await ApiClient.deleteAnnouncement(id);
            message.success('Deleted successfully');
            fetchData();
        } catch (error) {
            message.error('Failed to delete');
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

    const handleOk = async () => {
        try {
            // DEBUG: Check if function starts
            // alert('Debug: Starting submission...'); 
            const values = await form.validateFields();
            // alert('Debug: Validation passed. Values: ' + JSON.stringify(values));

            if (editingItem) {
                await ApiClient.updateAnnouncement(Number(editingItem.id), values);
                message.success('Updated successfully');
            } else {
                await ApiClient.createAnnouncement(values);
                message.success('Created successfully');
            }
            setIsModalOpen(false);
            fetchData();
        } catch (error: any) {
            console.error(error);

            // Check if it's a form validation error (Ant Design format)
            if (error.errorFields) {
                message.warning('请检查表单中标记红色的必填项');
                return;
            }

            // Real API or System Error
            // Show detailed error in alert to help debugging
            const errorMsg = error.response?.data?.detail || error.message || 'Unknown error';
            alert('Debug Error: ' + errorMsg);
            message.error('操作失败: ' + errorMsg);
        }
    };

    const columns = [
        {
            title: '标题',
            dataIndex: 'title',
            key: 'title',
            width: '20%',
            render: (text: string) => <span className="font-black text-slate-800 dark:text-slate-200">{text}</span>
        },
        {
            title: '内容',
            dataIndex: 'content',
            key: 'content',
            ellipsis: {
                showTitle: false,
            },
            render: (content: string) => (
                <Tooltip placement="topLeft" title={content}>
                    <span className="text-slate-500">{content}</span>
                </Tooltip>
            ),
        },
        {
            title: '标签',
            key: 'tag',
            width: '10%',
            render: (_: any, record: Announcement) => (
                <Tag color={record.color} className="rounded-lg font-bold border-0 px-2 py-0.5">{record.tag}</Tag>
            ),
        },
        {
            title: '状态',
            dataIndex: 'is_urgent',
            key: 'is_urgent',
            width: '10%',
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
            width: '12%',
            render: (text: string) => <span className="text-xs font-bold text-slate-400">{text}</span>
        },
        {
            title: '操作',
            key: 'action',
            width: '15%',
            render: (_: any, record: Announcement) => (
                <Space size="small">
                    <Button
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                        className="text-blue-600 hover:bg-blue-50 font-bold rounded-lg"
                    >
                        编辑
                    </Button>
                    <Popconfirm title="确定删除?" onConfirm={() => handleDelete(record.id)}>
                        <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            className="hover:bg-red-50 font-bold rounded-lg"
                        >
                            删除
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-700 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-6 min-h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">公告管理</h2>
                    <p className="text-xs text-slate-400 font-bold mt-1">管理发布到首页的大屏通知</p>
                </div>
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={handleAddNew}
                    size="large"
                    className="rounded-xl px-6 bg-slate-900 hover:bg-slate-800 shadow-lg shadow-slate-900/20 border-0 h-10 font-bold transition-all hover:scale-105 active:scale-95"
                >
                    发布公告
                </Button>
            </div>

            {/* Content Card */}
            <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-8 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700/50">
                <Table
                    columns={columns}
                    dataSource={announcements}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 8, className: 'font-bold' }}
                    className="ant-table-custom"
                />
            </div>

            <Modal
                title={editingItem ? '编辑公告' : '发布公告'}
                open={isModalOpen}
                onOk={handleOk}
                onCancel={() => setIsModalOpen(false)}
                className="rounded-2xl overflow-hidden"
            >
                <Form form={form} layout="vertical" className="pt-4">
                    <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
                        <Input className="rounded-lg" />
                    </Form.Item>
                    <Form.Item name="content" label="内容" rules={[{ required: true, message: '请输入内容' }]}>
                        <TextArea rows={4} className="rounded-lg" />
                    </Form.Item>
                    <div className="grid grid-cols-2 gap-4">
                        <Form.Item name="tag" label="标签" rules={[{ required: true, message: '请选择或输入标签' }]}>
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
                                className="rounded-lg"
                            />
                        </Form.Item>
                        <Form.Item name="color" label="颜色主题" rules={[{ required: true, message: '请选择颜色' }]}>
                            <Select>
                                <Option value="blue">Blue</Option>
                                <Option value="yellow">Yellow</Option>
                                <Option value="red">Red</Option>
                                <Option value="green">Green</Option>
                            </Select>
                        </Form.Item>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Form.Item name="time" label="显示时间" rules={[{ required: true, message: '请输入显示时间' }]}>
                            <Input placeholder="例如: 10分钟前" />
                        </Form.Item>
                        <Form.Item name="is_urgent" label="紧急提醒" valuePropName="checked">
                            <Switch />
                        </Form.Item>
                    </div>
                </Form>
            </Modal>
        </div>
    );
};

export default AnnouncementList;
