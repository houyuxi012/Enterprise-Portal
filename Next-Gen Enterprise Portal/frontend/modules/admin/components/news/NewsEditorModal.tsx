import React, { useEffect, useMemo, useState } from 'react';
import App from 'antd/es/app';
import Card from 'antd/es/card';
import Checkbox from 'antd/es/checkbox';
import Form from 'antd/es/form';
import Col from 'antd/es/grid/col';
import DatePicker from 'antd/es/date-picker';
import Image from 'antd/es/image';
import Input from 'antd/es/input';
import Row from 'antd/es/grid/row';
import Select from 'antd/es/select';
import { useTranslation } from 'react-i18next';
import type { NewsItem } from '@/types';
import ApiClient from '@/services/api';
import dayjs, { type Dayjs } from 'dayjs';
import { AppForm, AppModal } from '@/modules/admin/components/ui';
import UploadTriggerButton from '@/modules/admin/components/upload/UploadTriggerButton';

const CATEGORY_CODES = ['announcement', 'activity', 'policy', 'culture'] as const;

type NewsFormValues = {
  title: string;
  summary: string;
  category: string;
  date: Dayjs;
  author?: string;
  image: string;
  is_top?: boolean;
  show_in_news_feed?: boolean;
  show_in_news_center_carousel?: boolean;
  show_in_news_center_latest?: boolean;
};

type ApiErrorShape = {
  message?: string;
  response?: {
    data?: {
      detail?: unknown;
    };
  };
};

const resolveErrorMessage = (error: unknown, fallback: string): string => {
  const normalized = (error as ApiErrorShape) || {};
  const detail = normalized.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (detail && typeof detail === 'object') return JSON.stringify(detail);
  if (normalized.message && normalized.message.trim()) return normalized.message;
  return fallback;
};

interface NewsEditorModalProps {
  open: boolean;
  initialNews: NewsItem | null;
  newsItems: NewsItem[];
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
}

