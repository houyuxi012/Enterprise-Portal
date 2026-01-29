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
                    <Avatar
                        src={record.avatar}
                        size={40}
                        icon={<UserOutlined />}
                        className="border border-slate-200 shadow-sm"
                    />
                    <div>
                        <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center">
                            {text}
                            <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded font-bold ${record.gender === '男' ? 'bg-blue-50 text-blue-500' : 'bg-rose-50 text-rose-500'}`}>
                                {record.gender}
                            </span>
                        </div>
                        <div className="text-xs text-slate-400 font-medium">#{record.job_number} · @{record.account}</div>
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
                    <div className="font-bold text-slate-700 dark:text-slate-300">{text}</div>
                    <div className="text-xs text-indigo-500 font-bold bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-md inline-block mt-0.5">{record.department}</div>
                </div>
            ),
        },
        {
            title: '联系方式',
            key: 'contact',
            render: (_: any, record: Employee) => (
                <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-600 dark:text-slate-400">{record.email}</div>
                    <div className="text-xs text-slate-400">{record.phone}</div>
                </div>
            ),
        },
        {
            title: '位置',
            dataIndex: 'location',
            key: 'location',
            render: (text: string) => <span className="text-xs font-bold text-slate-500">{text}</span>
        },
        {
            title: '操作',
            key: 'action',
            width: '15%',
            render: (_: any, record: Employee) => (
                <Space size="small">
                    <Button
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                        className="text-blue-600 hover:bg-blue-50 font-bold rounded-lg"
                    />
                    <Popconfirm title="确定重置密码为 123456 吗?" onConfirm={() => handleResetPassword(record.account)}>
                        <Button
                            type="text"
                            icon={<KeyOutlined />}
                            title="重置密码"
                            className="text-amber-500 hover:bg-amber-50 font-bold rounded-lg"
                        />
                    </Popconfirm>
                    <Popconfirm title="确定要删除吗?" onConfirm={() => handleDelete(record.id)}>
                        <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            className="hover:bg-red-50 font-bold rounded-lg"
                        />
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
        <div className="space-y-6 animate-in fade-in duration-700 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-6 min-h-full">
            {/* Header - Outside Card */}
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">员工档案管理</h2>
                    <p className="text-xs text-slate-400 font-bold mt-1">管理企业员工基本信息与职位</p>
                </div>
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={handleAddNew}
                    size="large"
                    className="rounded-xl px-6 bg-slate-900 hover:bg-slate-800 shadow-lg shadow-slate-900/20 border-0 h-10 font-bold transition-all hover:scale-105 active:scale-95"
                >
                    新增员工
                </Button>
            </div>

            {/* Content Card */}
            <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-8 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700/50">
                <div className="mb-8 flex space-x-4">
                    <Input
                        placeholder="搜索姓名或部门..."
                        prefix={<SearchOutlined className="text-slate-400" />}
                        onChange={e => setSearchText(e.target.value)}
                        className="w-full max-w-sm rounded-xl border-slate-200 bg-slate-50 hover:bg-white focus:bg-white transition-all h-10 font-medium"
                        size="large"
                    />
                </div>

                <Table
                    columns={columns}
                    dataSource={filteredData}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 8, className: 'font-bold' }}
                    className="ant-table-custom"
                />
            </div>

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
