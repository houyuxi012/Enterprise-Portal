import React from 'react';
import Card from 'antd/es/card';
import Empty from 'antd/es/empty';
import Segmented from 'antd/es/segmented';
import Space from 'antd/es/space';
import Typography from 'antd/es/typography';
import { useTranslation } from 'react-i18next';

import { AppButton, AppModal } from '@/modules/admin/components/ui';
import type {
  NotificationTemplatePreviewResult,
  NotificationTemplateRecord,
} from '@/modules/admin/services/notificationTemplates';
import type {
  NotificationTemplateI18nMap,
  NotificationTemplateLocale,
} from '@/shared/services/api';

const { Paragraph, Title } = Typography;

const normalizeTemplateI18nMap = (value: NotificationTemplateI18nMap | undefined): NotificationTemplateI18nMap => {
  const normalized: NotificationTemplateI18nMap = {};
  (['zh-CN', 'en-US'] as const).forEach((locale) => {
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

interface NotificationTemplatePreviewModalProps {
  open: boolean;
  previewTemplate: NotificationTemplateRecord | null;
  previewLocale: NotificationTemplateLocale;
  previewLoading: boolean;
  previewData: NotificationTemplatePreviewResult | null;
  templateLocales: NotificationTemplateLocale[];
  onCancel: () => void;
  onChangeLocale: (locale: NotificationTemplateLocale) => void;
}

const NotificationTemplatePreviewModal: React.FC<NotificationTemplatePreviewModalProps> = ({
  open,
  previewTemplate,
  previewLocale,
  previewLoading,
  previewData,
  templateLocales,
  onCancel,
  onChangeLocale,
}) => {
  const { t } = useTranslation();

  return (
    <AppModal
      title={t('notificationTemplates.preview.title')}
      open={open}
      onCancel={onCancel}
      width={860}
      footer={(
        <Space wrap>
          <AppButton intent="secondary" onClick={onCancel}>
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
                onChange={(value) => onChangeLocale(value as NotificationTemplateLocale)}
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
  );
};

export default NotificationTemplatePreviewModal;
