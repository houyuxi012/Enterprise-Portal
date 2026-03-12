import React, { useEffect, useState } from 'react';
import App from 'antd/es/app';
import Card from 'antd/es/card';
import Image from 'antd/es/image';
import Input from 'antd/es/input';
import InputNumber from 'antd/es/input-number';
import Select from 'antd/es/select';
import Space from 'antd/es/space';
import { AppstoreOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { QuickToolDTO, QuickToolUpsertPayload } from '@/services/api';
import ApiClient from '@/services/api';
import { AppForm, AppModal } from '@/modules/admin/components/ui';
import UploadTriggerButton from '@/modules/admin/components/upload/UploadTriggerButton';

const CATEGORY_CODES = [
  'administration',
  'it',
  'finance',
  'hr',
  'engineering',
  'design',
  'marketing',
  'legal',
  'general',
  'other',
] as const;

interface ToolEditorModalProps {
  open: boolean;
  initialTool: QuickToolDTO | null;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
}

const ToolEditorModal: React.FC<ToolEditorModalProps> = ({
  open,
  initialTool,
  onCancel,
  onSaved,
}) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = AppForm.useForm<QuickToolUpsertPayload>();
  const [submitLoading, setSubmitLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    if (!open) {
      return;
    }

    if (initialTool) {
      form.setFieldsValue(initialTool);
      setImageUrl(initialTool.image || '');
      return;
    }

    form.resetFields();
    form.setFieldsValue({
      category: 'general',
      image: '',
    });
    setImageUrl('');
  }, [form, initialTool, open]);

  const handleSubmit = async (values: QuickToolUpsertPayload) => {
    const payload: QuickToolUpsertPayload = {
      ...values,
      image: values.image ?? initialTool?.image,
    };

    try {
      setSubmitLoading(true);
      if (initialTool) {
        await ApiClient.updateTool(initialTool.id, payload);
        message.success(t('toolList.messages.updateSuccess'));
      } else {
        await ApiClient.createTool(payload);
        message.success(t('toolList.messages.createSuccess'));
      }
      await onSaved();
    } catch {
      message.error(t('toolList.messages.actionFailed'));
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <AppModal
      title={initialTool ? t('toolList.modal.editTitle') : t('toolList.modal.createTitle')}
      open={open}
      onOk={() => form.submit()}
      onCancel={onCancel}
      confirmLoading={submitLoading}
    >
      <AppForm form={form} onFinish={handleSubmit}>
        <AppForm.Item label={t('toolList.form.icon')} help={t('toolList.form.iconHint')}>
          <AppForm.Item name="image" noStyle>
            <Input hidden />
          </AppForm.Item>
          <Card size="small" className="admin-card-subtle" styles={{ body: { padding: 12 } }}>
            <div className="flex flex-col items-center gap-4">
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt={t('toolList.table.previewAlt')}
                  style={{ maxHeight: 128, objectFit: 'contain', borderRadius: 8 }}
                />
              ) : (
                <div className="flex h-32 w-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
                  {t('toolList.form.iconHint')}
                </div>
              )}
              <UploadTriggerButton
                buttonLabel={t('toolList.form.uploadIcon')}
                loading={submitLoading}
                onSelect={async (file) => {
                  try {
                    const url = await ApiClient.uploadImage(file);
                    form.setFieldsValue({ image: url });
                    setImageUrl(url);
                    message.success(t('toolList.messages.uploadSuccess'));
                  } catch {
                    message.error(t('toolList.messages.uploadFailed'));
                  }
                }}
              />
            </div>
          </Card>
        </AppForm.Item>

        <Card size="small" className="admin-card-subtle">
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <AppForm.Item name="name" label={t('toolList.form.name')} rules={[{ required: true, message: t('toolList.form.validation.nameRequired') }]}>
              <Input placeholder={t('toolList.form.placeholders.name')} />
            </AppForm.Item>
            <AppForm.Item name="url" label={t('toolList.form.url')} rules={[{ required: true, message: t('toolList.form.validation.urlRequired') }]}>
              <Input placeholder={t('toolList.form.placeholders.url')} />
            </AppForm.Item>
            <Space size={16} style={{ width: '100%' }} align="start">
              <div style={{ flex: 1 }}>
                <AppForm.Item name="category" label={t('toolList.form.category')}>
                  <Select placeholder={t('toolList.form.placeholders.category')}>
                    {CATEGORY_CODES.map((code) => (
                      <Select.Option key={code} value={code}>
                        {t(`toolList.categories.${code}`)}
                      </Select.Option>
                    ))}
                  </Select>
                </AppForm.Item>
              </div>
              <div style={{ flex: 1 }}>
                <AppForm.Item name="sort_order" label={t('toolList.form.sortOrder')}>
                  <InputNumber style={{ width: '100%' }} min={0} placeholder={t('toolList.form.placeholders.sortOrder')} />
                </AppForm.Item>
              </div>
            </Space>
            <AppForm.Item name="description" label={t('toolList.form.description')}>
              <Input.TextArea rows={3} placeholder={t('toolList.form.placeholders.description')} />
            </AppForm.Item>
          </Space>
        </Card>
      </AppForm>
    </AppModal>
  );
};

export default ToolEditorModal;