const NewsEditorModal: React.FC<NewsEditorModalProps> = ({
  open,
  initialNews,
  newsItems,
  onCancel,
  onSaved,
}) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = AppForm.useForm<NewsFormValues>();
  const [submitLoading, setSubmitLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const carouselSelected = Boolean(Form.useWatch('show_in_news_center_carousel', form));
  const existingCarouselCount = useMemo(
    () =>
      newsItems.filter(
        (item) => item.show_in_news_center_carousel && Number(item.id) !== Number(initialNews?.id),
      ).length,
    [initialNews?.id, newsItems],
  );
  const carouselPromotionLocked = existingCarouselCount >= 4 && !carouselSelected;

  useEffect(() => {
    if (!open) {
      return;
    }

    if (initialNews) {
      form.setFieldsValue({
        ...initialNews,
        date: dayjs(initialNews.date),
      });
      setImageUrl(initialNews.image || '');
      return;
    }

    form.resetFields();
    form.setFieldsValue({
      category: 'announcement',
      date: dayjs(),
      author: 'Admin',
      image: '',
      show_in_news_feed: false,
      show_in_news_center_carousel: false,
      show_in_news_center_latest: false,
    });
    setImageUrl('');
  }, [form, initialNews, open]);

  const handleSubmit = async (values: NewsFormValues) => {
    try {
      setSubmitLoading(true);
      if (values.show_in_news_center_carousel && existingCarouselCount >= 4 && !initialNews?.show_in_news_center_carousel) {
        message.error(t('newsList.form.validation.carouselLimitReached'));
        return;
      }
      const payload = {
        ...values,
        date: values.date.format('YYYY-MM-DD'),
      };

      if (initialNews) {
        await ApiClient.updateNews(Number(initialNews.id), payload as Partial<NewsItem>);
        message.success(t('newsList.messages.updateSuccess'));
      } else {
        await ApiClient.createNews(payload as Partial<NewsItem>);
        message.success(t('newsList.messages.createSuccess'));
      }

      await onSaved();
    } catch (error: unknown) {
      const errorMsg = resolveErrorMessage(error, t('newsList.messages.unknownError'));
      message.error(t('newsList.messages.actionFailed', { reason: errorMsg }));
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <AppModal
      title={initialNews ? t('newsList.modal.editTitle') : t('newsList.modal.createTitle')}
      open={open}
      onOk={() => form.submit()}
      onCancel={onCancel}
      confirmLoading={submitLoading}
      width={960}
    >
      <AppForm form={form} onFinish={handleSubmit} layout="vertical">
        <AppForm.Item name="author" hidden>
          <Input />
        </AppForm.Item>
        <Row gutter={24}>
          <Col xs={24} md={8}>
            <Card size="small" className="admin-card-subtle">
              <AppForm.Item label={t('newsList.form.cover')} help={t('newsList.form.coverHint')}>
                <AppForm.Item name="image" rules={[{ required: true, message: t('newsList.form.validation.imageRequired') }]} noStyle>
                  <Input hidden />
                </AppForm.Item>
                <Card size="small" className="admin-card-subtle" styles={{ body: { padding: 12 } }}>
                  <div className="flex flex-col items-center gap-4">
                    {imageUrl ? (
                      <Image
                        src={imageUrl}
                        alt={t('newsList.table.previewAlt')}
                        style={{ maxHeight: 180, objectFit: 'cover', borderRadius: 8 }}
                      />
                    ) : (
                      <div className="flex h-40 w-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
                        {t('newsList.form.coverHint')}
                      </div>
                    )}
                    <UploadTriggerButton
                      buttonLabel={t('newsList.form.uploadCover')}
                      loading={submitLoading}
                      onSelect={async (file) => {
                        try {
                          const url = await ApiClient.uploadImage(file);
                          form.setFieldsValue({ image: url });
                          setImageUrl(url);
                          message.success(t('newsList.messages.uploadSuccess'));
                        } catch {
                          message.error(t('newsList.messages.uploadFailed'));
                        }
                      }}
                    />
                  </div>
                </Card>
              </AppForm.Item>

              <Card size="small" className="admin-card-subtle" styles={{ body: { padding: 12 } }}>
                <AppForm.Item label={t('newsList.form.topPromotion')} extra={t('newsList.form.topPromotionHint')} className="mb-0">
                  <div className="space-y-3">
                    <AppForm.Item name="show_in_news_feed" valuePropName="checked" className="mb-0">
                      <Checkbox>{t('newsList.form.promotionTargets.show_in_news_feed')}</Checkbox>
                    </AppForm.Item>
                    <AppForm.Item
                      name="show_in_news_center_carousel"
                      valuePropName="checked"
                      className="mb-0"
                      extra={carouselPromotionLocked ? t('newsList.form.validation.carouselLimitReached') : undefined}
                    >
                      <Checkbox disabled={carouselPromotionLocked}>
                        {t('newsList.form.promotionTargets.show_in_news_center_carousel')}
                      </Checkbox>
                    </AppForm.Item>
                    <AppForm.Item name="show_in_news_center_latest" valuePropName="checked" className="mb-0">
                      <Checkbox>{t('newsList.form.promotionTargets.show_in_news_center_latest')}</Checkbox>
                    </AppForm.Item>
                  </div>
                </AppForm.Item>
              </Card>
            </Card>
          </Col>

          <Col xs={24} md={16}>
            <Card size="small" className="admin-card-subtle">
              <AppForm.Item name="title" label={t('newsList.form.title')} rules={[{ required: true, message: t('newsList.form.validation.titleRequired') }]}>
                <Input placeholder={t('newsList.form.placeholders.title')} />
              </AppForm.Item>

              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <AppForm.Item name="category" label={t('newsList.form.category')} rules={[{ required: true, message: t('newsList.form.validation.categoryRequired') }]}>
                    <Select placeholder={t('newsList.form.placeholders.category')}>
                      {CATEGORY_CODES.map((code) => (
                        <Select.Option key={code} value={code}>
                          {t(`newsList.categories.${code}`)}
                        </Select.Option>
                      ))}
                    </Select>
                  </AppForm.Item>
                </Col>
                <Col xs={24} md={12}>
                  <AppForm.Item name="date" label={t('newsList.form.publishDate')} rules={[{ required: true, message: t('newsList.form.validation.dateRequired') }]}>
                    <DatePicker style={{ width: '100%' }} />
                  </AppForm.Item>
                </Col>
              </Row>

              <Card size="small" className="admin-card-subtle">
                <AppForm.Item name="summary" label={t('newsList.form.summary')} rules={[{ required: true, message: t('newsList.form.validation.summaryRequired') }]} className="mb-0">
                  <Input.TextArea rows={6} placeholder={t('newsList.form.placeholders.summary')} maxLength={200} showCount />
                </AppForm.Item>
              </Card>
            </Card>
          </Col>
        </Row>
      </AppForm>
    </AppModal>
  );
};

export default NewsEditorModal;
