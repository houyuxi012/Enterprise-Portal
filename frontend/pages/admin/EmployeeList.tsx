import React, { useState, useEffect } from 'react';
import { Table, Button, Input, Modal, Form, Select, Avatar, Tag, Space, Popconfirm, message, Upload } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, UploadOutlined, UserOutlined, KeyOutlined } from '@ant-design/icons';
import { Employee } from '../../types';
import ApiClient from '../../services/api';

const { Option } = Select;

const EmployeeList: React.FC = () => {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
    const [searchText, setSearchText] = useState('');
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchEmployees();
    }, []);

    const fetchEmployees = async () => {
        setLoading(true);
        try {
            const data = await ApiClient.getEmployees();
            setEmployees(data);
        } catch (error) {
            console.error(error);
            message.error('Failed to fetch employees');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: any) => {
        try {
            await ApiClient.deleteEmployee(id);
            message.success('Employee deleted successfully');
            fetchEmployees();
        } catch (error) {
            message.error('Failed to delete employee');
        }
    };

    const handleResetPassword = async (account: string) => {
        try {
            await ApiClient.resetPassword(account);
            message.success(`用户 ${account} 密码已重置为 123456`);
        } catch (error) {
            message.error('重置密码失败');
        }
    };

    const handleEdit = (emp: Employee) => {
        setEditingEmployee(emp);
        form.setFieldsValue(emp);
        setIsModalOpen(true);
    };

    const handleAddNew = () => {
        setEditingEmployee(null);
        form.resetFields();
        form.setFieldsValue({
            gender: '男',
        });
        setIsModalOpen(true);
    };

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            if (editingEmployee) {
                await ApiClient.updateEmployee(Number(editingEmployee.id), values);
                message.success('Employee updated');
            } else {
                await ApiClient.createEmployee(values);
                message.success('Employee created');
            }
            setIsModalOpen(false);
            fetchEmployees();
        } catch (error) {
            console.error('Validate Failed:', error);
        }
    };

    const columns = [
        {
            title: '基本信息',
            dataIndex: 'name',
            key: 'name',
            render: (text: string, record: Employee) => (
                <div className="flex items-center space-x-3">
                    <Avatar src={record.avatar} />
                    <div>
                        <div className="font-bold">{text} <Tag className="ml-2">{record.gender}</Tag></div>
                        <div className="text-xs text-slate-400">#{record.job_number} · @{record.account}</div>
                    </div>
                </div>
            ),
        },
        {
            title: '职位/部门',
            dataIndex: 'role',
            key: 'role',
            render: (text: string, record: Employee) => (
                <div>
                    <div className="font-bold">{text}</div>
                    <div className="text-xs text-gray-400">{record.department}</div>
                </div>
            ),
        },
        {
            title: '联系方式',
            key: 'contact',
            render: (_: any, record: Employee) => (
                <div>
                    <div className="text-xs">{record.email}</div>
                    <div className="text-xs text-gray-400">{record.phone}</div>
                </div>
            ),
        },
        {
            title: '位置',
            dataIndex: 'location',
            key: 'location',
        },
        {
            title: '操作',
            key: 'action',
            render: (_: any, record: Employee) => (
                <Space size="middle">
                    <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                    <Popconfirm title="确定重置密码为 123456 吗?" onConfirm={() => handleResetPassword(record.account)}>
                        <Button type="text" icon={<KeyOutlined />} title="重置密码" />
                    </Popconfirm>
                    <Popconfirm title="确定要删除吗?" onConfirm={() => handleDelete(record.id)}>
                        <Button type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const filteredData = employees.filter(e =>
        e.name.toLowerCase().includes(searchText.toLowerCase()) ||
        e.department.toLowerCase().includes(searchText.toLowerCase())
    );

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">用户管理</h2>
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAddNew} size="large">新增用户</Button>
            </div>

            <div className="mb-4">
                <Input
                    placeholder="搜索姓名或部门..."
                    prefix={<SearchOutlined />}
                    onChange={e => setSearchText(e.target.value)}
                    style={{ width: 300 }}
                />
            </div>

            <Table
                columns={columns}
                dataSource={filteredData}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 8 }}
            />

            <Modal
                title={editingEmployee ? '编辑用户' : '新增用户'}
                open={isModalOpen}
                onOk={handleOk}
                onCancel={() => setIsModalOpen(false)}
                width={700}
            >
                <Form form={form} layout="vertical" name="employee_form">
                    <Form.Item label="头像" required>
                        <div className="flex items-center space-x-4">
                            <Form.Item name="avatar" noStyle>
                                <Input hidden />
                            </Form.Item>
                            <Form.Item shouldUpdate={(prev, curr) => prev.avatar !== curr.avatar} noStyle>
                                {() => (
                                    <Avatar
                                        size={64}
                                        src={form.getFieldValue('avatar')}
                                        icon={<UserOutlined />}
                                        style={{ backgroundColor: form.getFieldValue('avatar') ? 'transparent' : '#bfbfbf' }}
                                    />
                                )}
                            </Form.Item>
                            <Upload
                                customRequest={async ({ file, onSuccess, onError }) => {
                                    try {
                                        const url = await ApiClient.uploadImage(file as File);
                                        form.setFieldsValue({ avatar: url });
                                        message.success('头像上传成功');
                                        onSuccess?.(url);
                                    } catch (err) {
                                        message.error('头像上传失败');
                                        onError?.(err as Error);
                                    }
                                }}
                                showUploadList={false}
                            >
                                <Button icon={<UploadOutlined />}>更换头像</Button>
                            </Upload>
                        </div>
                    </Form.Item>

                    <div className="grid grid-cols-2 gap-4">
                        <Form.Item name="job_number" label="工号" rules={[{ required: true, message: '请输入工号' }]}>
                            <Input placeholder="输入工号 (例如: 1001)" />
                        </Form.Item>
                        <Form.Item name="account" label="账户" rules={[{ required: true, message: '请输入账户用户名' }]}>
                            <Input placeholder="输入账户 (例如: zhangsan)" />
                        </Form.Item>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
                            <Input />
                        </Form.Item>
                        <Form.Item name="gender" label="性别" rules={[{ required: true }]}>
                            <Select>
                                <Option value="男">男</Option>
                                <Option value="女">女</Option>
                            </Select>
                        </Form.Item>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Form.Item name="department" label="部门" rules={[{ required: true, message: '请输入部门' }]}>
                            <Input />
                        </Form.Item>
                        <Form.Item name="role" label="职位" rules={[{ required: true, message: '请输入职位' }]}>
                            <Input />
                        </Form.Item>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}>
                            <Input />
                        </Form.Item>
                        <Form.Item name="phone" label="手机号码" rules={[{ required: true, message: '请输入手机号码' }]}>
                            <Input />
                        </Form.Item>
                    </div>

                    <Form.Item name="location" label="办公地点">
                        <Input placeholder="例如: 杭州总部 A座 302" />
                    </Form.Item>

                </Form>
            </Modal>
        </div>
    );
};

export default EmployeeList;
