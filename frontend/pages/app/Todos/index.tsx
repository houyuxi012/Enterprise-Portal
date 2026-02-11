import React, { useEffect, useState, useMemo } from 'react';
import { Button, Modal, Form, Input, Select, DatePicker, message, Row, Col, Popconfirm, Tooltip, Pagination } from 'antd';
import { CheckCircle, Clock, Plus, Trash2, Edit2 } from 'lucide-react';
import dayjs from 'dayjs';
import { Todo } from '../../../types';
import TodoService, { CreateTodoDTO, UpdateTodoDTO } from '../../../services/todos';

const { Option } = Select;
const { TextArea } = Input;

const TodoList: React.FC = () => {
    const [todos, setTodos] = useState<Todo[]>([]);
    const [total, setTotal] = useState(0);
    const [taskStats, setTaskStats] = useState({
        total: 0,
        emergency: 0,
        high: 0,
        medium: 0,
        low: 0,
        unclassified: 0,
        pending: 0,
        in_progress: 0,
        completed: 0,
        canceled: 0,
    });
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [loading, setLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
    const [form] = Form.useForm();
    const [activeFilter, setActiveFilter] = useState('all');

    const fetchTodos = async (page = 1, size = 10, status = activeFilter) => {
        setLoading(true);
        try {
            const queryStatus = status === 'all' ? undefined : status;
            const [data, stats] = await Promise.all([
                TodoService.getMyTasks({ page, page_size: size, status: queryStatus }),
                TodoService.getMyTaskStats('all'),
            ]);
            setTodos(data.items);
            setTotal(data.total);
            setCurrentPage(data.page);
            setPageSize(data.page_size);
            setTaskStats({
                total: stats.total,
                emergency: stats.emergency,
                high: stats.high,
                medium: stats.medium,
                low: stats.low,
                unclassified: stats.unclassified,
                pending: stats.pending,
                in_progress: stats.in_progress,
                completed: stats.completed,
                canceled: stats.canceled,
            });
        } catch (error) {
            message.error('加载任务失败');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTodos(currentPage, pageSize, activeFilter);
    }, [currentPage, activeFilter]);

    const handleFilterChange = (filterId: string) => {
        setActiveFilter(filterId);
        setCurrentPage(1); // Reset to page 1 on filter change
    };

    const handleCreate = () => {
        setEditingTodo(null);
        form.resetFields();
        setIsModalVisible(true);
    };

    const handleEdit = (record: Todo) => {
        setEditingTodo(record);
        form.setFieldsValue({
            ...record,
            due_at: record.due_at ? dayjs(record.due_at) : undefined,
        });
        setIsModalVisible(true);
    };

    // State Actions
    const handleComplete = async (id: number) => {
        try {
            await TodoService.completeTask(id);
            message.success('任务已完成');
            fetchTodos(currentPage, pageSize, activeFilter);
        } catch (error) {
            message.error('操作失败');
        }
    };

    const handleReopen = async (id: number) => {
        try {
            await TodoService.reopenTask(id);
            message.success('任务已重开');
            fetchTodos(currentPage, pageSize, activeFilter);
        } catch (error) {
            message.error('操作失败');
        }
    };

    const handleCancel = async (id: number) => {
        try {
            await TodoService.cancelTask(id);
            message.success('任务已取消');
            fetchTodos(currentPage, pageSize, activeFilter);
        } catch (error) {
            message.error('操作失败');
        }
    };

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            const payload: any = {
                title: values.title,
                description: values.description,
                priority: values.priority, // number
                due_at: values.due_at ? values.due_at.toISOString() : undefined,
            };

            if (editingTodo) {
                await TodoService.updateTask(editingTodo.id, payload as UpdateTodoDTO);
                message.success('任务更新成功');
            } else {
                await TodoService.createTask(payload as CreateTodoDTO);
                message.success('任务创建成功');
            }
            setIsModalVisible(false);
            fetchTodos(currentPage, pageSize, activeFilter);
        } catch (error) {
            console.error(error);
            message.error('操作失败');
        }
    };

    // Calculated Progress
    const completionRate = useMemo(() => {
        if (taskStats.total === 0) return 0;
        return Math.round((taskStats.completed / taskStats.total) * 100);
    }, [taskStats]);

    const filters = [
        { id: 'all', label: '全部', count: taskStats.total },
        { id: 'pending', label: '待处理', count: taskStats.pending },
        { id: 'in_progress', label: '进行中', count: taskStats.in_progress },
        { id: 'completed', label: '已完成', count: taskStats.completed },
    ];

    const getPriorityBadge = (priority: number) => {
        const config: Record<number, { color: string, bg: string, label: string }> = {
            0: { color: 'text-rose-600', bg: 'bg-rose-50', label: '紧急' },
            1: { color: 'text-red-500', bg: 'bg-red-50', label: '高优先级' },
            2: { color: 'text-orange-500', bg: 'bg-orange-50', label: '中优先级' },
            3: { color: 'text-emerald-500', bg: 'bg-emerald-50', label: '低优先级' },
        };
        const style = config[priority] || config[3];
        return (
            <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${style.color} ${style.bg}`}>
                {style.label}
            </span>
        );
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-700 slide-in-from-bottom-8 min-h-[80vh]">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white mb-1">待办管理</h1>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Smart Task Orchestrator</p>
                </div>

                {/* Progress Widget */}
                <div className="mica px-6 py-3 rounded-[2rem] flex items-center gap-6 shadow-xl border border-white/50 bg-white/40 dark:bg-slate-800/40 backdrop-blur-md">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">完成进度</p>
                        <p className="text-3xl font-black text-blue-600 dark:text-blue-400">{completionRate}%</p>
                    </div>
                    <div className="relative w-12 h-12 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-blue-100 dark:text-blue-900/30" />
                            <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="4" fill="transparent" strokeDasharray={126} strokeDashoffset={126 - (126 * completionRate) / 100} className="text-blue-600 dark:text-blue-400 transition-all duration-1000 ease-out" strokeLinecap="round" />
                        </svg>
                        <CheckCircle size={16} className="absolute text-blue-600 dark:text-blue-400" />
                    </div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="w-full md:w-auto space-y-3">
                    {/* Filter Pills */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
                        {filters.map(filter => (
                            <button
                                key={filter.id}
                                onClick={() => handleFilterChange(filter.id)}
                                className={`px-6 py-2.5 rounded-full text-xs font-bold transition-all duration-200 flex items-center gap-2 whitespace-nowrap flex-shrink-0 ${activeFilter === filter.id
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white dark:bg-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'
                                    }`}
                            >
                                {filter.label}
                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${activeFilter === filter.id ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-900 text-slate-400'
                                    }`}>
                                    {filter.count}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                <Button
                    type="primary"
                    icon={<Plus size={18} />}
                    onClick={handleCreate}
                    className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 h-12 px-8 rounded-full font-bold shadow-xl transition-all hover:scale-105 border-none flex-shrink-0 w-full md:w-auto flex items-center justify-center"
                >
                    新建任务
                </Button>
            </div>

            {/* Task List */}
            <div className="space-y-4">
                {loading ? (
                    <div className="text-center py-20 text-slate-400">加载中...</div>
                ) : todos.length === 0 ? (
                    <div className="text-center py-32 text-slate-400 font-bold bg-slate-50/50 dark:bg-slate-800/30 rounded-[2.5rem] border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center gap-4 animate-in fade-in zoom-in duration-500">
                        <div className="w-20 h-20 bg-white dark:bg-slate-800 rounded-2xl shadow-sm flex items-center justify-center mb-2">
                            <div className="text-slate-300 dark:text-slate-600">
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                </svg>
                            </div>
                        </div>
                        <p className="text-slate-400 dark:text-slate-500">
                            {filters.find(f => f.id === activeFilter)?.label} 分类下暂无任务
                        </p>
                    </div>
                ) : (
                    <>
                        {todos.map(todo => (
                            <div
                                key={todo.id}
                                className={`group bg-white dark:bg-slate-800 rounded-[2rem] p-5 flex items-center gap-6 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border border-slate-50 dark:border-slate-700/50 ${todo.status === 'completed' ? 'opacity-60 grayscale' : ''
                                    }`}
                            >
                                {/* Checkbox / Status */}
                                <button
                                    onClick={() => todo.status === 'completed' ? handleReopen(todo.id) : handleComplete(todo.id)}
                                    className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all duration-300 flex-shrink-0 ${todo.status === 'completed'
                                        ? 'bg-emerald-500 border-emerald-500 text-white'
                                        : 'border-slate-100 dark:border-slate-700 text-slate-300 hover:border-blue-500 hover:text-blue-500'
                                        }`}
                                >
                                    <CheckCircle size={24} className={todo.status === 'completed' ? 'animate-in zoom-in spin-in-180 duration-500' : ''} weight={todo.status === 'completed' ? "fill" : "regular"} />
                                </button>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                                        {getPriorityBadge(todo.priority)}
                                        <h3 className={`text-lg font-black text-slate-900 dark:text-white truncate ${todo.status === 'completed' ? 'line-through decoration-slate-300' : ''}`}>
                                            {todo.title}
                                        </h3>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs font-bold text-slate-400 mt-1">
                                        {todo.due_at && (
                                            <div className="flex items-center gap-1.5 flex-shrink-0 text-slate-400">
                                                <Clock size={14} />
                                                <span>
                                                    {dayjs(todo.due_at).format('YYYY-MM-DD HH:mm')}
                                                </span>
                                            </div>
                                        )}
                                        {todo.due_at && todo.description && (
                                            <div className="w-px h-3 bg-slate-200 dark:bg-slate-700 mx-1"></div>
                                        )}
                                        {todo.description && (
                                            <span className="truncate max-w-md hidden sm:block font-medium text-slate-500">
                                                {todo.description}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                    <Tooltip title="编辑">
                                        <button
                                            onClick={() => handleEdit(todo)}
                                            className="w-10 h-10 rounded-full bg-slate-50 dark:bg-slate-700/50 text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors flex items-center justify-center"
                                        >
                                            <Edit2 size={18} />
                                        </button>
                                    </Tooltip>

                                    {todo.status !== 'completed' && (
                                        <Tooltip title="取消任务">
                                            <Popconfirm title="确定取消此任务?" onConfirm={() => handleCancel(todo.id)}>
                                                <button className="w-10 h-10 rounded-full bg-slate-50 dark:bg-slate-700/50 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors flex items-center justify-center">
                                                    <Trash2 size={18} />
                                                </button>
                                            </Popconfirm>
                                        </Tooltip>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* Pagination */}
                        <div className="flex justify-center pt-8 pb-4">
                            <Pagination
                                current={currentPage}
                                pageSize={pageSize}
                                total={total}
                                onChange={(page, size) => {
                                    setCurrentPage(page);
                                    setPageSize(size);
                                }}
                                showSizeChanger={false}
                                hideOnSinglePage
                            />
                        </div>
                    </>
                )}
            </div>

            <Modal
                title={
                    <div className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">
                        {editingTodo ? "编辑任务" : "新建任务"}
                    </div>
                }
                open={isModalVisible}
                onOk={handleOk}
                onCancel={() => setIsModalVisible(false)}
                okText="保存"
                cancelText="取消"
                width={600}
                className="mica-modal"
                styles={{
                    content: {
                        borderRadius: '2rem',
                        padding: '2rem',
                        background: 'rgba(255, 255, 255, 0.9)',
                        backdropFilter: 'blur(20px)',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        border: '1px solid rgba(255, 255, 255, 0.3)'
                    },
                    header: {
                        background: 'transparent',
                        marginBottom: '1.5rem'
                    }
                }}
            >
                <Form form={form} layout="vertical" className="mt-4 space-y-4">
                    <Form.Item name="title" label={<span className="font-bold text-slate-700 dark:text-slate-300">任务标题</span>} rules={[{ required: true, message: '请输入标题' }]}>
                        <Input placeholder="输入清晰的任务名称..." className="h-12 rounded-2xl bg-slate-50 border-slate-200 focus:bg-white transition-all px-4 font-bold" />
                    </Form.Item>

                    <Form.Item name="description" label={<span className="font-bold text-slate-700 dark:text-slate-300">任务描述</span>}>
                        <TextArea rows={4} placeholder="添加详细描述..." className="rounded-2xl bg-slate-50 border-slate-200 focus:bg-white transition-all p-4 font-medium" />
                    </Form.Item>

                    <Row gutter={24}>
                        <Col span={12}>
                            <Form.Item name="priority" label={<span className="font-bold text-slate-700 dark:text-slate-300">优先级</span>} initialValue={2}>
                                <Select className="h-12 rounded-2xl" popupClassName="rounded-xl font-bold">
                                    <Option value={0}><div className="flex items-center space-x-2"><span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse"></span><span className="font-bold text-rose-600">紧急</span></div></Option>
                                    <Option value={1}><div className="flex items-center space-x-2"><span className="w-2 h-2 rounded-full bg-red-500"></span><span className="font-bold text-red-500">高优先级</span></div></Option>
                                    <Option value={2}><div className="flex items-center space-x-2"><span className="w-2 h-2 rounded-full bg-orange-500"></span><span className="font-bold text-orange-500">中优先级</span></div></Option>
                                    <Option value={3}><div className="flex items-center space-x-2"><span className="w-2 h-2 rounded-full bg-emerald-500"></span><span className="font-bold text-emerald-500">低优先级</span></div></Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="due_at" label={<span className="font-bold text-slate-700 dark:text-slate-300">截止时间</span>}>
                                <DatePicker showTime className="w-full h-12 rounded-2xl bg-slate-50 border-slate-200 font-bold" popupClassName="rounded-xl" />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>
        </div>
    );
};

export default TodoList;
