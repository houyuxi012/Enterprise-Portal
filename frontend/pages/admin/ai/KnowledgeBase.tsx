import React, { useState, useEffect } from 'react';
import { App as AntApp, Input, Select, Popconfirm, Card, Row, Col, Statistic, Space, Tooltip } from 'antd';
import {
    Plus,
    Edit,
    Trash2,
    RefreshCw,
    FileText,
    Database,
    Search,
    Zap,
    CheckCircle,
    Clock,
    AlertTriangle,
    BookOpen,
    BarChart3,
    Shield,
} from 'lucide-react';
import ApiClient from '../../../services/api';
import {
    AppButton,
    AppTable,
    AppModal,
    AppForm,
    AppPageHeader,
    AppFilterBar,
    AppTag,
} from '../../../components/admin';
import type { ColumnsType } from 'antd/es/table';

const { TextArea } = Input;

interface KBDocument {
    id: number;
    title: string;
    source_type: string;
    tags: string[];
    acl: string[];
    status: string;
    chunk_count: number;
    created_at: string | null;
}

interface KBStats {
    total_documents: number;
    total_chunks: number;
    total_queries: number;
    strong_hits: number;
    weak_hits: number;
    misses: number;
}

const sourceTypeLabel: Record<string, string> = {
    text: '纯文本',
    md: 'Markdown',
    pdf: 'PDF',
};

