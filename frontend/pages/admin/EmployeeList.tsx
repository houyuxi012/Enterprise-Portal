import React, { useState, useEffect } from 'react';
import { Input, Select, Avatar, Popconfirm, message, Upload, Card } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined, UserOutlined, KeyOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { Employee } from '../../types';
import ApiClient from '../../services/api';
import {
    AppButton,
    AppTable,
    AppModal,
    AppForm,
    AppTag,
    AppPageHeader,
    AppFilterBar,
} from '../../components/admin';

const { Option } = Select;

const EmployeeList: React.FC = () => {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
    const [searchText, setSearchText] = useState('');
    const [form] = AppForm.useForm();
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

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
            message.error('加载员工数据失败');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: any) => {
        try {
            await ApiClient.deleteEmployee(id);
            message.success('员工已删除');
            fetchEmployees();
        } catch (error) {
            message.error('删除失败');
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
        form.setFieldsValue({ gender: '男' });
        setIsModalOpen(true);
    };

    const handleSubmit = async (values: any) => {
        setSubmitting(true);
        try {
            if (editingEmployee) {
                await ApiClient.updateEmployee(Number(editingEmployee.id), values);
                message.success('员工信息更新成功');
            } else {
                await ApiClient.createEmployee(values);
                message.success('员工创建成功');
            }
            setIsModalOpen(false);
            fetchEmployees();
        } catch (error) {
            message.error('保存失败');
        } finally {
            setSubmitting(false);
        }
    };

    const columns: ColumnsType<Employee> = [
        {
            title: '基本信息',
            dataIndex: 'name',
            key: 'name',
            render: (text: string, record: Employee) => (
                <div className="flex items-center gap-3">
                    <Avatar
                        src={record.avatar}
                        size={40}
                        icon={<UserOutlined />}
                        className="border border-slate-200"
                    />
                    <div>
                        <div className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                            {text}
                            <AppTag status={record.gender === '男' ? 'info' : 'error'}>
                                {record.gender}
                            </AppTag>
                        </div>
                        <div className="text-xs text-slate-400">
                            #{record.job_number} · @{record.account}
                        </div>
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
                    <div className="font-medium text-slate-700 dark:text-slate-300">{text}</div>
                    <AppTag status="info">{record.department}</AppTag>
                </div>
            ),
        },
        {
            title: '联系方式',
            key: 'contact',
            render: (_: any, record: Employee) => (
                <div className="space-y-0.5">
                    <div className="text-sm text-slate-600 dark:text-slate-400">{record.email}</div>
                    <div className="text-xs text-slate-400">{record.phone}</div>
                </div>
            ),
        },
        {
            title: '位置',
            dataIndex: 'location',
            key: 'location',
            render: (text: string) => (
                <span className="text-sm text-slate-500">{text || '-'}</span>
            ),
        },
        {
            title: '操作',
            key: 'action',
            width: 140,
            align: 'right',
            render: (_: any, record: Employee) => (
                <div className="flex justify-end gap-1">
                    <AppButton
                        intent="tertiary"
                        iconOnly
                        size="sm"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                        title="编辑"
                    />
                    <Popconfirm
                        title="重置密码"
                        description={`确定将 ${record.account} 的密码重置为 123456 吗？`}
                        onConfirm={() => handleResetPassword(record.account)}
                        okText="确定"
                        cancelText="取消"
                    >
                        <AppButton
                            intent="tertiary"
                            iconOnly
                            size="sm"
                            icon={<KeyOutlined />}
                            title="重置密码"
                        />
                    </Popconfirm>
                    <Popconfirm
                        title="删除员工"
                        description="确定要删除该员工吗？"
                        onConfirm={() => handleDelete(record.id)}
                        okText="删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                    >
                        <AppButton
                            intent="danger"
                            iconOnly
                            size="sm"
                            icon={<DeleteOutlined />}
                        />
                    </Popconfirm>
                </div>
            ),
        },
    ];

    const filteredData = employees.filter(e =>
        e.name.toLowerCase().includes(searchText.toLowerCase()) ||
        e.department.toLowerCase().includes(searchText.toLowerCase())
    );

    return (
        <div className="admin-page p-6 bg-slate-50/50 dark:bg-slate-900/50 min-h-full -m-6">
            {/* Page Header */}
            <AppPageHeader
                title="用户管理"
                subtitle="管理企业员工基本信息与职位"
                action={
                    <AppButton intent="primary" icon={<PlusOutlined />} onClick={handleAddNew}>
                        新增员工
                    </AppButton>
                }
            />

            {/* Filter Bar */}
            <AppFilterBar>
                <AppFilterBar.Search
                    placeholder="搜索姓名或部门..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    onSearch={setSearchText}
                />
            </AppFilterBar>

            {/* Data Table */}
            <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
                <AppTable
                    columns={columns}
                    dataSource={filteredData}
                    rowKey="id"
                    loading={loading}
                    emptyText="暂无员工数据"
                    pageSize={10}
                />
            </Card>

            {/* Edit/Create Modal */}
            <AppModal
                title={editingEmployee ? '编辑用户' : '新增用户'}
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                onOk={() => form.submit()}
                confirmLoading={submitting}
                okText={editingEmployee ? '保存修改' : '创建员工'}
                width={700}
            >
                <AppForm form={form} onFinish={handleSubmit} initialValues={{ gender: '男' }}>
                    {/* Avatar Upload */}
                    <AppForm.Item label="头像">
                        <div className="flex items-center gap-4">
                            <AppForm.Item name="avatar" noStyle>
                                <Input hidden />
                            </AppForm.Item>
                            <AppForm.Item shouldUpdate={(prev, curr) => prev.avatar !== curr.avatar} noStyle>
                                {() => (
                                    <Avatar
                                        size={64}
                                        src={form.getFieldValue('avatar')}
                                        icon={<UserOutlined />}
                                        style={{ backgroundColor: form.getFieldValue('avatar') ? 'transparent' : '#bfbfbf' }}
                                    />
                                )}
                            </AppForm.Item>
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
                                <AppButton intent="secondary" icon={<UploadOutlined />}>更换头像</AppButton>
                            </Upload>
                        </div>
                    </AppForm.Item>

                    <div className="grid grid-cols-2 gap-4">
                        <AppForm.Item
                            name="job_number"
                            label="工号"
                            rules={[{ required: true, message: '请输入工号' }]}
                        >
                            <Input placeholder="输入工号 (例如: 1001)" />
                        </AppForm.Item>
                        <AppForm.Item
                            name="account"
                            label="账户"
                            rules={[{ required: true, message: '请输入账户用户名' }]}
                        >
                            <Input placeholder="输入账户 (例如: zhangsan)" />
                        </AppForm.Item>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <AppForm.Item
                            name="name"
                            label="姓名"
                            rules={[{ required: true, message: '请输入姓名' }]}
                        >
                            <Input />
                        </AppForm.Item>
                        <AppForm.Item
                            name="gender"
                            label="性别"
                            rules={[{ required: true }]}
                        >
                            <Select>
                                <Option value="男">男</Option>
                                <Option value="女">女</Option>
                            </Select>
                        </AppForm.Item>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <AppForm.Item
                            name="department"
                            label="部门"
                            rules={[{ required: true, message: '请输入部门' }]}
                        >
                            <Input />
                        </AppForm.Item>
                        <AppForm.Item
                            name="role"
                            label="职位"
                            rules={[{ required: true, message: '请输入职位' }]}
                        >
                            <Input />
                        </AppForm.Item>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <AppForm.Item
                            name="email"
                            label="邮箱"
                            rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}
                        >
                            <Input />
                        </AppForm.Item>
                        <AppForm.Item
                            name="phone"
                            label="手机号码"
                            rules={[{ required: true, message: '请输入手机号码' }]}
                        >
                            <Input />
                        </AppForm.Item>
                    </div>

                    <AppForm.Item name="location" label="办公地点">
                        <Input placeholder="例如: 杭州总部 A座 302" />
                    </AppForm.Item>
                </AppForm>
            </AppModal>
        </div>
    );
};

export default EmployeeList;
