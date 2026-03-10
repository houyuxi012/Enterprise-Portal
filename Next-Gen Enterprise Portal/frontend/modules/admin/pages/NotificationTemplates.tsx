import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Card,
  Empty,
  Form,
  Input,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';

import { AppButton, AppForm, AppModal, AppPageHeader, AppTable } from '@/modules/admin/components/ui';
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

type TemplateFormValues = NotificationTemplateFormInput & {
  default_locale?: NotificationTemplateLocale;
};
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

const resolveDefaultLocale = (
  fallbackValue: string | null | undefined,
  i18nMap: NotificationTemplateI18nMap | undefined,
  preferredLocale: NotificationTemplateLocale,
): NotificationTemplateLocale => {
  const normalized = normalizeTemplateI18nMap(i18nMap);
  const fallback = String(fallbackValue || '').trim();
  if (!fallback) {
    return normalized[preferredLocale] ? preferredLocale : 'zh-CN';
  }
  if (normalized['zh-CN'] && normalized['zh-CN'] === fallback) {
    return 'zh-CN';
  }
  if (normalized['en-US'] && normalized['en-US'] === fallback) {
    return 'en-US';
  }
  return normalized[preferredLocale] ? preferredLocale : 'zh-CN';
};

const hydrateLocaleMapWithFallback = (
  fallbackValue: string | null | undefined,
  i18nMap: NotificationTemplateI18nMap | undefined,
  locale: NotificationTemplateLocale,
): NotificationTemplateI18nMap => {
  const normalized = normalizeTemplateI18nMap(i18nMap);
  const fallback = String(fallbackValue || '').trim();
  if (fallback && !normalized[locale]) {
    normalized[locale] = fallback;
  }
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
  /* eslint-disable admin-ui/no-admin-page-visual-utilities -- template source preview needs monospace framing, line separators, and muted line numbers */
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
  /* eslint-enable admin-ui/no-admin-page-visual-utilities */
};

