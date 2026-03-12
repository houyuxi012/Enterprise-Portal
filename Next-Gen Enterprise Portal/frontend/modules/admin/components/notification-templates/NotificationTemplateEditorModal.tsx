import React from 'react';
import Alert from 'antd/es/alert';
import Card from 'antd/es/card';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import Segmented from 'antd/es/segmented';
import Select from 'antd/es/select';
import Space from 'antd/es/space';
import Switch from 'antd/es/switch';
import Tag from 'antd/es/tag';
import Typography from 'antd/es/typography';
import type { FormInstance } from 'antd/es/form';
import { useTranslation } from 'react-i18next';

import { AppButton, AppForm, AppModal } from '@/modules/admin/components/ui';
import type { NotificationTemplateRecord } from '@/modules/admin/services/notificationTemplates';
import type {
  NotificationTemplateCategory,
  NotificationTemplateLocale,
} from '@/shared/services/api';

const { Text, Title } = Typography;

type TemplateDiagnostics = {
  declaredVariables: string[];
  placeholderVariables: string[];
  invalidDeclaredVariables: string[];
  missingDeclaredVariables: string[];
  unusedDeclaredVariables: string[];
};

interface NotificationTemplateEditorModalProps {
  open: boolean;
  submitting: boolean;
  form: FormInstance;
  editingTemplate: NotificationTemplateRecord | null;
  currentTemplateLocale: NotificationTemplateLocale;
  activeCategory: NotificationTemplateCategory;
  categoryOptions: Array<{ value: NotificationTemplateCategory; label: React.ReactNode }>;
  templateLocales: NotificationTemplateLocale[];
  watchedCategory: NotificationTemplateCategory;
  watchedDefaultLocale: NotificationTemplateLocale;
  liveDiagnostics: TemplateDiagnostics;
  onCancel: () => void;
  onSubmit: () => void;
}

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

const NotificationTemplateEditorModal: React.FC<NotificationTemplateEditorModalProps> = ({
  open,
  submitting,
  form,
  editingTemplate,
  currentTemplateLocale,
  activeCategory,
  categoryOptions,
  templateLocales,
  watchedCategory,
  watchedDefaultLocale,
  liveDiagnostics,
  onCancel,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const [activeLocale, setActiveLocale] = React.useState<NotificationTemplateLocale>(currentTemplateLocale);

  React.useEffect(() => {
    setActiveLocale(currentTemplateLocale);
  }, [currentTemplateLocale, open]);

  const activeLocaleContent = (
    <div className="grid grid-cols-1 gap-4">
      <AppForm.Item
        name={['name_i18n', activeLocale]}
        label={t('notificationTemplates.form.localizedName')}
        extra={<Text type="secondary">{t('notificationTemplates.form.defaultLocaleHint')}</Text>}
      >
        <Input placeholder={t('notificationTemplates.form.localizedNamePlaceholder')} />
      </AppForm.Item>

      <AppForm.Item
        name={['description_i18n', activeLocale]}
        label={t('notificationTemplates.form.localizedDescription')}
      >
        <Input placeholder={t('notificationTemplates.form.localizedDescriptionPlaceholder')} />
      </AppForm.Item>

      {watchedCategory === 'email' && (
        <AppForm.Item
          name={['subject_i18n', activeLocale]}
          label={t('notificationTemplates.form.localizedSubject')}
        >
          <Input placeholder={t('notificationTemplates.form.localizedSubjectPlaceholder')} />
        </AppForm.Item>
      )}

      <AppForm.Item
        name={['content_i18n', activeLocale]}
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
  );

  return (
    <AppModal
      title={editingTemplate ? t('notificationTemplates.modal.editTitle') : t('notificationTemplates.modal.createTitle')}
      open={open}
      onCancel={onCancel}
      confirmLoading={submitting}
      width={760}
      footer={(
        <Space wrap>
          <AppButton intent="secondary" onClick={onCancel}>
            {t('notificationTemplates.actions.cancel')}
          </AppButton>
          <AppButton intent="primary" onClick={onSubmit} loading={submitting}>
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

          <Space direction="vertical" size={16} className="w-full">
            <Segmented
              block
              size="middle"
              value={activeLocale}
              onChange={(value) => setActiveLocale(value as NotificationTemplateLocale)}
              options={templateLocales.map((locale) => ({
                label: (
                  <Space size={6}>
                    <span>{t(`notificationTemplates.form.localeTabs.${locale === 'zh-CN' ? 'zhCN' : 'enUS'}`)}</span>
                    {watchedDefaultLocale === locale && (
                      <Tag color="processing">{t('notificationTemplates.form.defaultFlag')}</Tag>
                    )}
                  </Space>
                ),
                value: locale,
              }))}
            />
            {activeLocaleContent}
          </Space>
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

            {!liveDiagnostics.invalidDeclaredVariables.length
              && !liveDiagnostics.missingDeclaredVariables.length
              && !liveDiagnostics.unusedDeclaredVariables.length && (
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
  );
};

export default NotificationTemplateEditorModal;
