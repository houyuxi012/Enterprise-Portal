import React, { useEffect, useState } from 'react';
import { App, Card, Col, DatePicker, Input, Popconfirm, Row, Select, Space, Tooltip, TreeSelect, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { Todo, UserOption } from '@/types';
import TodoService, { CreateTodoDTO, UpdateTodoDTO } from '@/services/todos';
import ApiClient from '@/services/api';
import type { ColumnsType } from 'antd/es/table';
import {
    AppButton,
    AppTable,
    AppModal,
    AppForm,
    AppTag,
    AppPageHeader,
    AppFilterBar,
} from '@/modules/admin/components/ui';
import { useTranslation } from 'react-i18next';

const { Option } = Select;
const { TextArea } = Input;
const { Text } = Typography;

const UserSelect: React.FC<{ value?: number | number[]; onChange?: (val: any) => void; mode?: 'multiple'; placeholder: string }> = ({ value, onChange, mode, placeholder }) => {
    const [users, setUsers] = useState<UserOption[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const loadUsers = async () => {
            setLoading(true);
            try {
                const data = await ApiClient.getUserOptions();
                setUsers(data);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        loadUsers();
    }, []);

    return (
        <Select
            mode={mode}
            showSearch
            allowClear
            placeholder={placeholder}
            optionFilterProp="label"
            loading={loading}
            value={value}
            onChange={onChange}
            className="w-full"
            style={{ borderRadius: '8px' }}
        >
            {users.map((u) => (
                <Option key={u.id} value={u.id} label={`${u.name || ''} ${u.username}`}>
                    <Space size="small">
                        {u.name || u.username}
                        <Text type="secondary">({u.username})</Text>
                    </Space>
                </Option>
            ))}
        </Select>
    );
};

const DepartmentSelect: React.FC<{ value?: number | number[]; onChange?: (val: any) => void; mode?: 'multiple'; placeholder: string }> = ({ value, onChange, mode, placeholder }) => {
    const [departments, setDepartments] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const loadDepts = async () => {
            setLoading(true);
            try {
                const data = await ApiClient.getDepartments();
                setDepartments(data);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        loadDepts();
    }, []);

    const mapTreeData = (depts: any[]): any[] => {
        return depts.map((d) => ({
            title: d.name,
            value: d.id,
            key: d.id,
            children: d.children ? mapTreeData(d.children) : [],
        }));
    };

    return (
        <TreeSelect
            multiple={mode === 'multiple'}
            treeCheckable={mode === 'multiple'}
            showSearch
            allowClear
            placeholder={placeholder}
            treeNodeFilterProp="title"
            loading={loading}
            value={value}
            onChange={onChange}
            className="w-full"
            treeData={mapTreeData(departments)}
            style={{ borderRadius: '8px' }}
        />
    );
};

const AdminTodoList: React.FC = () => {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [todos, setTodos] = useState<Todo[]>([]);
    const [total, setTotal] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [form] = AppForm.useForm();
    const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
    const [assigneeUserFilter, setAssigneeUserFilter] = useState<number | undefined>(undefined);
    const [assigneeDeptFilter, setAssigneeDeptFilter] = useState<number | undefined>(undefined);

    const fetchTodos = async (page = 1, size = 10) => {
        setLoading(true);
        try {
            const data = await TodoService.getAllTasks({
                page,
                page_size: size,
                status: statusFilter,
                assignee_user_id: assigneeUserFilter,
                assignee_dept_id: assigneeDeptFilter,
            });
            setTodos(data.items);
            setTotal(data.total);
            setCurrentPage(data.page);
            setPageSize(data.page_size);
        } catch (error) {
            message.error(t('adminTodos.messages.loadFailed'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTodos(currentPage, pageSize);
    }, [statusFilter, assigneeUserFilter, assigneeDeptFilter]);

    const handleCreate = () => {
        setEditingTodo(null);
        form.resetFields();
        form.setFieldsValue({
            priority: 2,
            status: 'pending',
        });
        setIsModalOpen(true);
    };

    const handleEdit = (record: Todo) => {
        setEditingTodo(record);
        form.setFieldsValue({
            ...record,
            due_at: record.due_at ? dayjs(record.due_at) : undefined,
            priority: record.priority,
            assignee_user_ids: record.assigned_users?.map((u) => u.id) || [],
            assignee_dept_ids: record.assigned_departments?.map((d) => d.id) || [],
        });
        setIsModalOpen(true);
    };

    const handleDelete = async (id: number) => {
        try {
            await TodoService.adminDeleteTask(id);
            message.success(t('adminTodos.messages.deleteSuccess'));
            fetchTodos(currentPage, pageSize);
        } catch (error) {
            message.error(t('adminTodos.messages.deleteFailed'));
        }
    };

    const handleSubmit = async (values: any) => {
        try {
            setSubmitLoading(true);
            const payload: any = {
                title: values.title,
                description: values.description,
                status: values.status,
                priority: values.priority,
                assignee_user_ids: values.assignee_user_ids || [],
                assignee_dept_ids: values.assignee_dept_ids || [],
                due_at: values.due_at ? values.due_at.toISOString() : undefined,
            };

            if (editingTodo) {
                await TodoService.adminUpdateTask(editingTodo.id, payload as UpdateTodoDTO);
                message.success(t('adminTodos.messages.updateSuccess'));
            } else {
                await TodoService.adminCreateTask(payload as CreateTodoDTO);
                message.success(t('adminTodos.messages.createSuccess'));
            }
            setIsModalOpen(false);
            fetchTodos(currentPage, pageSize);
        } catch (error) {
            console.error(error);
            message.error(t('adminTodos.messages.operationFailed'));
        } finally {
            setSubmitLoading(false);
        }
    };

    const columns: ColumnsType<Todo> = [
        {
            title: t('adminTodos.table.id'),
            dataIndex: 'id',
            width: 60,
            render: (text: number) => <Text code>#{text}</Text>,
        },
        {
            title: t('adminTodos.table.title'),
            dataIndex: 'title',
            key: 'title',
            render: (text: string, record: Todo) => (
                <Space direction="vertical" size={2}>
                    <Text strong>{text}</Text>
                    {record.description && (
                        <Tooltip title={record.description}>
                            <Text type="secondary" ellipsis className="max-w-xs cursor-help">{record.description}</Text>
                        </Tooltip>
                    )}
                </Space>
            ),
        },
        {
            title: t('adminTodos.table.assignees'),
            key: 'assignees',
            render: (_: any, record: Todo) => (
                <Space size={[4, 4]} wrap>
                    {record.assigned_users?.map((u) => (
                        <AppTag key={`u-${u.id}`} status="processing">{u.name || u.username}</AppTag>
                    ))}
                    {record.assigned_departments?.map((d) => (
                        <AppTag key={`d-${d.id}`} status="warning">{d.name}</AppTag>
                    ))}
                    {(!record.assigned_users?.length && !record.assigned_departments?.length) && (
                        <Text type="secondary">{t('adminTodos.table.unassigned')}</Text>
                    )}
                </Space>
            ),
        },
        {
            title: t('adminTodos.table.creator'),
            dataIndex: 'creator_name',
            key: 'creator_name',
            render: (text: string) => <Text type="secondary">{text || t('adminTodos.table.system')}</Text>,
        },
        {
            title: t('adminTodos.table.priority'),
            dataIndex: 'priority',
            key: 'priority',
            width: 90,
            render: (priority: number) => {
                switch (priority) {
                    case 0:
                        return <AppTag status="error" className="animate-pulse font-bold">{t('adminTodos.table.priorityValues.emergency')}</AppTag>;
                    case 1:
                        return <AppTag status="error">{t('adminTodos.table.priorityValues.high')}</AppTag>;
                    case 2:
                        return <AppTag status="warning">{t('adminTodos.table.priorityValues.medium')}</AppTag>;
                    case 3:
                        return <AppTag status="success">{t('adminTodos.table.priorityValues.low')}</AppTag>;
                    default:
                        return <AppTag status="default">{t('adminTodos.table.priorityValues.unknown')}</AppTag>;
                }
            },
        },
        {
            title: t('adminTodos.table.dueAt'),
            dataIndex: 'due_at',
            key: 'due_at',
            width: 170,
            render: (date: string) => date ? <Text type="secondary">{dayjs(date).format('YYYY-MM-DD HH:mm')}</Text> : '-',
        },
        {
            title: t('adminTodos.table.status'),
            dataIndex: 'status',
            key: 'status',
            width: 110,
            render: (status: string) => {
                switch (status) {
                    case 'completed':
                        return <AppTag status="success">{t('adminTodos.filters.completed')}</AppTag>;
                    case 'in_progress':
                        return <AppTag status="processing">{t('adminTodos.filters.inProgress')}</AppTag>;
                    case 'canceled':
                        return <AppTag status="default">{t('adminTodos.filters.canceled')}</AppTag>;
                    default:
                        return <AppTag status="warning">{t('adminTodos.filters.pending')}</AppTag>;
                }
            },
        },
        {
            title: t('adminTodos.table.actions'),
            key: 'action',
            width: 160,
            render: (_: any, record: Todo) => (
                <Space size="small">
                    <AppButton intent="tertiary" size="sm" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
                        {t('adminTodos.buttons.edit')}
                    </AppButton>
                    <Popconfirm title={t('adminTodos.confirmDelete')} onConfirm={() => handleDelete(record.id)}>
                        <AppButton intent="danger" size="sm" icon={<DeleteOutlined />}>{t('adminTodos.buttons.delete')}</AppButton>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const statusOptions = [
        { value: 'pending', label: t('adminTodos.filters.pending') },
        { value: 'in_progress', label: t('adminTodos.filters.inProgress') },
        { value: 'completed', label: t('adminTodos.filters.completed') },
        { value: 'canceled', label: t('adminTodos.filters.canceled') },
    ];

    return (
        <div className="admin-page admin-page-spaced">
            <AppPageHeader
                title={t('adminTodos.title')}
                subtitle={t('adminTodos.subtitle')}
                action={
                    <AppButton intent="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                        {t('adminTodos.buttons.createTask')}
                    </AppButton>
                }
            />

            <AppFilterBar>
                <div className="w-full md:w-40">
                    <UserSelect value={assigneeUserFilter} onChange={setAssigneeUserFilter} placeholder={t('adminTodos.filters.userPlaceholder')} />
                </div>
                <div className="w-full md:w-40">
                    <DepartmentSelect value={assigneeDeptFilter} onChange={setAssigneeDeptFilter} placeholder={t('adminTodos.filters.deptPlaceholder')} />
                </div>
                <div className="w-full md:w-32">
                    <Select
                        placeholder={t('adminTodos.filters.statusPlaceholder')}
                        allowClear
                        className="w-full"
                        value={statusFilter}
                        onChange={setStatusFilter}
                        options={statusOptions}
                    />
                </div>
            </AppFilterBar>

            <Card className="admin-card overflow-hidden">
                <AppTable
                    columns={columns}
                    dataSource={todos}
                    rowKey="id"
                    loading={loading}
                    pagination={{
                        current: currentPage,
                        pageSize: pageSize,
                        total: total,
                        onChange: (page, size) => fetchTodos(page, size),
                        showSizeChanger: true,
                    }}
                    emptyText={t('adminTodos.table.empty')}
                />
            </Card>

            <AppModal
                title={editingTodo ? t('adminTodos.modal.editTitle') : t('adminTodos.modal.createTitle')}
                open={isModalOpen}
                onOk={() => form.submit()}
                onCancel={() => setIsModalOpen(false)}
                confirmLoading={submitLoading}
            >
                <AppForm form={form} onFinish={handleSubmit} layout="vertical">
                    <AppForm.Item name="title" label={t('adminTodos.modal.fields.title')} rules={[{ required: true, message: t('adminTodos.modal.validation.titleRequired') }]}>
                        <Input placeholder={t('adminTodos.modal.placeholders.title')} />
                    </AppForm.Item>

                    <Card size="small" className="admin-card-subtle">
                        <Row gutter={16}>
                            <Col span={12}>
                                <AppForm.Item name="assignee_user_ids" label={t('adminTodos.modal.fields.assigneeUsers')}>
                                    <UserSelect mode="multiple" placeholder={t('adminTodos.filters.userPlaceholder')} />
                                </AppForm.Item>
                            </Col>
                            <Col span={12}>
                                <AppForm.Item name="assignee_dept_ids" label={t('adminTodos.modal.fields.assigneeDepartments')}>
                                    <DepartmentSelect mode="multiple" placeholder={t('adminTodos.filters.deptPlaceholder')} />
                                </AppForm.Item>
                            </Col>
                        </Row>

                        <AppForm.Item name="description" label={t('adminTodos.modal.fields.description')}>
                            <TextArea rows={3} placeholder={t('adminTodos.modal.placeholders.description')} />
                        </AppForm.Item>

                        <Row gutter={16}>
                            <Col span={12}>
                                <AppForm.Item name="priority" label={t('adminTodos.modal.fields.priority')} initialValue={2}>
                                    <Select>
                                        <Option value={0}><AppTag status="error">{t('adminTodos.table.priorityValues.emergency')}</AppTag></Option>
                                        <Option value={1}><AppTag status="error">{t('adminTodos.table.priorityValues.high')}</AppTag></Option>
                                        <Option value={2}><AppTag status="warning">{t('adminTodos.table.priorityValues.medium')}</AppTag></Option>
                                        <Option value={3}><AppTag status="success">{t('adminTodos.table.priorityValues.low')}</AppTag></Option>
                                    </Select>
                                </AppForm.Item>
                            </Col>
                            <Col span={12}>
                                <AppForm.Item name="due_at" label={t('adminTodos.modal.fields.dueAt')}>
                                    <DatePicker showTime className="w-full" />
                                </AppForm.Item>
                            </Col>
                        </Row>

                        <AppForm.Item name="status" label={t('adminTodos.modal.fields.status')} initialValue="pending">
                            <Select options={statusOptions} />
                        </AppForm.Item>
                    </Card>
                </AppForm>
            </AppModal>
        </div>
    );
};

export default AdminTodoList;
