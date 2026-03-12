import React from 'react';
import Alert from 'antd/es/alert';
import Col from 'antd/es/grid/col';
import Input from 'antd/es/input';
import Row from 'antd/es/grid/row';
import Select from 'antd/es/select';
import { useTranslation } from 'react-i18next';
import type { FormInstance } from 'antd/es/form';

import { AppForm, AppModal } from '@/modules/admin/components/ui';

const { TextArea } = Input;

interface KnowledgeBaseFormValues {
    title: string;
    content: string;
    source_type: string;
    tags?: string;
    acl?: string;
}

interface KnowledgeBaseEditorModalProps {
    open: boolean;
    editingId: number | null;
    submitting: boolean;
    form: FormInstance<KnowledgeBaseFormValues>;
    onCancel: () => void;
    onSubmit: (values: KnowledgeBaseFormValues) => Promise<void> | void;
}

const KnowledgeBaseEditorModal: React.FC<KnowledgeBaseEditorModalProps> = ({
    open,
    editingId,
    submitting,
    form,
    onCancel,
    onSubmit,
}) => {
    const { t } = useTranslation();

    return (
        <AppModal
            title={editingId ? t('knowledgeBase.modal.editTitle') : t('knowledgeBase.modal.createTitle')}
            open={open}
            onOk={() => form.submit()}
            onCancel={onCancel}
            confirmLoading={submitting}
            okText={editingId ? t('knowledgeBase.modal.saveEdit') : t('knowledgeBase.modal.confirmCreate')}
            width={800}
        >
            <AppForm form={form} onFinish={onSubmit}>
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

                {editingId ? (
                    <Alert
                        type="warning"
                        showIcon
                        message={t('knowledgeBase.modal.reindexHint')}
                    />
                ) : null}
            </AppForm>
        </AppModal>
    );
};

export default KnowledgeBaseEditorModal;
