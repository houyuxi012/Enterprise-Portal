import React, { useState, useEffect, useMemo } from 'react';
import { Input, Select, Avatar, Popconfirm, Upload, Card, Row, Col, Tree, Empty, App, Space } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined, UserOutlined, KeyOutlined, FolderOutlined, TeamOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { DataNode } from 'antd/es/tree';
import { Employee, Department } from '../../types';
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
    const { message, modal } = App.useApp();
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [deptTreeData, setDeptTreeData] = useState<DataNode[]>([]);
    const [selectedDeptName, setSelectedDeptName] = useState<string | null>(null);
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
    const [searchText, setSearchText] = useState('');
    const [form] = AppForm.useForm();
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [empData, deptData] = await Promise.all([
                ApiClient.getEmployees(),
                ApiClient.getDepartments()
            ]);
            setEmployees(empData);
            setDepartments(deptData);
            setDeptTreeData(buildTreeData(deptData));
        } catch (error) {
            console.error(error);
            message.error('加载数据失败');
        } finally {
            setLoading(false);
        }
    };

    const buildTreeData = (depts: Department[]): DataNode[] => {
        return depts.map(dept => ({
            title: (
                <div className="flex items-center gap-2 py-1">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{dept.name}</span>
                    <span className="text-xs text-slate-400">
                        ({countEmployeesInDept(dept.name, employees)})
                    </span>
                </div>
            ),
            key: dept.name, // Use name as key for easier filtering since Employee has dept name
            children: dept.children && dept.children.length > 0 ? buildTreeData(dept.children) : undefined,
        }));
    };

    // Helper to count employees in a department (recursive rough check or exact match?)
    // For now, strict match.
    const countEmployeesInDept = (deptName: string, allEmps: Employee[]) => {
        return allEmps.filter(e => e.department === deptName).length;
    };

    // Refresh tree counts when employees change
    useEffect(() => {
        if (departments.length > 0) {
            setDeptTreeData(buildTreeData(departments));
        }
    }, [employees, departments]);


    const handleDelete = async (id: any) => {
        try {
            await ApiClient.deleteEmployee(id);
            message.success('用户已删除');
            fetchData();
        } catch (error) {
            message.error('删除失败');
        }
    };

    const handleBatchDelete = () => {
        if (selectedRowKeys.length === 0) return;

        modal.confirm({
            title: `确定删除选中的 ${selectedRowKeys.length} 位用户吗？`,
            content: '此操作不可恢复。',
            okText: '确认删除',
            okButtonProps: { danger: true },
            cancelText: '取消',
            onOk: async () => {
                const hide = message.loading('正在删除...', 0);
                try {
                    await Promise.all(selectedRowKeys.map(id => ApiClient.deleteEmployee(id as number)));
                    hide();
                    message.success('批量删除成功');
                    setSelectedRowKeys([]);
                    fetchData();
                } catch (e) {
                    hide();
                    message.error('部分删除失败，请重试');
                }
            }
        });
    };

    const handleBatchResetPassword = () => {
        if (selectedRowKeys.length === 0) return;

        modal.confirm({
            title: `确定重置选中的 ${selectedRowKeys.length} 位用户的密码吗？`,
            content: '密码将被重置为默认密码 123456。',
            okText: '确认重置',
            cancelText: '取消',
            onOk: async () => {
                const hide = message.loading('正在重置...', 0);
                try {
                    // Need to find accounts for these IDs
                    const selectedEmps = employees.filter(e => selectedRowKeys.includes(e.id));
                    await Promise.all(selectedEmps.map(e => ApiClient.resetPassword(e.account)));
                    hide();
                    message.success('批量重置密码成功');
                    setSelectedRowKeys([]);
                } catch (e) {
                    hide();
                    message.error('重置失败');
                }
            }
        });
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
            department: selectedDeptName || '' // Pre-fill department if selected
        });
        setIsModalOpen(true);
    };

    const handleSubmit = async (values: any) => {
        setSubmitting(true);
        try {
            if (editingEmployee) {
                await ApiClient.updateEmployee(Number(editingEmployee.id), values);
                message.success('用户信息更新成功');
            } else {
                await ApiClient.createEmployee(values);
                message.success('用户创建成功');
            }
            setIsModalOpen(false);
            fetchData();
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
                </div>
            ),
        },
    ];

    const filteredData = useMemo(() => {
        return employees.filter(e => {
            const matchesSearch =
                e.name.toLowerCase().includes(searchText.toLowerCase()) ||
                e.department.toLowerCase().includes(searchText.toLowerCase()) ||
                e.account.toLowerCase().includes(searchText.toLowerCase());

            const matchesDept = selectedDeptName ? e.department === selectedDeptName : true;

            return matchesSearch && matchesDept;
        });
    }, [employees, searchText, selectedDeptName]);

    const rowSelection = {
        selectedRowKeys,
        onChange: (newSelectedRowKeys: React.Key[]) => {
            setSelectedRowKeys(newSelectedRowKeys);
        }
    };

    return (
        <div className="admin-page p-6 bg-slate-50/50 dark:bg-slate-900/50 min-h-full -m-6">
            {/* Page Header */}
            <AppPageHeader
                title="用户管理"
                subtitle="管理企业用户基本信息与职位"
                action={
                    <AppButton intent="primary" icon={<PlusOutlined />} onClick={handleAddNew}>
                        新增用户
                    </AppButton>
                }
            />

            <Row gutter={24}>
                {/* Left Sidebar: Department Tree */}
                <Col xs={24} lg={6}>
                    <Card
                        title={
                            <div className="flex items-center gap-2">
                                <TeamOutlined className="text-blue-500" />
                                <span>部门结构</span>
                            </div>
                        }
                        className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] h-full mb-6 lg:mb-0"
                        styles={{ body: { padding: '12px 0 12px 12px' } }}
                    >
                        <div className="max-h-[600px] overflow-y-auto pr-2">
                            {/* Global Filter Option */}


                            {deptTreeData.length > 0 ? (
                                <Tree
                                    treeData={deptTreeData}
                                    onSelect={(selectedKeys) => {
                                        if (selectedKeys.length > 0) {
                                            setSelectedDeptName(selectedKeys[0] as string);
                                        } else {
                                            setSelectedDeptName(null);
                                        }
                                    }}
                                    selectedKeys={selectedDeptName ? [selectedDeptName] : []}
                                    blockNode
                                    defaultExpandAll
                                />
                            ) : (
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无部门" />
                            )}
                        </div>
                    </Card>
                </Col>

                {/* Right Content: Filter & Table */}
                <Col xs={24} lg={18}>
                    {/* Filter Bar */}
                    <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] mb-4 p-1" styles={{ body: { padding: '12px 16px' } }}>
                        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                            <Input.Search
                                placeholder="搜索姓名、部门或工号..."
                                allowClear
                                style={{ maxWidth: 320 }}
                                value={searchText}
                                onChange={e => setSearchText(e.target.value)}
                            />

                            {/* Batch Actions */}
                            {selectedRowKeys.length > 0 && (
                                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
                                    <span className="text-sm text-slate-500 font-medium mr-2">
                                        已选 {selectedRowKeys.length} 项
                                    </span>
                                    <AppButton
                                        intent="secondary"
                                        size="sm"
                                        icon={<KeyOutlined />}
                                        onClick={handleBatchResetPassword}
                                    >
                                        重置密码
                                    </AppButton>
                                    <AppButton
                                        intent="danger"
                                        size="sm"
                                        icon={<DeleteOutlined />}
                                        onClick={handleBatchDelete}
                                    >
                                        删除
                                    </AppButton>
                                </div>
                            )}
                        </div>
                    </Card>

                    {/* Data Table */}
                    <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
                        <AppTable
                            rowSelection={rowSelection}
                            columns={columns}
                            dataSource={filteredData}
                            rowKey="id" // Employee ID is string in types, but number in backend? Need to be careful. Types say string.
                            loading={loading}
                            emptyText="暂无用户数据"
                            pageSize={10}
                        />
                    </Card>
                </Col>
            </Row>

            {/* Edit/Create Modal */}
            <AppModal
                title={editingEmployee ? '编辑用户' : '新增用户'}
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                onOk={() => form.submit()}
                confirmLoading={submitting}
                okText={editingEmployee ? '保存修改' : '创建用户'}
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
                            <Select
                                showSearch
                                placeholder="选择或输入部门"
                                optionFilterProp="children"
                            >
                                {/* Flatten departments to options or just use TreeSelect? Simple Select for now, mapping keys */}
                                {/* Assuming dept names are unique enough for simplified view, or just free text */}
                                {/* For simplicity, allowing free text input is good if dept not in tree. But let's provide options if possible. */}
                                {departments.map(d => (
                                    <Option key={d.id} value={d.name}>{d.name}</Option>
                                ))}
                                {/* Recursive flattening would be better but simple map works for 1-level, deep level not shown here */}
                            </Select>
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
