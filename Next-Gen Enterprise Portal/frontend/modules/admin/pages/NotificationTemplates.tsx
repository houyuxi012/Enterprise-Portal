import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import {
  ApiOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  MailOutlined,
  MessageOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';

import { AppButton, AppPageHeader } from '@/modules/admin/components/ui';
import notificationTemplateService, {
  NOTIFICATION_TEMPLATE_ACTIVE_CATEGORY_STORAGE_KEY,
  type NotificationTemplateFormInput,
  type NotificationTemplatePreviewInput,
  type NotificationTemplatePreviewResult,
  type NotificationTemplateRecord,
} from '@/modules/admin/services/notificationTemplates';
import type {
  NotificationTemplateCategory,
  NotificationTemplateI18nMap,
  NotificationTemplateLocale,
} from '@/shared/services/api';

const { Paragraph, Text, Title } = Typography;
const categoryOrder: NotificationTemplateCategory[] = ['email', 'sms', 'im'];
const templateLocales: NotificationTemplateLocale[] = ['zh-CN', 'en-US'];
const PLACEHOLDER_RE = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
const VARIABLE_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

type TemplateFormValues = NotificationTemplateFormInput;
type TemplateDiagnostics = {
  declaredVariables: string[];
  placeholderVariables: string[];
  invalidDeclaredVariables: string[];
  missingDeclaredVariables: string[];
  unusedDeclaredVariables: string[];
};

type ApiErrorShape = {
  response?: {
    data?: {
      detail?: string | { message?: string };
      message?: string;
    };
  };
  message?: string;
};

const categoryIconMap: Record<NotificationTemplateCategory, React.ReactNode> = {
  email: <MailOutlined className="text-sky-600" />,
  sms: <MessageOutlined className="text-amber-600" />,
  im: <ApiOutlined className="text-emerald-600" />,
};

const normalizeTemplateLocale = (locale: string | undefined): NotificationTemplateLocale => (
  String(locale || '').toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN'
);

const normalizeTemplateI18nMap = (value: NotificationTemplateI18nMap | undefined): NotificationTemplateI18nMap => {
  const normalized: NotificationTemplateI18nMap = {};
  templateLocales.forEach((locale) => {
    const nextValue = String(value?.[locale] || '').trim();
    if (nextValue) {
      normalized[locale] = nextValue;
    }
  });
  return normalized;
};

const getLocalizedTemplateText = (
  fallbackValue: string | null | undefined,
  i18nMap: NotificationTemplateI18nMap | undefined,
  locale: NotificationTemplateLocale,
): string => {
  const localized = normalizeTemplateI18nMap(i18nMap)[locale];
  if (localized) {
    return localized;
  }
  return String(fallbackValue || '').trim();
};

const renderTemplateContentLines = (content: string, maxLines?: number): React.ReactNode => {
  const allLines = String(content || '').split(/\r?\n/);
  const lines = typeof maxLines === 'number' && maxLines > 0 ? allLines.slice(0, maxLines) : allLines;
  return (
    <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {lines.map((line, index) => (
        <div
          key={`${index}-${line}`}
          className={[
            'grid grid-cols-[40px,1fr] gap-3 px-4 py-2 text-sm',
            index !== lines.length - 1 ? 'border-b border-slate-100' : '',
          ].join(' ')}
        >
          <div className="select-none text-right font-mono text-xs text-slate-400">{index + 1}</div>
          <div className="whitespace-pre-wrap break-words font-mono text-slate-700">{line || ' '}</div>
        </div>
      ))}
    </div>
  );
};

const resolveInitialCategory = (): NotificationTemplateCategory => {
  if (typeof window === 'undefined') {
    return 'email';
  }
  const stored = window.localStorage.getItem(NOTIFICATION_TEMPLATE_ACTIVE_CATEGORY_STORAGE_KEY);
  if (stored === 'email' || stored === 'sms' || stored === 'im') {
    return stored;
  }
  return 'email';
};

const normalizeTemplateVariables = (values: string[] | undefined): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];
  (values || []).forEach((value) => {
    const variable = String(value || '').trim();
    if (!variable) {
      return;
    }
    const key = variable.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    normalized.push(variable);
  });
  return normalized;
};

const extractPlaceholderVariables = (...templateParts: Array<string | undefined>): string[] => {
  const names: string[] = [];
  templateParts.forEach((part) => {
    const text = String(part || '');
    Array.from(text.matchAll(PLACEHOLDER_RE)).forEach((match) => {
      if (match[1]) {
        names.push(match[1]);
      }
    });
  });
  return normalizeTemplateVariables(names);
};

