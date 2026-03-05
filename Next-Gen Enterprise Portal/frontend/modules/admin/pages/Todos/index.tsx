import React, { useEffect, useState } from 'react';
import { Input, Select, DatePicker, message, Row, Col, Popconfirm, Card, Tooltip, TreeSelect } from 'antd';
import { Plus, Trash2, Edit } from 'lucide-react';
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
} from '@/components/admin';
import { useTranslation } from 'react-i18next';

const { Option } = Select;
const { TextArea } = Input;

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
                    <div className="flex items-center gap-2">
                        {u.name || u.username}
                        <span className="text-xs text-slate-400">({u.username})</span>
                    </div>
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
            render: (text: number) => <span className="text-slate-400 font-mono">#{text}</span>,
        },
        {
            title: t('adminTodos.table.title'),
            dataIndex: 'title',
            key: 'title',
            render: (text: string, record: Todo) => (
                <div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">{text}</div>
                    {record.description && (
                        <Tooltip title={record.description}>
                            <div className="text-xs text-slate-500 truncate max-w-xs cursor-help">{record.description}</div>
                        </Tooltip>
                    )}
                </div>
            ),
        },
        {
            title: t('adminTodos.table.assignees'),
            key: 'assignees',
            render: (_: any, record: Todo) => (
                <div className="flex flex-wrap gap-1 w-48">
                    {record.assigned_users?.map((u) => (
                        <AppTag key={`u-${u.id}`} status="processing">{u.name || u.username}</AppTag>
                    ))}
                    {record.assigned_departments?.map((d) => (
                        <AppTag key={`d-${d.id}`} status="warning">{d.name}</AppTag>
                    ))}
                    {(!record.assigned_users?.length && !record.assigned_departments?.length) && (
                        <span className="text-slate-400 text-xs mt-1">{t('adminTodos.table.unassigned')}</span>
                    )}
                </div>
            ),
        },
        {
            title: t('adminTodos.table.creator'),
            dataIndex: 'creator_name',
            key: 'creator_name',
            render: (text: string) => <span className="text-xs text-slate-500">{text || t('adminTodos.table.system')}</span>,
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
            render: (date: string) => date ? <span className="text-xs font-bold text-slate-500">{dayjs(date).format('YYYY-MM-DD HH:mm')}</span> : '-',
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
                <div className="flex gap-2">
                    <AppButton intent="tertiary" size="sm" icon={<Edit size={14} />} onClick={() => handleEdit(record)}>
                        {t('adminTodos.buttons.edit')}
                    </AppButton>
                    <Popconfirm title={t('adminTodos.confirmDelete')} onConfirm={() => handleDelete(record.id)}>
                        <AppButton intent="danger" size="sm" icon={<Trash2 size={14} />}>{t('adminTodos.buttons.delete')}</AppButton>
                    </Popconfirm>
                </div>
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
        <div className="admin-page p-6 bg-slate-50/50 dark:bg-slate-900/50 min-h-full -m-6 animate-fade-in">
            <AppPageHeader
                title={t('adminTodos.title')}
                subtitle={t('adminTodos.subtitle')}
                action={
                    <div className="flex gap-3">
                        <div className="w-40 hidden sm:block">
                            <UserSelect value={assigneeUserFilter} onChange={setAssigneeUserFilter} placeholder={t('adminTodos.filters.userPlaceholder')} />
                        </div>
                        <div className="w-40 hidden sm:block">
                            <DepartmentSelect value={assigneeDeptFilter} onChange={setAssigneeDeptFilter} placeholder={t('adminTodos.filters.deptPlaceholder')} />
                        </div>
                        <div className="w-32 hidden sm:block">
                            <Select
                                placeholder={t('adminTodos.filters.statusPlaceholder')}
                                allowClear
                                className="w-full"
                                value={statusFilter}
                                onChange={setStatusFilter}
                                style={{ borderRadius: '8px' }}
                                options={statusOptions}
                            />
                        </div>
                        <AppButton intent="primary" icon={<Plus size={16} />} onClick={handleCreate}>
                            {t('adminTodos.buttons.createTask')}
                        </AppButton>
                    </div>
                }
            />

            <div className="sm:hidden mb-4 flex flex-col gap-2">
                <div className="flex gap-2 w-full">
                    <div className="w-1/2">
                        <UserSelect value={assigneeUserFilter} onChange={setAssigneeUserFilter} placeholder={t('adminTodos.filters.userPlaceholder')} />
                    </div>
                    <div className="w-1/2">
                        <DepartmentSelect value={assigneeDeptFilter} onChange={setAssigneeDeptFilter} placeholder={t('adminTodos.filters.deptPlaceholder')} />
                    </div>
                </div>
                <Select
                    placeholder={t('adminTodos.filters.statusPlaceholder')}
                    allowClear
                    className="w-full"
                    value={statusFilter}
                    onChange={setStatusFilter}
                    style={{ borderRadius: '8px' }}
                    options={statusOptions}
                />
            </div>

            <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
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
                                    <Option value={0}>
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-rose-600 animate-pulse"></div>
                                            <span className="font-bold text-rose-600">{t('adminTodos.table.priorityValues.emergency')}</span>
                                        </div>
                                    </Option>
                                    <Option value={1}>
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                            {t('adminTodos.table.priorityValues.high')}
                                        </div>
                                    </Option>
                                    <Option value={2}>
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                                            {t('adminTodos.table.priorityValues.medium')}
                                        </div>
                                    </Option>
                                    <Option value={3}>
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                            {t('adminTodos.table.priorityValues.low')}
                                        </div>
                                    </Option>
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
                </AppForm>
            </AppModal>
        </div>
    );
};

export default AdminTodoList;
