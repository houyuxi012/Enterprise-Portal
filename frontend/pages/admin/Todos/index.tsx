import React, { useEffect, useState } from 'react';
import { Input, Select, DatePicker, message, Row, Col, Popconfirm, Card, Tooltip } from 'antd';
import { Plus, Trash2, Edit } from 'lucide-react';
import dayjs from 'dayjs';
import { Todo, User, UserOption } from '../../../types';
import TodoService, { CreateTodoDTO, UpdateTodoDTO } from '../../../services/todos';
import ApiClient from '../../../services/api';
import type { ColumnsType } from 'antd/es/table';
import {
    AppButton,
    AppTable,
    AppModal,
    AppForm,
    AppTag,
    AppPageHeader,
} from '../../../components/admin';

const { Option } = Select;
const { TextArea } = Input;

// Helper to fetch users for assignment
const UserSelect: React.FC<{ value?: number; onChange?: (val: number) => void }> = ({ value, onChange }) => {
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
            showSearch
            placeholder="选择指派用户"
            optionFilterProp="label"
            loading={loading}
            value={value}
            onChange={onChange}
            className="w-full"
            style={{ borderRadius: '8px' }}
        >
            {users.map(u => (
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

const AdminTodoList: React.FC = () => {
    const [todos, setTodos] = useState<Todo[]>([]);
    const [total, setTotal] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [form] = AppForm.useForm();

    // Filters
    const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
    const [assigneeFilter, setAssigneeFilter] = useState<number | undefined>(undefined);

    const fetchTodos = async (page = 1, size = 10) => {
        setLoading(true);
        try {
            const data = await TodoService.getAllTasks({
                page,
                page_size: size,
                status: statusFilter,
                assignee_id: assigneeFilter
            });
            setTodos(data.items);
            setTotal(data.total);
            setCurrentPage(data.page);
            setPageSize(data.page_size);
        } catch (error) {
            message.error('加载任务失败');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTodos(currentPage, pageSize);
    }, [statusFilter, assigneeFilter]);

    const handleCreate = () => {
        setEditingTodo(null);
        form.resetFields();
        // Set default values
        form.setFieldsValue({
            priority: 2,
            status: 'pending'
        });
        setIsModalOpen(true);
    };

    const handleEdit = (record: Todo) => {
        setEditingTodo(record);
        form.setFieldsValue({
            ...record,
            due_at: record.due_at ? dayjs(record.due_at) : undefined,
            priority: record.priority
        });
        setIsModalOpen(true);
    };

    const handleDelete = async (id: number) => {
        try {
            await TodoService.adminDeleteTask(id);
            message.success('任务已删除');
            fetchTodos(currentPage, pageSize);
        } catch (error) {
            message.error('删除失败');
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
                assignee_id: values.assignee_id,
                due_at: values.due_at ? values.due_at.toISOString() : undefined,
            };

            if (editingTodo) {
                await TodoService.adminUpdateTask(editingTodo.id, payload as UpdateTodoDTO);
                message.success('任务更新成功');
            } else {
                await TodoService.adminCreateTask(payload as CreateTodoDTO);
                message.success('任务创建成功');
            }
            setIsModalOpen(false);
            fetchTodos(currentPage, pageSize);
        } catch (error) {
            console.error(error);
            message.error('操作失败');
        } finally {
            setSubmitLoading(false);
        }
    };

    const columns: ColumnsType<Todo> = [
        {
            title: 'ID',
            dataIndex: 'id',
            width: 60,
            render: (text: number) => <span className="text-slate-400 font-mono">#{text}</span>
        },
        {
            title: '标题',
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
            title: '指派给',
            dataIndex: 'assignee_name',
            key: 'assignee_name',
            render: (text: string) => <AppTag status="processing">{text || 'Unknown'}</AppTag>
        },
        {
            title: '创建者',
            dataIndex: 'creator_name',
            key: 'creator_name',
            render: (text: string) => <span className="text-xs text-slate-500">{text || 'System'}</span>
        },
        {
            title: '优先级',
            dataIndex: 'priority',
            key: 'priority',
            width: 80,
            render: (priority: number) => {
                switch (priority) {
                    case 0: return <AppTag status="error" className="animate-pulse font-bold">紧急</AppTag>;
                    case 1: return <AppTag status="error">高</AppTag>;
                    case 2: return <AppTag status="warning">中</AppTag>;
                    case 3: return <AppTag status="success">低</AppTag>;
                    default: return <AppTag status="default">未知</AppTag>;
                }
            },
        },
        {
            title: '截止时间',
            dataIndex: 'due_at',
            key: 'due_at',
            width: 150,
            render: (date: string) => date ? <span className="text-xs font-bold text-slate-500">{dayjs(date).format('YYYY-MM-DD HH:mm')}</span> : '-',
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 100,
            render: (status: string) => {
                switch (status) {
                    case 'completed': return <AppTag status="success">已完成</AppTag>;
                    case 'in_progress': return <AppTag status="processing">进行中</AppTag>;
                    case 'canceled': return <AppTag status="default">已取消</AppTag>;
                    default: return <AppTag status="warning">待处理</AppTag>;
                }
            },
        },
        {
            title: '操作',
            key: 'action',
            width: 140,
            render: (_: any, record: Todo) => (
                <div className="flex gap-2">
                    <AppButton intent="tertiary" size="sm" icon={<Edit size={14} />} onClick={() => handleEdit(record)}>
                        编辑
                    </AppButton>
                    <Popconfirm title="确定删除此任务?" onConfirm={() => handleDelete(record.id)}>
                        <AppButton intent="danger" size="sm" icon={<Trash2 size={14} />}>删除</AppButton>
                    </Popconfirm>
                </div>
            ),
        },
    ];

    return (
        <div className="admin-page p-6 bg-slate-50/50 dark:bg-slate-900/50 min-h-full -m-6 animate-fade-in">
            <AppPageHeader
                title="待办管理"
                subtitle="全员待办任务监控与调度"
                action={
                    <div className="flex gap-3">
                        <div className="w-48 hidden sm:block">
                            <UserSelect value={assigneeFilter} onChange={setAssigneeFilter} />
                        </div>
                        <div className="w-40 hidden sm:block">
                            <Select
                                placeholder="状态筛选"
                                allowClear
                                className="w-full"
                                value={statusFilter}
                                onChange={setStatusFilter}
                                style={{ borderRadius: '8px' }}
                            >
                                <Option value="pending">待处理</Option>
                                <Option value="in_progress">进行中</Option>
                                <Option value="completed">已完成</Option>
                                <Option value="canceled">已取消</Option>
                            </Select>
                        </div>
                        <AppButton intent="primary" icon={<Plus size={16} />} onClick={handleCreate}>
                            创建任务
                        </AppButton>
                    </div>
                }
            />

            {/* Mobile Filters (visible only on small screens) */}
            <div className="sm:hidden mb-4 flex gap-2">
                <div className="w-1/2">
                    <UserSelect value={assigneeFilter} onChange={setAssigneeFilter} />
                </div>
                <Select
                    placeholder="状态筛选"
                    allowClear
                    className="w-1/2"
                    value={statusFilter}
                    onChange={setStatusFilter}
                    style={{ borderRadius: '8px' }}
                >
                    <Option value="pending">待处理</Option>
                    <Option value="in_progress">进行中</Option>
                    <Option value="completed">已完成</Option>
                    <Option value="canceled">已取消</Option>
                </Select>
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
                    emptyText="暂无任务数据"
                />
            </Card>

            <AppModal
                title={editingTodo ? "编辑任务" : "创建任务"}
                open={isModalOpen}
                onOk={() => form.submit()}
                onCancel={() => setIsModalOpen(false)}
                confirmLoading={submitLoading}
            >
                <AppForm form={form} onFinish={handleSubmit} layout="vertical">
                    <AppForm.Item name="title" label="任务标题" rules={[{ required: true, message: '请输入标题' }]}>
                        <Input placeholder="任务名称" />
                    </AppForm.Item>

                    <AppForm.Item name="assignee_id" label="指派给" rules={[{ required: true, message: '请选择指派对象' }]}>
                        <UserSelect />
                    </AppForm.Item>

                    <AppForm.Item name="description" label="描述">
                        <TextArea rows={3} placeholder="任务详情..." />
                    </AppForm.Item>

                    <Row gutter={16}>
                        <Col span={12}>
                            <AppForm.Item name="priority" label="优先级" initialValue={2}>
                                <Select>
                                    <Option value={0}>
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-rose-600 animate-pulse"></div>
                                            <span className="font-bold text-rose-600">紧急</span>
                                        </div>
                                    </Option>
                                    <Option value={1}>
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                            高
                                        </div>
                                    </Option>
                                    <Option value={2}>
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                                            中
                                        </div>
                                    </Option>
                                    <Option value={3}>
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                            低
                                        </div>
                                    </Option>
                                </Select>
                            </AppForm.Item>
                        </Col>
                        <Col span={12}>
                            <AppForm.Item name="due_at" label="截止日期">
                                <DatePicker showTime className="w-full" />
                            </AppForm.Item>
                        </Col>
                    </Row>

                    <AppForm.Item name="status" label="状态" initialValue="pending">
                        <Select>
                            <Option value="pending">待处理</Option>
                            <Option value="in_progress">进行中</Option>
                            <Option value="completed">已完成</Option>
                            <Option value="canceled">已取消</Option>
                        </Select>
                    </AppForm.Item>
                </AppForm>
            </AppModal>
        </div>
    );
};

export default AdminTodoList;