const analyzeTemplateDefinition = ({
  category,
  subject,
  subjectI18n,
  content,
  contentI18n,
  variables,
}: {
  category: NotificationTemplateCategory;
  subject?: string;
  subjectI18n?: NotificationTemplateI18nMap;
  content?: string;
  contentI18n?: NotificationTemplateI18nMap;
  variables?: string[];
}): TemplateDiagnostics => {
  const declaredVariables = normalizeTemplateVariables(variables);
  const normalizedSubjectI18n = normalizeTemplateI18nMap(subjectI18n);
  const normalizedContentI18n = normalizeTemplateI18nMap(contentI18n);
  const placeholderVariables = extractPlaceholderVariables(
    ...(category === 'email' ? [subject, ...templateLocales.map((locale) => normalizedSubjectI18n[locale])] : []),
    content,
    ...templateLocales.map((locale) => normalizedContentI18n[locale]),
  );
  const declaredMap = new Map(declaredVariables.map((item) => [item.toLowerCase(), item]));
  const placeholderMap = new Map(placeholderVariables.map((item) => [item.toLowerCase(), item]));

  return {
    declaredVariables,
    placeholderVariables,
    invalidDeclaredVariables: declaredVariables.filter((item) => !VARIABLE_NAME_RE.test(item)),
    missingDeclaredVariables: placeholderVariables.filter((item) => !declaredMap.has(item.toLowerCase())),
    unusedDeclaredVariables: declaredVariables.filter((item) => !placeholderMap.has(item.toLowerCase())),
  };
};

const resolveApiErrorMessage = (error: unknown, fallback: string): string => {
  const candidate = error as ApiErrorShape;
  const detail = candidate?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }
  if (detail && typeof detail === 'object' && typeof detail.message === 'string' && detail.message.trim()) {
    return detail.message;
  }
  if (typeof candidate?.response?.data?.message === 'string' && candidate.response.data.message.trim()) {
    return candidate.response.data.message;
  }
  if (typeof candidate?.message === 'string' && candidate.message.trim()) {
    return candidate.message;
  }
  return fallback;
};

const buildTemplatePayload = (values: TemplateFormValues): NotificationTemplateFormInput => ({
  code: values.code.trim(),
  name: values.name.trim(),
  name_i18n: normalizeTemplateI18nMap(values.name_i18n),
  description: values.description?.trim() || '',
  description_i18n: normalizeTemplateI18nMap(values.description_i18n),
  category: values.category,
  subject: values.category === 'email' ? values.subject?.trim() || '' : '',
  subject_i18n: values.category === 'email' ? normalizeTemplateI18nMap(values.subject_i18n) : {},
  content: values.content.trim(),
  content_i18n: normalizeTemplateI18nMap(values.content_i18n),
  variables: normalizeTemplateVariables(values.variables),
  is_enabled: Boolean(values.is_enabled),
});

const buildTemplatePreviewPayload = (
  values: TemplateFormValues,
  previewVariables: Record<string, string>,
  locale: NotificationTemplateLocale,
): NotificationTemplatePreviewInput => ({
  ...buildTemplatePayload(values),
  preview_variables: previewVariables,
  preview_locale: locale,
});

const mergeVariableKeys = (...groups: string[][]): string[] => {
  const seen = new Set<string>();
  const ordered: string[] = [];
  groups.forEach((group) => {
    group.forEach((value) => {
      const normalized = String(value || '').trim();
      if (!normalized) {
        return;
      }
      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      ordered.push(normalized);
    });
  });
  return ordered;
};

const renderVariableTags = (values: string[], emptyLabel: string, color?: string): React.ReactNode => {
  if (!values.length) {
    return <Tag>{emptyLabel}</Tag>;
  }
  return values.map((value) => (
    <Tag key={value} color={color}>
      {value}
    </Tag>
  ));
};