const KnowledgeBase: React.FC = () => {
    const { message } = AntApp.useApp();
    const [documents, setDocuments] = useState<KBDocument[]>([]);
    const [stats, setStats] = useState<KBStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [textSearch, setTextSearch] = useState('');

    // Form
    const [form] = AppForm.useForm();
    const [submitting, setSubmitting] = useState(false);

    const fetchDocuments = async () => {
        setLoading(true);
        try {
            const data = await ApiClient.getKBDocuments();
            setDocuments(data);
        } catch {
            message.error('获取文档列表失败');
        }
        setLoading(false);
    };

    const fetchStats = async () => {
        try {
            const data = await ApiClient.getKBStats();
            setStats(data);
        } catch {
            // stats is optional
        }
    };

    useEffect(() => {
        fetchDocuments();
        fetchStats();
    }, []);

    // ── Modal Helpers ───────────────────────────────────────
    const resetAndCloseModal = () => {
        setModalOpen(false);
        setEditingId(null);
        form.resetFields();
    };

    const openCreateModal = () => {
        setEditingId(null);
        form.resetFields();
        form.setFieldsValue({
            source_type: 'text',
            acl: '*',
        });
        setModalOpen(true);
    };

    const openEditModal = (record: KBDocument) => {
        setEditingId(record.id);
        form.setFieldsValue({
            title: record.title,
            source_type: record.source_type,
            tags: record.tags.join(','),
            acl: record.acl.join(','),
            content: '（加载中...）',
        });
        setModalOpen(true);

        ApiClient.getKBDocumentDetail(record.id).then(doc => {
            form.setFieldsValue({ content: doc.content || '' });
        }).catch(() => {
            message.error('获取文档详情失败，请手动填入内容');
            form.setFieldsValue({ content: '' });
        });
    };

    // ── CRUD ────────────────────────────────────────────────
    const handleSubmit = async (values: any) => {
        setSubmitting(true);
        try {
            const tags = values.tags ? values.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
            const acl = values.acl === '*' ? ['*'] : values.acl.split(',').map((a: string) => a.trim()).filter(Boolean);
            const payload = {
                title: values.title,
                content: values.content,
                source_type: values.source_type,
                tags,
                acl,
            };

            if (editingId) {
                await ApiClient.updateKBDocument(editingId, payload);
                message.success('文档更新成功');
            } else {
                await ApiClient.createKBDocument(payload);
                message.success('文档入库成功');
            }
            resetAndCloseModal();
            fetchDocuments();
            fetchStats();
        } catch (e: any) {
            message.error(e?.response?.data?.detail || (editingId ? '更新失败' : '入库失败'));
        }
        setSubmitting(false);
    };

    const handleDelete = async (id: number) => {
        try {
            await ApiClient.deleteKBDocument(id);
            message.success('文档已删除');
            fetchDocuments();
            fetchStats();
        } catch {
            message.error('删除失败');
        }
    };

    const handleReindex = async (id: number) => {
        try {
            await ApiClient.reindexKBDocument(id);
            message.success('重建索引成功');
            fetchDocuments();
        } catch {
            message.error('重建索引失败');
        }
    };

    // ── Filter ──────────────────────────────────────────────
    const filteredDocuments = documents.filter(d =>
        d.title.toLowerCase().includes(textSearch.toLowerCase())
    );

    // ── Status helpers ──────────────────────────────────────
    const statusConfig: Record<string, { label: string; status: 'success' | 'processing' | 'warning' | 'error' | 'default' }> = {
        ready: { label: '已索引', status: 'success' },
        indexed: { label: '已索引', status: 'success' },
        processing: { label: '处理中', status: 'processing' },
        pending: { label: '待处理', status: 'warning' },
        error: { label: '失败', status: 'error' },
        failed: { label: '失败', status: 'error' },
    };

    // ── Columns ─────────────────────────────────────────────
    const columns: ColumnsType<KBDocument> = [
        {
            title: '文档',
            dataIndex: 'title',
            key: 'title',
            render: (text: string, record: KBDocument) => (
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <BookOpen size={14} className="text-indigo-400 flex-shrink-0" />
                        <span className="font-bold text-slate-700 dark:text-slate-200">{text}</span>
                        <span className="bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-[10px] font-semibold px-1.5 py-0.5 rounded">
                            {sourceTypeLabel[record.source_type] || record.source_type}
                        </span>
                    </div>
                    {record.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 ml-5">
                            {record.tags.map(tag => (
                                <span
                                    key={tag}
                                    className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 text-[10px] font-bold px-1.5 py-0.5 rounded border border-indigo-100 dark:border-indigo-800"
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 100,
            render: (status: string) => {
                const cfg = statusConfig[status] || { label: status, status: 'default' as const };
                return <AppTag status={cfg.status}>{cfg.label}</AppTag>;
            },
        },
        {
            title: '分段',
            dataIndex: 'chunk_count',
            key: 'chunk_count',
            width: 80,
            align: 'center',
            render: (count: number) => (
                <span className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-bold text-xs px-2 py-0.5 rounded">
                    {count}
                </span>
            ),
        },
        {
            title: '权限',
            dataIndex: 'acl',
            key: 'acl',
            width: 120,
            render: (acl: string[]) => (
                acl.includes('*')
                    ? <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 text-xs font-bold px-2 py-0.5 rounded border border-blue-100 dark:border-blue-800">🌐 公开</span>
                    : <div className="flex flex-col gap-0.5">
                        {acl.map(r => (
                            <span key={r} className="text-slate-500 text-xs flex items-center gap-1">
                                <Shield size={10} /> {r}
                            </span>
                        ))}
                    </div>
            ),
        },
        {
            title: '创建时间',
            dataIndex: 'created_at',
            key: 'created_at',
            width: 140,
            render: (date: string | null) => (
                <span className="text-slate-500 font-medium text-xs">
                    {date ? new Date(date).toLocaleDateString('zh-CN') : '-'}
                </span>
            ),
        },
        {
            title: '操作',
            key: 'action',
            width: 160,
            render: (_: any, record: KBDocument) => (
                <div className="flex gap-1">
                    <Tooltip title="编辑">
                        <AppButton
                            intent="tertiary"
                            size="sm"
                            icon={<Edit size={14} />}
                            onClick={() => openEditModal(record)}
                        />
                    </Tooltip>
                    <Tooltip title="重建索引">
                        <AppButton
                            intent="tertiary"
                            size="sm"
                            icon={<RefreshCw size={14} />}
                            onClick={() => handleReindex(record.id)}
                        />
                    </Tooltip>
                    <Popconfirm
                        title="确定删除该文档？"
                        description="删除后不可恢复，文档内容和向量索引将一并移除。"
                        onConfirm={() => handleDelete(record.id)}
                        okText="确认删除"
                        cancelText="取消"
                    >
                        <AppButton intent="danger" size="sm" icon={<Trash2 size={14} />} />
                    </Popconfirm>
                </div>
            ),
        },
    ];

    // ── Stat Cards ──────────────────────────────────────────
    const statCards = [
        {
            title: '文档总数',
            value: stats?.total_documents || 0,
            icon: <FileText size={20} />,
            color: 'text-indigo-500',
            bg: 'bg-indigo-50 dark:bg-indigo-900/30',
        },
        {
            title: '索引分段',
            value: stats?.total_chunks || 0,
            icon: <Database size={20} />,
            color: 'text-emerald-500',
            bg: 'bg-emerald-50 dark:bg-emerald-900/30',
        },
        {
            title: '总检索次数',
            value: stats?.total_queries || 0,
            icon: <Search size={20} />,
            color: 'text-amber-500',
            bg: 'bg-amber-50 dark:bg-amber-900/30',
        },
        {
            title: '强命中',
            value: stats?.strong_hits || 0,
            icon: <Zap size={20} />,
            color: 'text-green-500',
            bg: 'bg-green-50 dark:bg-green-900/30',
        },
        {
            title: '弱命中',
            value: stats?.weak_hits || 0,
            icon: <BarChart3 size={20} />,
            color: 'text-orange-500',
            bg: 'bg-orange-50 dark:bg-orange-900/30',
        },
        {
            title: '未命中',
            value: stats?.misses || 0,
            icon: <AlertTriangle size={20} />,
            color: 'text-red-400',
            bg: 'bg-red-50 dark:bg-red-900/30',
        },
    ];

    return (
        <div className="admin-page p-6 bg-slate-50/50 dark:bg-slate-900/50 min-h-full -m-6">
            <AppPageHeader
                title="AI 知识库"
                subtitle="管理文档入库、向量索引与检索命中统计"
                action={
                    <div className="flex gap-2">
                        <AppButton
                            intent="secondary"
                            icon={<RefreshCw size={16} />}
                            onClick={() => { fetchDocuments(); fetchStats(); }}
                        >
                            刷新
                        </AppButton>
                        <AppButton
                            intent="primary"
                            icon={<Plus size={16} />}
                            onClick={openCreateModal}
                        >
                            入库文档
                        </AppButton>
                    </div>
                }
            />

            {/* Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                {statCards.map(card => (
                    <div
                        key={card.title}
                        className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 flex flex-col gap-2 shadow-[0_1px_8px_-3px_rgba(0,0,0,0.04)] hover:shadow-md transition-shadow"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                {card.title}
                            </span>
                            <div className={`${card.bg} ${card.color} p-1.5 rounded-lg`}>
                                {card.icon}
                            </div>
                        </div>
                        <span className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">
                            {card.value}
                        </span>
                    </div>
                ))}
            </div>

            {/* Filter Bar */}
            <AppFilterBar>
                <AppFilterBar.Search
                    placeholder="搜索文档标题..."
                    value={textSearch}
                    onChange={e => setTextSearch(e.target.value)}
                    onSearch={setTextSearch}
                />
                <AppFilterBar.Action>
                    <span className="text-xs text-slate-400">
                        共 {filteredDocuments.length} 篇文档
                    </span>
                </AppFilterBar.Action>
            </AppFilterBar>

            {/* Table */}
            <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
                <AppTable
                    columns={columns}
                    dataSource={filteredDocuments}
                    rowKey="id"
                    loading={loading}
                    emptyText="暂无知识库文档"
                />
            </Card>

            {/* Create / Edit Modal */}
            <AppModal
                title={editingId ? '编辑文档' : '入库新文档'}
                open={modalOpen}
                onOk={() => form.submit()}
                onCancel={resetAndCloseModal}
                confirmLoading={submitting}
                okText={editingId ? '保存修改' : '确认入库'}
                width={800}
            >
                <AppForm form={form} onFinish={handleSubmit}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                        <AppForm.Item
                            name="title"
                            label="文档标题"
                            rules={[{ required: true, message: '请输入文档标题' }]}
                        >
                            <Input placeholder="请输入文档标题" />
                        </AppForm.Item>

                        <AppForm.Item
                            name="source_type"
                            label="文档类型"
                            rules={[{ required: true, message: '请选择文档类型' }]}
                        >
                            <Select
                                options={[
                                    { value: 'text', label: '纯文本' },
                                    { value: 'md', label: 'Markdown' },
                                    { value: 'pdf', label: 'PDF（文本内容）' },
                                ]}
                            />
                        </AppForm.Item>
                    </div>

                    <AppForm.Item
                        name="content"
                        label="文档内容"
                        rules={[{ required: true, message: '请输入文档内容' }]}
                    >
                        <TextArea
                            rows={12}
                            placeholder="粘贴或输入文档内容..."
                            showCount
                        />
                    </AppForm.Item>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                        <AppForm.Item
                            name="tags"
                            label="标签"
                            tooltip="多个标签用逗号分隔"
                        >
                            <Input placeholder="如：制度,规范,技术" />
                        </AppForm.Item>

                        <AppForm.Item
                            name="acl"
                            label="访问控制 (ACL)"
                            tooltip="* 表示公开；也可指定 role:admin 或 user:1"
                        >
                            <Input placeholder="* 表示公开" />
                        </AppForm.Item>
                    </div>

                    {editingId && (
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 mt-2">
                            <p className="text-xs text-amber-700 dark:text-amber-300 m-0">
                                ⚠️ 保存修改后，系统将自动重新分段并重建向量索引，旧索引数据将被替换。
                            </p>
                        </div>
                    )}
                </AppForm>
            </AppModal>
        </div>
    );
};

export default KnowledgeBase;