const renderEmailPreviewFrame = (html: string): React.ReactNode => {
  /* eslint-disable admin-ui/no-admin-page-visual-utilities -- email preview keeps a framed canvas separate from the admin page shell */
  return (
    <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
      <iframe
        title="notification-template-email-preview"
        sandbox=""
        srcDoc={html}
        className="h-[560px] w-full bg-white"
      />
    </div>
  );
  /* eslint-enable admin-ui/no-admin-page-visual-utilities */
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
  default_locale: values.default_locale ?? 'zh-CN',
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

const buildTemplatePreviewPayloadFromRecord = (
  template: NotificationTemplateRecord,
  previewVariables: Record<string, string>,
  locale: NotificationTemplateLocale,
): NotificationTemplatePreviewInput => ({
  code: template.code,
  name: template.name,
  default_locale: template.default_locale || 'zh-CN',
  name_i18n: normalizeTemplateI18nMap(template.name_i18n),
  description: template.description || '',
  description_i18n: normalizeTemplateI18nMap(template.description_i18n),
  category: template.category,
  subject: template.subject || '',
  subject_i18n: normalizeTemplateI18nMap(template.subject_i18n),
  content: template.content,
  content_i18n: normalizeTemplateI18nMap(template.content_i18n),
  variables: normalizeTemplateVariables(template.variables),
  is_enabled: Boolean(template.is_enabled),
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

const buildPreviewVariableMap = (template: NotificationTemplateRecord): Record<string, string> => {
  const diagnostics = analyzeTemplateDefinition({
    category: template.category,
    subject: template.subject || '',
    subjectI18n: template.subject_i18n,
    content: template.content,
    contentI18n: template.content_i18n,
    variables: template.variables,
  });
  const keys = mergeVariableKeys(diagnostics.declaredVariables, diagnostics.placeholderVariables);
  return Object.fromEntries(keys.map((key) => [key, key]));
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
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplateRecord | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<NotificationTemplateRecord | null>(null);
  const [previewLocale, setPreviewLocale] = useState<NotificationTemplateLocale>(currentTemplateLocale);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<NotificationTemplatePreviewResult | null>(null);
  const [previewVariables, setPreviewVariables] = useState<Record<string, string>>({});

  const watchedCategory = (Form.useWatch('category', form) as NotificationTemplateCategory | undefined) ?? activeCategory;
  const watchedDefaultLocale = (
    Form.useWatch('default_locale', form) as NotificationTemplateLocale | undefined
  ) ?? currentTemplateLocale;
  const watchedSubject = Form.useWatch('subject', form);
  const watchedSubjectI18n = Form.useWatch('subject_i18n', form) as NotificationTemplateI18nMap | undefined;
  const watchedContent = Form.useWatch('content', form);
  const watchedContentI18n = Form.useWatch('content_i18n', form) as NotificationTemplateI18nMap | undefined;
  const watchedVariables = Form.useWatch('variables', form) as string[] | undefined;

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

  const openCreateModal = (): void => {
    setEditingTemplate(null);
    form.setFieldsValue({
      default_locale: currentTemplateLocale,
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
    const defaultLocale = template.default_locale || resolveDefaultLocale(
      template.content,
      template.content_i18n,
      currentTemplateLocale,
    );
    setEditingTemplate(template);
    form.setFieldsValue({
      default_locale: defaultLocale,
      category: template.category,
      code: template.code,
      name: template.name,
      name_i18n: hydrateLocaleMapWithFallback(template.name, template.name_i18n, defaultLocale),
      description: template.description ?? '',
      description_i18n: hydrateLocaleMapWithFallback(template.description, template.description_i18n, defaultLocale),
      subject: template.subject ?? '',
      subject_i18n: hydrateLocaleMapWithFallback(template.subject, template.subject_i18n, defaultLocale),
      content: template.content,
      content_i18n: hydrateLocaleMapWithFallback(template.content, template.content_i18n, defaultLocale),
      variables: template.variables,
      is_enabled: template.is_enabled,
    });
    setModalOpen(true);
  };

  const handleCloseModal = (): void => {
    setModalOpen(false);
    setEditingTemplate(null);
    form.resetFields();
  };

  const handleRunPreview = async (
    template: NotificationTemplateRecord,
    variables: Record<string, string>,
    locale: NotificationTemplateLocale = previewLocale,
  ): Promise<void> => {
    try {
      setPreviewLoading(true);
      const result = await notificationTemplateService.previewTemplate(
        buildTemplatePreviewPayloadFromRecord(template, variables, locale),
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

  const openPreviewModal = (template: NotificationTemplateRecord): void => {
    const initialPreviewVariables = buildPreviewVariableMap(template);
    setPreviewTemplate(template);
    setPreviewLocale(currentTemplateLocale);
    setPreviewData(null);
    setPreviewVariables(initialPreviewVariables);
    setPreviewModalOpen(true);
    void handleRunPreview(template, initialPreviewVariables, currentTemplateLocale);
  };

  const handleClosePreviewModal = (): void => {
    setPreviewModalOpen(false);
    setPreviewTemplate(null);
    setPreviewLocale(currentTemplateLocale);
    setPreviewData(null);
    setPreviewVariables({});
  };

  const handleSubmit = async (): Promise<void> => {
    try {
      const values = await form.validateFields();
      const defaultLocale = values.default_locale ?? currentTemplateLocale;
      const nameI18n = normalizeTemplateI18nMap(values.name_i18n);
      const descriptionI18n = normalizeTemplateI18nMap(values.description_i18n);
      const subjectI18n = normalizeTemplateI18nMap(values.subject_i18n);
      const contentI18n = normalizeTemplateI18nMap(values.content_i18n);
      const nextName = String(nameI18n[defaultLocale] || '').trim();
      const nextDescription = String(descriptionI18n[defaultLocale] || '').trim();
      const nextSubject = String(subjectI18n[defaultLocale] || '').trim();
      const nextContent = String(contentI18n[defaultLocale] || '').trim();
      const fieldErrors: Array<{ name: (string | number)[]; errors: string[] }> = [];

      if (!nextName) {
        fieldErrors.push({
          name: ['name_i18n', defaultLocale],
          errors: [t('notificationTemplates.validation.nameRequired')],
        });
      }
      if (watchedCategory === 'email' && !nextSubject) {
        fieldErrors.push({
          name: ['subject_i18n', defaultLocale],
          errors: [t('notificationTemplates.validation.subjectRequired')],
        });
      }
      if (!nextContent) {
        fieldErrors.push({
          name: ['content_i18n', defaultLocale],
          errors: [t('notificationTemplates.validation.contentRequired')],
        });
      }
      if (fieldErrors.length) {
        form.setFields(fieldErrors as Parameters<typeof form.setFields>[0]);
        return;
      }

      const normalizedValues: TemplateFormValues = {
        ...values,
        name: nextName,
        description: nextDescription,
        subject: watchedCategory === 'email' ? nextSubject : '',
        content: nextContent,
        name_i18n: nameI18n,
        description_i18n: descriptionI18n,
        subject_i18n: subjectI18n,
        content_i18n: contentI18n,
      };

      setSubmitting(true);
      const payload = buildTemplatePayload(normalizedValues);
      const previewResult = await notificationTemplateService.previewTemplate(
        buildTemplatePreviewPayload(normalizedValues, {}, currentTemplateLocale),
      );
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
          <div>
            <Text strong>{getLocalizedTemplateText(record.name, record.name_i18n, currentTemplateLocale)}</Text>
          </div>
        ),
      },
      {
        title: t('notificationTemplates.fields.attributeLabel'),
        key: 'attribute',
        width: 180,
        render: (_, record) => (
          <Space size={8} wrap>
            <Tag color={record.is_builtin ? 'processing' : 'default'}>
              {record.is_builtin
                ? t('notificationTemplates.status.builtin')
                : t('notificationTemplates.status.custom')}
            </Tag>
          </Space>
        ),
      },
      {
        title: t('notificationTemplates.fields.descriptionLabel'),
        key: 'description',
        render: (_, record) => (
          <Paragraph type="secondary" className="!mb-0">
            {getLocalizedTemplateText(
              record.description,
              record.description_i18n,
              currentTemplateLocale,
            ) || t('notificationTemplates.emptyDescription')}
          </Paragraph>
        ),
      },
      {
        title: t('notificationTemplates.fields.statusLabel'),
        key: 'status',
        width: 140,
        render: (_, record) => (
          <Switch
            checked={record.is_enabled}
            checkedChildren={t('notificationTemplates.status.enabled')}
            unCheckedChildren={t('notificationTemplates.status.disabled')}
            onChange={(checked) => void handleToggleStatus(record, checked)}
          />
        ),
      },
      {
        title: t('notificationTemplates.fields.actionsLabel'),
        key: 'actions',
        width: 112,
        align: 'right',
        fixed: 'right',
        render: (_, record) => (
          <Space size={4}>
            <Tooltip title={t('notificationTemplates.actions.preview')}>
              <AppButton
                intent="tertiary"
                iconOnly
                size="sm"
                icon={<EyeOutlined />}
                aria-label={t('notificationTemplates.actions.preview')}
                onClick={() => openPreviewModal(record)}
              />
            </Tooltip>
            <Tooltip title={t('notificationTemplates.actions.edit')}>
              <AppButton
                intent="tertiary"
                iconOnly
                size="sm"
                icon={<EditOutlined />}
                aria-label={t('notificationTemplates.actions.edit')}
                onClick={() => openEditModal(record)}
              />
            </Tooltip>
            {!record.is_builtin && (
              <Popconfirm
                title={t('notificationTemplates.actions.deleteConfirmTitle')}
                description={t('notificationTemplates.actions.deleteConfirmDescription')}
                onConfirm={() => void handleDelete(record.id)}
              >
                <Tooltip title={t('notificationTemplates.actions.delete')}>
                  <AppButton
                    intent="tertiary"
                    iconOnly
                    size="sm"
                    icon={<DeleteOutlined />}
                    aria-label={t('notificationTemplates.actions.delete')}
                  />
                </Tooltip>
              </Popconfirm>
            )}
          </Space>
        ),
      },
    ],
    [currentTemplateLocale, t],
  );

  const tabItems = categoryOrder.map((category) => ({
    key: category,
    label: <span>{t(`notificationTemplates.categories.${category}.title`)}</span>,
    children: categorizedTemplates[category].length ? (
      <AppTable<NotificationTemplateRecord>
        rowKey="id"
        columns={columns}
        dataSource={categorizedTemplates[category]}
        pagination={false}
        scroll={{ x: 960 }}
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

      <Card className="admin-card" loading={loading}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <Title level={5} className="!mb-1">
              {t('notificationTemplates.sections.libraryTitle')}
            </Title>
            <Paragraph type="secondary" className="!mb-0">
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

      <AppModal
        title={editingTemplate ? t('notificationTemplates.modal.editTitle') : t('notificationTemplates.modal.createTitle')}
        open={modalOpen}
        onCancel={handleCloseModal}
        confirmLoading={submitting}
        width={760}
        footer={(
          <Space wrap>
            <AppButton intent="secondary" onClick={handleCloseModal}>
              {t('notificationTemplates.actions.cancel')}
            </AppButton>
            <AppButton intent="primary" onClick={() => void handleSubmit()} loading={submitting}>
              {t('notificationTemplates.actions.save')}
            </AppButton>
          </Space>
        )}
      >
        <AppForm
          form={form}
          layout="vertical"
          initialValues={{
            default_locale: currentTemplateLocale,
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
            <AppForm.Item
              name="category"
              label={t('notificationTemplates.form.category')}
              rules={[{ required: true, message: t('notificationTemplates.validation.categoryRequired') }]}
            >
              <Select options={categoryOptions} disabled={Boolean(editingTemplate?.is_builtin)} />
            </AppForm.Item>
            <AppForm.Item
              name="code"
              label={t('notificationTemplates.form.code')}
              rules={[
                { required: true, message: t('notificationTemplates.validation.codeRequired') },
                { pattern: /^[a-z0-9][a-z0-9_-]{2,63}$/, message: t('notificationTemplates.validation.codePattern') },
              ]}
            >
              <Input
                placeholder={t('notificationTemplates.form.codePlaceholder')}
                disabled={Boolean(editingTemplate?.is_builtin)}
              />
            </AppForm.Item>
          </div>

          <div className="grid grid-cols-[minmax(0,1.4fr),minmax(0,1fr)] gap-x-6">
            <AppForm.Item
              name="variables"
              label={t('notificationTemplates.form.variables')}
            >
              <Select
                mode="tags"
                tokenSeparators={[',', ' ']}
                placeholder={t('notificationTemplates.form.variablesPlaceholder')}
              />
            </AppForm.Item>
            <AppForm.Item
              name="is_enabled"
              label={t('notificationTemplates.form.enabled')}
              valuePropName="checked"
            >
              <Switch
                checkedChildren={t('notificationTemplates.status.enabled')}
                unCheckedChildren={t('notificationTemplates.status.disabled')}
              />
            </AppForm.Item>
          </div>

          <Card size="small" className="admin-card admin-card-subtle mb-4">
            <div className="mb-3 flex items-center justify-between gap-4">
              <Text strong>
                {t('notificationTemplates.form.editorTitle')}
              </Text>
              <div className="flex items-center gap-2">
                <Text type="secondary" className="whitespace-nowrap text-xs">
                  {t('notificationTemplates.form.defaultLocale')}
                </Text>
                <AppForm.Item
                  name="default_locale"
                  className="!mb-0 min-w-[160px]"
                  initialValue={currentTemplateLocale}
                >
                  <Select
                    options={templateLocales.map((locale) => ({
                      value: locale,
                      label: t(`notificationTemplates.form.localeTabs.${locale === 'zh-CN' ? 'zhCN' : 'enUS'}`),
                    }))}
                    placeholder={t('notificationTemplates.form.defaultLocalePlaceholder')}
                  />
                </AppForm.Item>
              </div>
            </div>

            <Tabs
              items={templateLocales.map((locale) => ({
                key: locale,
                label: (
                  <Space size={6}>
                    <span>{t(`notificationTemplates.form.localeTabs.${locale === 'zh-CN' ? 'zhCN' : 'enUS'}`)}</span>
                    {watchedDefaultLocale === locale && (
                      <Tag color="processing">{t('notificationTemplates.form.defaultFlag')}</Tag>
                    )}
                  </Space>
                ),
                children: (
                  <div className="grid grid-cols-1 gap-4">
                    <AppForm.Item
                      name={['name_i18n', locale]}
                      label={t('notificationTemplates.form.localizedName')}
                      extra={<Text type="secondary">{t('notificationTemplates.form.defaultLocaleHint')}</Text>}
                    >
                      <Input placeholder={t('notificationTemplates.form.localizedNamePlaceholder')} />
                    </AppForm.Item>

                    <AppForm.Item
                      name={['description_i18n', locale]}
                      label={t('notificationTemplates.form.localizedDescription')}
                    >
                      <Input placeholder={t('notificationTemplates.form.localizedDescriptionPlaceholder')} />
                    </AppForm.Item>

                    {watchedCategory === 'email' && (
                      <AppForm.Item
                        name={['subject_i18n', locale]}
                        label={t('notificationTemplates.form.localizedSubject')}
                      >
                        <Input placeholder={t('notificationTemplates.form.localizedSubjectPlaceholder')} />
                      </AppForm.Item>
                    )}

                    <AppForm.Item
                      name={['content_i18n', locale]}
                      label={(
                        <span>
                          {watchedCategory === 'email'
                            ? t('notificationTemplates.form.localizedHtmlContent')
                            : t('notificationTemplates.form.localizedContent')}
                        </span>
                      )}
                      extra={t('notificationTemplates.form.localizedFallbackHint')}
                    >
                      <Input.TextArea
                        rows={10}
                        className="font-mono"
                        placeholder={
                          watchedCategory === 'email'
                            ? t('notificationTemplates.form.localizedHtmlContentPlaceholder')
                            : t('notificationTemplates.form.localizedContentPlaceholder')
                        }
                      />
                    </AppForm.Item>
                  </div>
                ),
              }))}
            />
          </Card>

          <Card size="small" className="admin-card admin-card-subtle">
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
        </AppForm>
      </AppModal>

      <AppModal
        title={t('notificationTemplates.preview.title')}
        open={previewModalOpen}
        onCancel={handleClosePreviewModal}
        width={860}
        footer={(
          <Space wrap>
            <AppButton intent="secondary" onClick={handleClosePreviewModal}>
              {t('notificationTemplates.actions.cancel')}
            </AppButton>
          </Space>
        )}
      >
        {previewTemplate ? (
          <Card size="small" className="admin-card admin-card-subtle" loading={previewLoading}>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Title level={5} className="!mb-1">
                    {getLocalizedTemplateText(previewTemplate.name, previewTemplate.name_i18n, previewLocale)}
                  </Title>
                  <Paragraph type="secondary" className="!mb-0">
                    {getLocalizedTemplateText(
                      previewTemplate.description,
                      previewTemplate.description_i18n,
                      previewLocale,
                    ) || t('notificationTemplates.emptyDescription')}
                  </Paragraph>
                </div>
                <Segmented<NotificationTemplateLocale>
                  size="small"
                  value={previewLocale}
                  options={templateLocales.map((locale) => ({
                    label: t(`notificationTemplates.form.localeTabs.${locale === 'zh-CN' ? 'zhCN' : 'enUS'}`),
                    value: locale,
                  }))}
                  onChange={(value) => {
                    const locale = value as NotificationTemplateLocale;
                    setPreviewLocale(locale);
                    void handleRunPreview(previewTemplate, previewVariables, locale);
                  }}
                />
              </div>

              {previewData ? (
                previewTemplate.category === 'email' && previewData.preview.html_content
                  ? renderEmailPreviewFrame(previewData.preview.html_content)
                  : renderTemplateContentLines(previewData.preview.content)
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={t('notificationTemplates.preview.empty')}
                />
              )}
            </div>
          </Card>
        ) : (
          <Empty description={t('notificationTemplates.preview.empty')} />
        )}
      </AppModal>
    </div>
  );
};

export default NotificationTemplates;