const NotificationTemplates: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<TemplateFormValues>();
  const currentTemplateLocale = useMemo(
    () => normalizeTemplateLocale(i18n.resolvedLanguage || i18n.language),
    [i18n.language, i18n.resolvedLanguage],
  );
  const [activeCategory, setActiveCategory] = useState<NotificationTemplateCategory>(resolveInitialCategory);
  const [templates, setTemplates] = useState<NotificationTemplateRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplateRecord | null>(null);
  const [previewData, setPreviewData] = useState<NotificationTemplatePreviewResult | null>(null);
  const [previewVariables, setPreviewVariables] = useState<Record<string, string>>({});

  const watchedCategory = (Form.useWatch('category', form) as NotificationTemplateCategory | undefined) ?? activeCategory;
  const watchedCode = Form.useWatch('code', form);
  const watchedName = Form.useWatch('name', form);
  const watchedNameI18n = Form.useWatch('name_i18n', form) as NotificationTemplateI18nMap | undefined;
  const watchedDescription = Form.useWatch('description', form);
  const watchedDescriptionI18n = Form.useWatch('description_i18n', form) as NotificationTemplateI18nMap | undefined;
  const watchedSubject = Form.useWatch('subject', form);
  const watchedSubjectI18n = Form.useWatch('subject_i18n', form) as NotificationTemplateI18nMap | undefined;
  const watchedContent = Form.useWatch('content', form);
  const watchedContentI18n = Form.useWatch('content_i18n', form) as NotificationTemplateI18nMap | undefined;
  const watchedVariables = Form.useWatch('variables', form) as string[] | undefined;
  const watchedEnabled = Form.useWatch('is_enabled', form);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(NOTIFICATION_TEMPLATE_ACTIVE_CATEGORY_STORAGE_KEY, activeCategory);
  }, [activeCategory]);

  const loadTemplates = async (): Promise<void> => {
    setLoading(true);
    try {
      const rows = await notificationTemplateService.listTemplates();
      setTemplates(rows);
    } catch (error) {
      console.error('Failed to load notification templates', error);
      message.error(resolveApiErrorMessage(error, t('notificationTemplates.messages.loadFailed')));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
  }, []);

  const previewResetKey = useMemo(
    () => JSON.stringify({
      category: watchedCategory,
      code: watchedCode,
      name: watchedName,
      name_i18n: normalizeTemplateI18nMap(watchedNameI18n),
      description: watchedDescription,
      description_i18n: normalizeTemplateI18nMap(watchedDescriptionI18n),
      subject: watchedSubject,
      subject_i18n: normalizeTemplateI18nMap(watchedSubjectI18n),
      content: watchedContent,
      content_i18n: normalizeTemplateI18nMap(watchedContentI18n),
      variables: normalizeTemplateVariables(watchedVariables),
      is_enabled: watchedEnabled,
    }),
    [
      watchedCategory,
      watchedCode,
      watchedName,
      watchedNameI18n,
      watchedDescription,
      watchedDescriptionI18n,
      watchedSubject,
      watchedSubjectI18n,
      watchedContent,
      watchedContentI18n,
      watchedVariables,
      watchedEnabled,
    ],
  );

  useEffect(() => {
    if (!modalOpen) {
      return;
    }
    setPreviewData(null);
  }, [modalOpen, previewResetKey]);

  const categoryOptions = useMemo(
    () =>
      categoryOrder.map((category) => ({
        value: category,
        label: t(`notificationTemplates.categories.${category}.title`),
      })),
    [t],
  );

  const categorizedTemplates = useMemo(
    () =>
      categoryOrder.reduce<Record<NotificationTemplateCategory, NotificationTemplateRecord[]>>(
        (accumulator, category) => {
          accumulator[category] = templates.filter((template) => template.category === category);
          return accumulator;
        },
        {
          email: [],
          sms: [],
          im: [],
        },
      ),
    [templates],
  );

  const liveDiagnostics = useMemo(
    () =>
      analyzeTemplateDefinition({
        category: watchedCategory,
        subject: watchedSubject,
        subjectI18n: watchedSubjectI18n,
        content: watchedContent,
        contentI18n: watchedContentI18n,
        variables: watchedVariables,
      }),
    [watchedCategory, watchedSubject, watchedSubjectI18n, watchedContent, watchedContentI18n, watchedVariables],
  );

  const previewVariableKeys = useMemo(
    () => mergeVariableKeys(
      liveDiagnostics.declaredVariables,
      liveDiagnostics.placeholderVariables,
      Object.keys(previewData?.preview.variables || {}),
    ),
    [liveDiagnostics, previewData],
  );

  useEffect(() => {
    setPreviewVariables((current) => {
      const nextEntries = previewVariableKeys.map((key) => [key, current[key] ?? ''] as const);
      const next = Object.fromEntries(nextEntries);
      const currentKeys = Object.keys(current);
      if (
        currentKeys.length === previewVariableKeys.length &&
        currentKeys.every((key) => next[key] === current[key])
      ) {
        return current;
      }
      return next;
    });
  }, [previewVariableKeys]);

  useEffect(() => {
    if (!modalOpen) {
      return;
    }
    setPreviewData(null);
  }, [modalOpen, JSON.stringify(previewVariables)]);

  const openCreateModal = (): void => {
    setEditingTemplate(null);
    setPreviewData(null);
    setPreviewVariables({});
    form.setFieldsValue({
      category: activeCategory,
      code: '',
      name: '',
      name_i18n: {},
      description: '',
      description_i18n: {},
      subject: activeCategory === 'email' ? '' : undefined,
      subject_i18n: {},
      content: '',
      content_i18n: {},
      variables: [],
      is_enabled: true,
    });
    setModalOpen(true);
  };

  const openEditModal = (template: NotificationTemplateRecord): void => {
    setEditingTemplate(template);
    setPreviewData(null);
    setPreviewVariables({});
    form.setFieldsValue({
      category: template.category,
      code: template.code,
      name: template.name,
      name_i18n: template.name_i18n ?? {},
      description: template.description ?? '',
      description_i18n: template.description_i18n ?? {},
      subject: template.subject ?? '',
      subject_i18n: template.subject_i18n ?? {},
      content: template.content,
      content_i18n: template.content_i18n ?? {},
      variables: template.variables,
      is_enabled: template.is_enabled,
    });
    setModalOpen(true);
  };

  const handleCloseModal = (): void => {
    setModalOpen(false);
    setEditingTemplate(null);
    setPreviewData(null);
    setPreviewVariables({});
    form.resetFields();
  };

  const handlePreview = async (): Promise<void> => {
    try {
      const values = await form.validateFields();
      setPreviewLoading(true);
      const result = await notificationTemplateService.previewTemplate(
        buildTemplatePreviewPayload(values, previewVariables, currentTemplateLocale),
      );
      setPreviewData(result);
      if (result.validation.invalid_declared_variables.length || result.validation.missing_declared_variables.length) {
        message.warning(t('notificationTemplates.messages.previewValidationWarning'));
      } else {
        message.success(t('notificationTemplates.messages.previewReady'));
      }
    } catch (error) {
      if (error && typeof error === 'object' && Array.isArray((error as { errorFields?: unknown[] }).errorFields)) {
        return;
      }
      console.error('Failed to preview notification template', error);
      message.error(resolveApiErrorMessage(error, t('notificationTemplates.messages.previewFailed')));
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSubmit = async (): Promise<void> => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const payload = buildTemplatePayload(values);
      const previewResult = await notificationTemplateService.previewTemplate(
        buildTemplatePreviewPayload(values, previewVariables, currentTemplateLocale),
      );
      setPreviewData(previewResult);
      if (
        previewResult.validation.invalid_declared_variables.length ||
        previewResult.validation.missing_declared_variables.length
      ) {
        message.error(t('notificationTemplates.messages.serverValidationFailed'));
        return;
      }

      if (editingTemplate) {
        await notificationTemplateService.updateTemplate(editingTemplate.id, payload);
        message.success(t('notificationTemplates.messages.updateSuccess'));
      } else {
        await notificationTemplateService.createTemplate(payload);
        message.success(t('notificationTemplates.messages.createSuccess'));
      }

      if (previewResult.validation.unused_declared_variables.length) {
        message.warning(t('notificationTemplates.messages.serverValidationWarning'));
      }

      handleCloseModal();
      await loadTemplates();
    } catch (error) {
      if (error && typeof error === 'object' && Array.isArray((error as { errorFields?: unknown[] }).errorFields)) {
        return;
      }
      console.error('Failed to save notification template', error);
      message.error(resolveApiErrorMessage(error, t('notificationTemplates.messages.saveFailed')));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (template: NotificationTemplateRecord, isEnabled: boolean): Promise<void> => {
    try {
      await notificationTemplateService.updateTemplateStatus(template.id, isEnabled);
      message.success(
        isEnabled
          ? t('notificationTemplates.messages.enableSuccess')
          : t('notificationTemplates.messages.disableSuccess'),
      );
      await loadTemplates();
    } catch (error) {
      console.error('Failed to toggle notification template status', error);
      message.error(resolveApiErrorMessage(error, t('notificationTemplates.messages.statusFailed')));
    }
  };

  const handleDelete = async (templateId: number): Promise<void> => {
    try {
      await notificationTemplateService.deleteTemplate(templateId);
      message.success(t('notificationTemplates.messages.deleteSuccess'));
      await loadTemplates();
    } catch (error) {
      console.error('Failed to delete notification template', error);
      message.error(resolveApiErrorMessage(error, t('notificationTemplates.messages.deleteFailed')));
    }
  };

  const columns = useMemo<ColumnsType<NotificationTemplateRecord>>(
    () => [
      {
        title: t('notificationTemplates.fields.templateLabel'),
        key: 'template',
        width: 260,
        render: (_, record) => (
          <Space size={12} align="start">
            <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100">
              {categoryIconMap[record.category]}
            </div>
            <div>
              <Space size={8} wrap>
                <Text strong>{getLocalizedTemplateText(record.name, record.name_i18n, currentTemplateLocale)}</Text>
                {record.is_builtin && <Tag color="processing">{t('notificationTemplates.status.builtin')}</Tag>}
                {!record.is_enabled && <Tag>{t('notificationTemplates.status.disabled')}</Tag>}
              </Space>
              <Paragraph className="!mb-0 !mt-1 text-slate-500">
                {getLocalizedTemplateText(
                  record.description,
                  record.description_i18n,
                  currentTemplateLocale,
                ) || t('notificationTemplates.emptyDescription')}
              </Paragraph>
            </div>
          </Space>
        ),
      },
      {
        title: t('notificationTemplates.fields.codeLabel'),
        dataIndex: 'code',
        key: 'code',
        width: 180,
        render: (value: string) => <span className="font-mono text-sm text-slate-700">{value}</span>,
      },
      {
        title: t('notificationTemplates.fields.variablesLabel'),
        key: 'variables',
        width: 240,
        render: (_, record) => (
          <div className="flex flex-wrap gap-2">
            {renderVariableTags(record.variables, t('notificationTemplates.fields.noVariables'), 'blue')}
          </div>
        ),
      },
      {
        title: t('notificationTemplates.fields.contentLabel'),
        key: 'content',
        render: (_, record) => (
          <div className="min-w-[320px]">
            {getLocalizedTemplateText(record.subject, record.subject_i18n, currentTemplateLocale) && (
              <div className="rounded-2xl bg-slate-50 px-3 py-2">
                <Text type="secondary">{t('notificationTemplates.fields.subjectLabel')}</Text>
                <div className="mt-1 text-sm font-semibold text-slate-700">
                  {getLocalizedTemplateText(record.subject, record.subject_i18n, currentTemplateLocale)}
                </div>
              </div>
            )}
            {renderTemplateContentLines(
              getLocalizedTemplateText(record.content, record.content_i18n, currentTemplateLocale),
              4,
            )}
          </div>
        ),
      },
      {
        title: t('notificationTemplates.fields.statusLabel'),
        key: 'status',
        width: 180,
        render: (_, record) => (
          <div className="space-y-3">
            <Switch
              checked={record.is_enabled}
              checkedChildren={t('notificationTemplates.status.enabled')}
              unCheckedChildren={t('notificationTemplates.status.disabled')}
              onChange={(checked) => void handleToggleStatus(record, checked)}
            />
            <div>
              <Text type="secondary">{t('notificationTemplates.fields.variableCountLabel')}</Text>
              <div className="mt-1 text-sm font-semibold text-slate-700">
                {t('notificationTemplates.fields.variableCount', { count: record.variables.length })}
              </div>
            </div>
          </div>
        ),
      },
      {
        title: t('notificationTemplates.fields.actionsLabel'),
        key: 'actions',
        width: 180,
        fixed: 'right',
        render: (_, record) => (
          <div className="flex flex-wrap justify-end gap-3">
            <AppButton intent="secondary" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
              {t('notificationTemplates.actions.edit')}
            </AppButton>
            {!record.is_builtin && (
              <Popconfirm
                title={t('notificationTemplates.actions.deleteConfirmTitle')}
                description={t('notificationTemplates.actions.deleteConfirmDescription')}
                onConfirm={() => void handleDelete(record.id)}
              >
                <AppButton intent="secondary" icon={<DeleteOutlined />}>
                  {t('notificationTemplates.actions.delete')}
                </AppButton>
              </Popconfirm>
            )}
          </div>
        ),
      },
    ],
    [currentTemplateLocale, t],
  );

  const tabItems = categoryOrder.map((category) => ({
    key: category,
    label: <span>{t(`notificationTemplates.categories.${category}.title`)}</span>,
    children: categorizedTemplates[category].length ? (
      <Table<NotificationTemplateRecord>
        rowKey="id"
        columns={columns}
        dataSource={categorizedTemplates[category]}
        pagination={false}
        scroll={{ x: 1280 }}
      />
    ) : (
      <Empty description={t('notificationTemplates.empty.category')} />
    ),
  }));

  return (
    <div className="space-y-6">
      <AppPageHeader
        title={t('notificationTemplates.title')}
        subtitle={t('notificationTemplates.subtitle')}
        action={(
          <AppButton intent="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            {t('notificationTemplates.actions.create')}
          </AppButton>
        )}
      />

      <Card className="border-slate-200 shadow-sm" loading={loading}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <Title level={5} className="!mb-1">
              {t('notificationTemplates.sections.libraryTitle')}
            </Title>
            <Paragraph className="!mb-0 text-slate-500">
              {t('notificationTemplates.sections.libraryDescription')}
            </Paragraph>
          </div>
        </div>

        <Tabs
          activeKey={activeCategory}
          items={tabItems}
          onChange={(value) => setActiveCategory(value as NotificationTemplateCategory)}
        />
      </Card>

      <Modal
        title={editingTemplate ? t('notificationTemplates.modal.editTitle') : t('notificationTemplates.modal.createTitle')}
        open={modalOpen}
        onCancel={handleCloseModal}
        confirmLoading={submitting}
        width={760}
        footer={(
          <div className="flex items-center justify-between gap-3">
            <Text type="secondary">{t('notificationTemplates.preview.sampleHint')}</Text>
            <Space wrap>
              <AppButton intent="secondary" onClick={handleCloseModal}>
                {t('notificationTemplates.actions.cancel')}
              </AppButton>
              <AppButton intent="secondary" icon={<EyeOutlined />} onClick={() => void handlePreview()} loading={previewLoading}>
                {t('notificationTemplates.actions.preview')}
              </AppButton>
              <AppButton intent="primary" onClick={() => void handleSubmit()} loading={submitting}>
                {t('notificationTemplates.actions.save')}
              </AppButton>
            </Space>
          </div>
        )}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            category: activeCategory,
            is_enabled: true,
            variables: [],
            name_i18n: {},
            description_i18n: {},
            subject_i18n: {},
            content_i18n: {},
          }}
        >
          <div className="grid grid-cols-2 gap-x-6">
            <Form.Item
              name="category"
              label={<span className="font-semibold">{t('notificationTemplates.form.category')}</span>}
              rules={[{ required: true, message: t('notificationTemplates.validation.categoryRequired') }]}
            >
              <Select options={categoryOptions} disabled={Boolean(editingTemplate?.is_builtin)} />
            </Form.Item>
            <Form.Item
              name="code"
              label={<span className="font-semibold">{t('notificationTemplates.form.code')}</span>}
              rules={[
                { required: true, message: t('notificationTemplates.validation.codeRequired') },
                { pattern: /^[a-z0-9][a-z0-9_-]{2,63}$/, message: t('notificationTemplates.validation.codePattern') },
              ]}
            >
              <Input
                placeholder={t('notificationTemplates.form.codePlaceholder')}
                disabled={Boolean(editingTemplate?.is_builtin)}
              />
            </Form.Item>
          </div>

          <div className="grid grid-cols-2 gap-x-6">
            <Form.Item
              name="name"
              label={<span className="font-semibold">{t('notificationTemplates.form.name')}</span>}
              rules={[{ required: true, message: t('notificationTemplates.validation.nameRequired') }]}
            >
              <Input placeholder={t('notificationTemplates.form.namePlaceholder')} />
            </Form.Item>
            <Form.Item
              name="is_enabled"
              label={<span className="font-semibold">{t('notificationTemplates.form.enabled')}</span>}
              valuePropName="checked"
            >
              <Switch
                checkedChildren={t('notificationTemplates.status.enabled')}
                unCheckedChildren={t('notificationTemplates.status.disabled')}
              />
            </Form.Item>
          </div>

          <Form.Item
            name="description"
            label={<span className="font-semibold">{t('notificationTemplates.form.description')}</span>}
          >
            <Input placeholder={t('notificationTemplates.form.descriptionPlaceholder')} />
          </Form.Item>

          {watchedCategory === 'email' && (
            <Form.Item
              name="subject"
              label={<span className="font-semibold">{t('notificationTemplates.form.subject')}</span>}
              rules={[{ required: true, message: t('notificationTemplates.validation.subjectRequired') }]}
            >
              <Input placeholder={t('notificationTemplates.form.subjectPlaceholder')} />
            </Form.Item>
          )}

          <Form.Item
            name="variables"
            label={<span className="font-semibold">{t('notificationTemplates.form.variables')}</span>}
            help={t('notificationTemplates.form.variablesHelp')}
          >
            <Select
              mode="tags"
              tokenSeparators={[',', ' ']}
              placeholder={t('notificationTemplates.form.variablesPlaceholder')}
            />
          </Form.Item>

          <Form.Item
            name="content"
            label={<span className="font-semibold">{t('notificationTemplates.form.content')}</span>}
            rules={[{ required: true, message: t('notificationTemplates.validation.contentRequired') }]}
          >
            <Input.TextArea rows={8} placeholder={t('notificationTemplates.form.contentPlaceholder')} />
          </Form.Item>

          <Card size="small" className="mb-4 border-slate-200 bg-slate-50">
            <div className="mb-4">
              <Title level={5} className="!mb-1">
                {t('notificationTemplates.form.localizedTitle')}
              </Title>
              <Paragraph className="!mb-0 text-slate-500">
                {t('notificationTemplates.form.localizedHelp')}
              </Paragraph>
            </div>

            <Tabs
              items={templateLocales.map((locale) => ({
                key: locale,
                label: t(`notificationTemplates.form.localeTabs.${locale === 'zh-CN' ? 'zhCN' : 'enUS'}`),
                children: (
                  <div className="grid grid-cols-1 gap-4">
                    <Form.Item
                      name={['name_i18n', locale]}
                      label={<span className="font-semibold">{t('notificationTemplates.form.localizedName')}</span>}
                    >
                      <Input placeholder={t('notificationTemplates.form.localizedNamePlaceholder')} />
                    </Form.Item>

                    <Form.Item
                      name={['description_i18n', locale]}
                      label={<span className="font-semibold">{t('notificationTemplates.form.localizedDescription')}</span>}
                    >
                      <Input placeholder={t('notificationTemplates.form.localizedDescriptionPlaceholder')} />
                    </Form.Item>

                    {watchedCategory === 'email' && (
                      <Form.Item
                        name={['subject_i18n', locale]}
                        label={<span className="font-semibold">{t('notificationTemplates.form.localizedSubject')}</span>}
                      >
                        <Input placeholder={t('notificationTemplates.form.localizedSubjectPlaceholder')} />
                      </Form.Item>
                    )}

                    <Form.Item
                      name={['content_i18n', locale]}
                      label={<span className="font-semibold">{t('notificationTemplates.form.localizedContent')}</span>}
                      extra={t('notificationTemplates.form.localizedFallbackHint')}
                    >
                      <Input.TextArea rows={6} placeholder={t('notificationTemplates.form.localizedContentPlaceholder')} />
                    </Form.Item>
                  </div>
                ),
              }))}
            />
          </Card>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card size="small" className="border-slate-200 bg-slate-50">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Title level={5} className="!mb-0">
                    {t('notificationTemplates.validation.title')}
                  </Title>
                  <Tag color="blue">
                    {t('notificationTemplates.validation.placeholderCount', {
                      count: liveDiagnostics.placeholderVariables.length,
                    })}
                  </Tag>
                </div>

                {liveDiagnostics.invalidDeclaredVariables.length > 0 && (
                  <Alert
                    type="error"
                    showIcon
                    message={t('notificationTemplates.validation.invalidVariables')}
                    description={liveDiagnostics.invalidDeclaredVariables.join(', ')}
                  />
                )}

                {liveDiagnostics.missingDeclaredVariables.length > 0 && (
                  <Alert
                    type="warning"
                    showIcon
                    message={t('notificationTemplates.validation.missingVariables')}
                    description={liveDiagnostics.missingDeclaredVariables.join(', ')}
                  />
                )}

                {liveDiagnostics.unusedDeclaredVariables.length > 0 && (
                  <Alert
                    type="info"
                    showIcon
                    message={t('notificationTemplates.validation.unusedVariables')}
                    description={liveDiagnostics.unusedDeclaredVariables.join(', ')}
                  />
                )}

                {!liveDiagnostics.invalidDeclaredVariables.length &&
                  !liveDiagnostics.missingDeclaredVariables.length &&
                  !liveDiagnostics.unusedDeclaredVariables.length && (
                    <Alert
                      type="success"
                      showIcon
                      message={t('notificationTemplates.validation.ready')}
                    />
                  )}

                <div>
                  <Text type="secondary">{t('notificationTemplates.validation.declaredVariables')}</Text>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {renderVariableTags(
                      liveDiagnostics.declaredVariables,
                      t('notificationTemplates.validation.noDeclaredVariables'),
                      'blue',
                    )}
                  </div>
                </div>

                <div>
                  <Text type="secondary">{t('notificationTemplates.validation.placeholderVariables')}</Text>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {renderVariableTags(
                      liveDiagnostics.placeholderVariables,
                      t('notificationTemplates.validation.noPlaceholders'),
                      'geekblue',
                    )}
                  </div>
                </div>
              </div>
            </Card>

            <Card size="small" className="border-slate-200 bg-slate-50">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Title level={5} className="!mb-0">
                    {t('notificationTemplates.preview.title')}
                  </Title>
                  {previewData && <Tag color="processing">{t('notificationTemplates.preview.sampleTag')}</Tag>}
                </div>

                <div className="rounded-2xl bg-white px-4 py-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <Text strong>{t('notificationTemplates.preview.variableEditorTitle')}</Text>
                    <Text type="secondary">{t('notificationTemplates.preview.variableEditorHelp')}</Text>
                  </div>
                  {previewVariableKeys.length ? (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {previewVariableKeys.map((key) => (
                        <div key={key}>
                          <Text type="secondary">{key}</Text>
                          <Input
                            className="mt-1"
                            value={previewVariables[key] ?? ''}
                            placeholder={t('notificationTemplates.preview.variablePlaceholder')}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setPreviewVariables((current) => ({
                                ...current,
                                [key]: nextValue,
                              }));
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Tag>{t('notificationTemplates.preview.noEditableVariables')}</Tag>
                  )}
                </div>

                <div className="rounded-2xl bg-white px-4 py-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <Text strong>{t('notificationTemplates.validation.serverTitle')}</Text>
                    {previewData && (
                      <Tag color="blue">
                        {t('notificationTemplates.validation.serverChecked')}
                      </Tag>
                    )}
                  </div>
                  {previewData ? (
                    <div className="space-y-3">
                      {previewData.validation.invalid_declared_variables.length > 0 && (
                        <Alert
                          type="error"
                          showIcon
                          message={t('notificationTemplates.validation.invalidVariables')}
                          description={previewData.validation.invalid_declared_variables.join(', ')}
                        />
                      )}
                      {previewData.validation.missing_declared_variables.length > 0 && (
                        <Alert
                          type="warning"
                          showIcon
                          message={t('notificationTemplates.validation.missingVariables')}
                          description={previewData.validation.missing_declared_variables.join(', ')}
                        />
                      )}
                      {previewData.validation.unused_declared_variables.length > 0 && (
                        <Alert
                          type="info"
                          showIcon
                          message={t('notificationTemplates.validation.unusedVariables')}
                          description={previewData.validation.unused_declared_variables.join(', ')}
                        />
                      )}
                      {!previewData.validation.invalid_declared_variables.length &&
                        !previewData.validation.missing_declared_variables.length &&
                        !previewData.validation.unused_declared_variables.length && (
                          <Alert
                            type="success"
                            showIcon
                            message={t('notificationTemplates.validation.serverReady')}
                          />
                        )}
                    </div>
                  ) : (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={t('notificationTemplates.validation.serverEmpty')}
                    />
                  )}
                </div>

                {previewData ? (
                  <>
                    {previewData.preview.subject && (
                      <div className="rounded-2xl bg-white px-4 py-3">
                        <Text type="secondary">{t('notificationTemplates.preview.subject')}</Text>
                        <div className="mt-1 text-sm font-semibold text-slate-700">{previewData.preview.subject}</div>
                      </div>
                    )}

                    <div className="rounded-2xl bg-white px-4 py-3">
                      <Text type="secondary">{t('notificationTemplates.preview.variables')}</Text>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {Object.keys(previewData.preview.variables).length ? (
                          Object.entries(previewData.preview.variables).map(([key, value]) => (
                            <Tag key={key} color="purple">
                              {key}: {value}
                            </Tag>
                          ))
                        ) : (
                          <Tag>{t('notificationTemplates.preview.noVariables')}</Tag>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-white px-4 py-3">
                      <Text type="secondary">{t('notificationTemplates.preview.content')}</Text>
                      {renderTemplateContentLines(previewData.preview.content)}
                    </div>
                  </>
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={t('notificationTemplates.preview.empty')}
                  />
                )}
              </div>
            </Card>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default NotificationTemplates;
