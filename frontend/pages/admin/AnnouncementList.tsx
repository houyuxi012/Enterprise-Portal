import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, Popconfirm, message, Switch, Tag, Space, Tooltip } from 'antd';
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
            const values = await form.validateFields();
            if (editingItem) {
                await ApiClient.updateAnnouncement(Number(editingItem.id), values);
                message.success('Updated successfully');
            } else {
                await ApiClient.createAnnouncement(values);
                message.success('Created successfully');
            }
            setIsModalOpen(false);
            fetchData();
        } catch (error) {
            console.error(error);
        }
    };

    const columns = [
        {
            title: '标题',
            dataIndex: 'title',
            key: 'title',
            width: '15%',
            render: (text: string) => <span className="font-bold">{text}</span>
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
                    {content}
                </Tooltip>
            ),
        },
        {
            title: '标签/颜色',
            key: 'tag',
            width: '12%',
            render: (_: any, record: Announcement) => (
                <Tag color={record.color}>{record.tag}</Tag>
            ),
        },
        {
            title: '紧急状态',
            dataIndex: 'is_urgent',
            key: 'is_urgent',
            width: '10%',
            render: (urgent: boolean) => (
                urgent ? <Tag color="red">紧急</Tag> : <Tag color="default">普通</Tag>
            )
        },
        {
            title: '时间',
            dataIndex: 'time',
            key: 'time',
            width: '10%',
        },
        {
            title: '操作',
            key: 'action',
            width: '15%',
            render: (_: any, record: Announcement) => (
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
                    <h2 className="text-2xl font-bold dark:text-white">公告管理</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">管理发布到首页的大屏通知</p>
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAddNew} size="large" className="rounded-xl px-6">
                    发布公告
                </Button>
            </div>

            <Table
                columns={columns}
                dataSource={announcements}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 8 }}
            />

            <Modal
                title={editingItem ? '编辑公告' : '发布公告'}
                open={isModalOpen}
                onOk={handleOk}
                onCancel={() => setIsModalOpen(false)}
                className="rounded-2xl overflow-hidden"
            >
                <Form form={form} layout="vertical" className="pt-4">
                    <Form.Item name="title" label="标题" rules={[{ required: true }]}>
                        <Input className="rounded-lg" />
                    </Form.Item>
                    <Form.Item name="content" label="内容" rules={[{ required: true }]}>
                        <TextArea rows={4} className="rounded-lg" />
                    </Form.Item>
                    <div className="grid grid-cols-2 gap-4">
                        <Form.Item name="tag" label="标签">
                            <Select className="rounded-lg">
                                <Option value="通知">通知</Option>
                                <Option value="维护">维护</Option>
                                <Option value="警告">警告</Option>
                                <Option value="更新">更新</Option>
                            </Select>
                        </Form.Item>
                        <Form.Item name="color" label="颜色主题">
                            <Select>
                                <Option value="blue">Blue</Option>
                                <Option value="yellow">Yellow</Option>
                                <Option value="red">Red</Option>
                                <Option value="green">Green</Option>
                            </Select>
                        </Form.Item>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Form.Item name="time" label="显示时间">
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
