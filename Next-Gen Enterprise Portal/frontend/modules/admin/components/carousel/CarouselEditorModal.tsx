import React, { useEffect, useState } from 'react';
import App from 'antd/es/app';
import Card from 'antd/es/card';
import Col from 'antd/es/grid/col';
import Image from 'antd/es/image';
import Input from 'antd/es/input';
import InputNumber from 'antd/es/input-number';
import Row from 'antd/es/grid/row';
import Switch from 'antd/es/switch';
import { useTranslation } from 'react-i18next';
import type { CarouselItem } from '@/types';
import ApiClient from '@/services/api';
import { AppForm, AppModal } from '@/modules/admin/components/ui';
import UploadTriggerButton from '@/modules/admin/components/upload/UploadTriggerButton';

interface CarouselEditorModalProps {
  open: boolean;
  initialItem: CarouselItem | null;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
}

const CarouselEditorModal: React.FC<CarouselEditorModalProps> = ({
  open,
  initialItem,
  onCancel,
  onSaved,
}) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = AppForm.useForm();
  const [imageUrl, setImageUrl] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (initialItem) {
      setImageUrl(initialItem.image);
      form.setFieldsValue(initialItem);
      return;
    }

    setImageUrl('');
    form.resetFields();
  }, [form, initialItem, open]);

  const handleSubmit = async (values: any) => {
    try {
      setSubmitLoading(true);
      const payload = {
        ...values,
        image: imageUrl,
      };

      if (initialItem) {
        await ApiClient.updateCarouselItem(initialItem.id, payload);
        message.success(t('carouselList.messages.updateSuccess'));
      } else {
        await ApiClient.createCarouselItem(payload);
        message.success(t('carouselList.messages.createSuccess'));
      }

      await onSaved();
    } catch (error: any) {
      const errorMsg = error?.response?.data?.detail || error?.message || t('carouselList.messages.unknownError');
      message.error(t('carouselList.messages.actionFailed', { reason: typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg }));
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <AppModal
      title={initialItem ? t('carouselList.modal.editTitle') : t('carouselList.modal.createTitle')}
      open={open}
      onOk={() => form.submit()}
      onCancel={onCancel}
      confirmLoading={submitLoading}
    >
      <AppForm form={form} onFinish={handleSubmit}>
        <AppForm.Item label={t('carouselList.form.title')} name="title" rules={[{ required: true, message: t('carouselList.form.validation.titleRequired') }]}>
          <Input placeholder={t('carouselList.form.placeholders.title')} />
        </AppForm.Item>
        <Card size="small" className="admin-card-subtle">
          <AppForm.Item label={t('carouselList.form.image')}>
            <div className="flex flex-col items-start gap-4">
              {imageUrl ? (
                <Image src={imageUrl} alt={t('carouselList.table.previewAlt')} width={120} preview={false} />
              ) : (
                <div className="flex h-32 w-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
                  {t('carouselList.form.upload')}
                </div>
              )}
              <UploadTriggerButton
                buttonLabel={t('carouselList.form.upload')}
                loading={submitLoading}
                onSelect={async (file) => {
                  try {
                    const url = await ApiClient.uploadImage(file);
                    setImageUrl(url);
                    message.success(t('carouselList.messages.uploadSuccess'));
                  } catch {
                    message.error(t('carouselList.messages.uploadFailed'));
                  }
                }}
              />
            </div>
          </AppForm.Item>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <AppForm.Item label={t('carouselList.form.badge')} name="badge" rules={[{ required: true, message: t('carouselList.form.validation.badgeRequired') }]}>
                <Input placeholder={t('carouselList.form.placeholders.badge')} />
              </AppForm.Item>
            </Col>
            <Col xs={24} md={12}>
              <AppForm.Item label={t('carouselList.form.url')} name="url" rules={[{ required: true, message: t('carouselList.form.validation.urlRequired') }]}>
                <Input placeholder={t('carouselList.form.placeholders.url')} />
              </AppForm.Item>
            </Col>
            <Col xs={24} md={12}>
              <AppForm.Item label={t('carouselList.form.sortOrder')} name="sort_order" initialValue={0}>
                <InputNumber style={{ width: '100%' }} min={0} />
              </AppForm.Item>
            </Col>
            <Col xs={24} md={12}>
              <AppForm.Item label={t('carouselList.form.visible')} name="is_active" valuePropName="checked" initialValue={true}>
                <Switch checkedChildren={t('carouselList.status.show')} unCheckedChildren={t('carouselList.status.hide')} />
              </AppForm.Item>
            </Col>
          </Row>
        </Card>
      </AppForm>
    </AppModal>
  );
};

export default CarouselEditorModal;
