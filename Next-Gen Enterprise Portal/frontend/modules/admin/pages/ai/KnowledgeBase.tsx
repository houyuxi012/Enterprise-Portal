import React, { useState, useEffect } from 'react';
import { App as AntApp, Input, Select, Popconfirm, Card, Row, Col, Statistic, Space, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
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
import ApiClient from '@/services/api';
import {
    AppButton,
    AppTable,
    AppModal,
    AppForm,
    AppPageHeader,
    AppFilterBar,
    AppTag,
} from '@/modules/admin/components/ui';
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

interface KnowledgeBaseFormValues {
    title: string;
    content: string;
    source_type: string;
    tags?: string;
    acl?: string;
}

const extractErrorDetail = (error: unknown): string | null => {
    if (!error || typeof error !== 'object') {
        return null;
    }
    const response = (error as { response?: { data?: { detail?: unknown } } }).response;
    const detail = response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) {
        return detail;
    }
    return null;
};

const sourceTypeMap: Record<string, string> = {
    text: 'text',
    md: 'markdown',
    pdf: 'pdfText',
};

const KnowledgeBase: React.FC = () => {
    const { message } = AntApp.useApp();
    const { t, i18n } = useTranslation();
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
            message.error(t('knowledgeBase.messages.loadDocumentsFailed'));
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
            content: t('knowledgeBase.modal.placeholders.loading'),
        });
        setModalOpen(true);

        ApiClient.getKBDocumentDetail(record.id).then(doc => {
            form.setFieldsValue({ content: doc.content || '' });
        }).catch(() => {
            message.error(t('knowledgeBase.messages.loadDocumentDetailFailed'));
            form.setFieldsValue({ content: '' });
        });
    };

    // ── CRUD ────────────────────────────────────────────────
    const handleSubmit = async (values: KnowledgeBaseFormValues) => {
        setSubmitting(true);
        try {
            const tags = (values.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean);
            const aclInput = values.acl || '';
            const acl = aclInput === '*' ? ['*'] : aclInput.split(',').map((entry) => entry.trim()).filter(Boolean);
            const payload = {
                title: values.title,
                content: values.content,
                source_type: values.source_type,
                tags,
                acl,
            };

            if (editingId) {
                await ApiClient.updateKBDocument(editingId, payload);
                message.success(t('knowledgeBase.messages.updateSuccess'));
            } else {
                await ApiClient.createKBDocument(payload);
                message.success(t('knowledgeBase.messages.createSuccess'));
            }
            resetAndCloseModal();
            fetchDocuments();
            fetchStats();
        } catch (error: unknown) {
            const detail = extractErrorDetail(error);
            message.error(
                detail ||
                (editingId ? t('knowledgeBase.messages.updateFailed') : t('knowledgeBase.messages.createFailed'))
            );
        }
        setSubmitting(false);
    };

    const handleDelete = async (id: number) => {
        try {
            await ApiClient.deleteKBDocument(id);
            message.success(t('knowledgeBase.messages.deleteSuccess'));
            fetchDocuments();
            fetchStats();
        } catch {
            message.error(t('knowledgeBase.messages.deleteFailed'));
        }
    };

    const handleReindex = async (id: number) => {
        try {
            await ApiClient.reindexKBDocument(id);
            message.success(t('knowledgeBase.messages.reindexSuccess'));
            fetchDocuments();
        } catch {
            message.error(t('knowledgeBase.messages.reindexFailed'));
        }
    };

    // ── Filter ──────────────────────────────────────────────
    const filteredDocuments = documents.filter(d =>
        d.title.toLowerCase().includes(textSearch.toLowerCase())
    );
    const dateLocale = i18n.resolvedLanguage === 'zh-CN' ? 'zh-CN' : 'en-US';

    // ── Status helpers ──────────────────────────────────────
    const statusConfig: Record<string, { label: string; status: 'success' | 'processing' | 'warning' | 'error' | 'default' }> = {
        ready: { label: t('knowledgeBase.status.indexed'), status: 'success' },
        indexed: { label: t('knowledgeBase.status.indexed'), status: 'success' },
        processing: { label: t('knowledgeBase.status.processing'), status: 'processing' },
        pending: { label: t('knowledgeBase.status.pending'), status: 'warning' },
        error: { label: t('knowledgeBase.status.failed'), status: 'error' },
        failed: { label: t('knowledgeBase.status.failed'), status: 'error' },
    };

    // ── Columns ─────────────────────────────────────────────
    const columns: ColumnsType<KBDocument> = [
        {
            title: t('knowledgeBase.table.document'),
            dataIndex: 'title',
            key: 'title',
            render: (text: string, record: KBDocument) => (
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <BookOpen size={14} className="text-indigo-400 flex-shrink-0" />
                        <span className="font-bold text-slate-700 dark:text-slate-200">{text}</span>
                        <span className="bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-[10px] font-semibold px-1.5 py-0.5 rounded">
                            {t(`knowledgeBase.sourceTypes.${sourceTypeMap[record.source_type] || record.source_type}`, {
                                defaultValue: record.source_type,
                            })}
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
            title: t('knowledgeBase.table.status'),
            dataIndex: 'status',
            key: 'status',
            width: 100,
            render: (status: string) => {
                const cfg = statusConfig[status] || { label: status, status: 'default' as const };
                return <AppTag status={cfg.status}>{cfg.label}</AppTag>;
            },
        },
        {
            title: t('knowledgeBase.table.chunks'),
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
            title: t('knowledgeBase.table.accessControl'),
            dataIndex: 'acl',
            key: 'acl',
            width: 120,
            render: (acl: string[]) => (
                acl.includes('*')
                    ? <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 text-xs font-bold px-2 py-0.5 rounded border border-blue-100 dark:border-blue-800">{t('knowledgeBase.table.publicAcl')}</span>
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
            title: t('knowledgeBase.table.createdAt'),
            dataIndex: 'created_at',
            key: 'created_at',
            width: 140,
            render: (date: string | null) => (
                <span className="text-slate-500 font-medium text-xs">
                    {date ? new Date(date).toLocaleDateString(dateLocale) : '-'}
                </span>
            ),
        },
        {
            title: t('knowledgeBase.table.actions'),
            key: 'action',
            width: 160,
            render: (_: unknown, record: KBDocument) => (
                <div className="flex gap-1">
                    <Tooltip title={t('knowledgeBase.table.edit')}>
                        <AppButton
                            intent="tertiary"
                            size="sm"
                            icon={<Edit size={14} />}
                            onClick={() => openEditModal(record)}
                        />
                    </Tooltip>
                    <Tooltip title={t('knowledgeBase.table.reindex')}>
                        <AppButton
                            intent="tertiary"
                            size="sm"
                            icon={<RefreshCw size={14} />}
                            onClick={() => handleReindex(record.id)}
                        />
                    </Tooltip>
                    <Popconfirm
                        title={t('knowledgeBase.confirm.deleteTitle')}
                        description={t('knowledgeBase.confirm.deleteDescription')}
                        onConfirm={() => handleDelete(record.id)}
                        okText={t('knowledgeBase.confirm.deleteConfirm')}
                        cancelText={t('knowledgeBase.confirm.deleteCancel')}
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
            title: t('knowledgeBase.stats.totalDocuments'),
            value: stats?.total_documents || 0,
            icon: <FileText size={20} />,
            color: 'text-indigo-500',
            bg: 'bg-indigo-50 dark:bg-indigo-900/30',
        },
        {
            title: t('knowledgeBase.stats.indexedChunks'),
            value: stats?.total_chunks || 0,
            icon: <Database size={20} />,
            color: 'text-emerald-500',
            bg: 'bg-emerald-50 dark:bg-emerald-900/30',
        },
        {
            title: t('knowledgeBase.stats.totalQueries'),
            value: stats?.total_queries || 0,
            icon: <Search size={20} />,
            color: 'text-amber-500',
            bg: 'bg-amber-50 dark:bg-amber-900/30',
        },
        {
            title: t('knowledgeBase.stats.strongHits'),
            value: stats?.strong_hits || 0,
            icon: <Zap size={20} />,
            color: 'text-green-500',
            bg: 'bg-green-50 dark:bg-green-900/30',
        },
        {
            title: t('knowledgeBase.stats.weakHits'),
            value: stats?.weak_hits || 0,
            icon: <BarChart3 size={20} />,
            color: 'text-orange-500',
            bg: 'bg-orange-50 dark:bg-orange-900/30',
        },
        {
            title: t('knowledgeBase.stats.misses'),
            value: stats?.misses || 0,
            icon: <AlertTriangle size={20} />,
            color: 'text-red-400',
            bg: 'bg-red-50 dark:bg-red-900/30',
        },
    ];

    return (
        <div className="admin-page p-6 bg-slate-50/50 dark:bg-slate-900/50 min-h-full -m-6">
            <AppPageHeader
                title={t('knowledgeBase.page.title')}
                subtitle={t('knowledgeBase.page.subtitle')}
                action={
                    <div className="flex gap-2">
                        <AppButton
                            intent="secondary"
                            icon={<RefreshCw size={16} />}
                            onClick={() => { fetchDocuments(); fetchStats(); }}
                        >
                            {t('common.buttons.refresh')}
                        </AppButton>
                        <AppButton
                            intent="primary"
                            icon={<Plus size={16} />}
                            onClick={openCreateModal}
                        >
                            {t('knowledgeBase.buttons.addDocument')}
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
                    placeholder={t('knowledgeBase.filters.searchPlaceholder')}
                    value={textSearch}
                    onChange={e => setTextSearch(e.target.value)}
                    onSearch={setTextSearch}
                />
                <AppFilterBar.Action>
                    <span className="text-xs text-slate-400">
                        {t('knowledgeBase.filters.documentCount', { count: filteredDocuments.length })}
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
                    emptyText={t('knowledgeBase.table.empty')}
                />
            </Card>

            {/* Create / Edit Modal */}
            <AppModal
                title={editingId ? t('knowledgeBase.modal.editTitle') : t('knowledgeBase.modal.createTitle')}
                open={modalOpen}
                onOk={() => form.submit()}
                onCancel={resetAndCloseModal}
                confirmLoading={submitting}
                okText={editingId ? t('knowledgeBase.modal.saveEdit') : t('knowledgeBase.modal.confirmCreate')}
                width={800}
            >
                <AppForm form={form} onFinish={handleSubmit}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                        <AppForm.Item
                            name="title"
                            label={t('knowledgeBase.modal.fields.title')}
                            rules={[{ required: true, message: t('knowledgeBase.modal.validation.titleRequired') }]}
                        >
                            <Input placeholder={t('knowledgeBase.modal.placeholders.title')} />
                        </AppForm.Item>

                        <AppForm.Item
                            name="source_type"
                            label={t('knowledgeBase.modal.fields.sourceType')}
                            rules={[{ required: true, message: t('knowledgeBase.modal.validation.sourceTypeRequired') }]}
                        >
                            <Select
                                options={[
                                    { value: 'text', label: t('knowledgeBase.sourceTypes.text') },
                                    { value: 'md', label: t('knowledgeBase.sourceTypes.markdown') },
                                    { value: 'pdf', label: t('knowledgeBase.sourceTypes.pdfText') },
                                ]}
                            />
                        </AppForm.Item>
                    </div>

                    <AppForm.Item
                        name="content"
                        label={t('knowledgeBase.modal.fields.content')}
                        rules={[{ required: true, message: t('knowledgeBase.modal.validation.contentRequired') }]}
                    >
                        <TextArea
                            rows={12}
                            placeholder={t('knowledgeBase.modal.placeholders.content')}
                            showCount
                        />
                    </AppForm.Item>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                        <AppForm.Item
                            name="tags"
                            label={t('knowledgeBase.modal.fields.tags')}
                            tooltip={t('knowledgeBase.modal.tooltips.tags')}
                        >
                            <Input placeholder={t('knowledgeBase.modal.placeholders.tags')} />
                        </AppForm.Item>

                        <AppForm.Item
                            name="acl"
                            label={t('knowledgeBase.modal.fields.acl')}
                            tooltip={t('knowledgeBase.modal.tooltips.acl')}
                        >
                            <Input placeholder={t('knowledgeBase.modal.placeholders.acl')} />
                        </AppForm.Item>
                    </div>

                    {editingId && (
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 mt-2">
                            <p className="text-xs text-amber-700 dark:text-amber-300 m-0">
                                {t('knowledgeBase.modal.reindexHint')}
                            </p>
                        </div>
                    )}
                </AppForm>
            </AppModal>
        </div>
    );
};

export default KnowledgeBase;
