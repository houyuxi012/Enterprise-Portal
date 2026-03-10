import React, { useState, useEffect } from 'react';
import { Alert, App as AntApp, Card, Col, Input, Popconfirm, Row, Select, Space, Statistic, Tooltip, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import {
    BarChartOutlined,
    BookOutlined,
    DatabaseOutlined,
    DeleteOutlined,
    EditOutlined,
    FileTextOutlined,
    PlusOutlined,
    ReloadOutlined,
    SafetyCertificateOutlined,
    SearchOutlined,
    ThunderboltOutlined,
    WarningOutlined,
    } from '@ant-design/icons';
    import ApiClient from '@/services/api';
import type { KBDocumentSummary } from '@/services/api';
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
const { Text } = Typography;

type KBDocument = KBDocumentSummary;

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
                <Space direction="vertical" size={4}>
                    <Space size="small" wrap>
                        <BookOutlined />
                        <Text strong>{text}</Text>
                        <AppTag status="default">
                            {t(`knowledgeBase.sourceTypes.${sourceTypeMap[record.source_type] || record.source_type}`, {
                                defaultValue: record.source_type,
                            })}
                        </AppTag>
                    </Space>
                    {record.tags.length > 0 && (
                        <Space size={[4, 4]} wrap>
                            {record.tags.map(tag => (
                                <AppTag key={tag} status="info">{tag}</AppTag>
                            ))}
                        </Space>
                    )}
                </Space>
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
            render: (count: number) => <Text code>{count}</Text>,
        },
        {
            title: t('knowledgeBase.table.accessControl'),
            dataIndex: 'acl',
            key: 'acl',
            width: 120,
            render: (acl: string[]) => (
                acl.includes('*')
                    ? <AppTag status="info">{t('knowledgeBase.table.publicAcl')}</AppTag>
                    : <Space direction="vertical" size={2}>
                        {acl.map(r => (
                                <Space key={r} size="small">
                                <SafetyCertificateOutlined /> {r}
                            </Space>
                        ))}
                    </Space>
            ),
        },
        {
            title: t('knowledgeBase.table.createdAt'),
            dataIndex: 'created_at',
            key: 'created_at',
            width: 140,
            render: (date: string | null) => <Text type="secondary">{date ? new Date(date).toLocaleDateString(dateLocale) : '-'}</Text>,
        },
        {
            title: t('knowledgeBase.table.actions'),
            key: 'action',
            width: 160,
            render: (_: unknown, record: KBDocument) => (
                <Space size="small">
                    <Tooltip title={t('knowledgeBase.table.edit')}>
                        <AppButton
                            intent="tertiary"
                            size="sm"
                            icon={<EditOutlined />}
                            onClick={() => openEditModal(record)}
                        />
                    </Tooltip>
                    <Tooltip title={t('knowledgeBase.table.reindex')}>
                        <AppButton
                            intent="tertiary"
                            size="sm"
                            icon={<ReloadOutlined />}
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
                        <AppButton intent="danger" size="sm" icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    // ── Stat Cards ──────────────────────────────────────────
    const statCards = [
        {
            title: t('knowledgeBase.stats.totalDocuments'),
            value: stats?.total_documents || 0,
            icon: <FileTextOutlined />,
            color: '#1677ff',
        },
        {
            title: t('knowledgeBase.stats.indexedChunks'),
            value: stats?.total_chunks || 0,
            icon: <DatabaseOutlined />,
            color: '#52c41a',
        },
        {
            title: t('knowledgeBase.stats.totalQueries'),
            value: stats?.total_queries || 0,
            icon: <SearchOutlined />,
            color: '#faad14',
        },
        {
            title: t('knowledgeBase.stats.strongHits'),
            value: stats?.strong_hits || 0,
            icon: <ThunderboltOutlined />,
            color: '#52c41a',
        },
        {
            title: t('knowledgeBase.stats.weakHits'),
            value: stats?.weak_hits || 0,
            icon: <BarChartOutlined />,
            color: '#fa8c16',
        },
        {
            title: t('knowledgeBase.stats.misses'),
            value: stats?.misses || 0,
            icon: <WarningOutlined />,
            color: '#ff4d4f',
        },
    ];

    return (
        <div className="admin-page admin-page-spaced">
            <AppPageHeader
                title={t('knowledgeBase.page.title')}
                subtitle={t('knowledgeBase.page.subtitle')}
                action={
                    <Space size="small">
                        <AppButton
                            intent="secondary"
                            icon={<ReloadOutlined />}
                            onClick={() => { fetchDocuments(); fetchStats(); }}
                        >
                            {t('common.buttons.refresh')}
                        </AppButton>
                        <AppButton
                            intent="primary"
                            icon={<PlusOutlined />}
                            onClick={openCreateModal}
                        >
                            {t('knowledgeBase.buttons.addDocument')}
                        </AppButton>
                    </Space>
                }
            />

            <Row gutter={[12, 12]} className="mb-6">
                {statCards.map(card => (
                    <Col xs={24} sm={12} lg={8} xl={4} key={card.title}>
                    <Card
                        key={card.title}
                        className="admin-card"
                    >
                        <Statistic
                            title={card.title}
                            value={card.value}
                            prefix={card.icon}
                            valueStyle={{ color: card.color }}
                        />
                    </Card>
                    </Col>
                ))}
            </Row>

            {/* Filter Bar */}
            <AppFilterBar>
                <AppFilterBar.Search
                    placeholder={t('knowledgeBase.filters.searchPlaceholder')}
                    value={textSearch}
                    onChange={e => setTextSearch(e.target.value)}
                    onSearch={setTextSearch}
                />
                <AppFilterBar.Action>
                    <Text type="secondary">
                        {t('knowledgeBase.filters.documentCount', { count: filteredDocuments.length })}
                    </Text>
                </AppFilterBar.Action>
            </AppFilterBar>

            {/* Table */}
            <Card className="admin-card overflow-hidden">
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
                    <Row gutter={16}>
                        <Col xs={24} md={12}>
                            <AppForm.Item
                                name="title"
                                label={t('knowledgeBase.modal.fields.title')}
                                rules={[{ required: true, message: t('knowledgeBase.modal.validation.titleRequired') }]}
                            >
                                <Input placeholder={t('knowledgeBase.modal.placeholders.title')} />
                            </AppForm.Item>
                        </Col>

                        <Col xs={24} md={12}>
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
                        </Col>
                    </Row>

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

                    <Row gutter={16}>
                        <Col xs={24} md={12}>
                            <AppForm.Item
                                name="tags"
                                label={t('knowledgeBase.modal.fields.tags')}
                                tooltip={t('knowledgeBase.modal.tooltips.tags')}
                            >
                                <Input placeholder={t('knowledgeBase.modal.placeholders.tags')} />
                            </AppForm.Item>
                        </Col>

                        <Col xs={24} md={12}>
                            <AppForm.Item
                                name="acl"
                                label={t('knowledgeBase.modal.fields.acl')}
                                tooltip={t('knowledgeBase.modal.tooltips.acl')}
                            >
                                <Input placeholder={t('knowledgeBase.modal.placeholders.acl')} />
                            </AppForm.Item>
                        </Col>
                    </Row>

                    {editingId && (
                        <Alert
                            type="warning"
                            showIcon
                            message={t('knowledgeBase.modal.reindexHint')}
                        />
                    )}
                </AppForm>
            </AppModal>
        </div>
    );
};

export default KnowledgeBase;
