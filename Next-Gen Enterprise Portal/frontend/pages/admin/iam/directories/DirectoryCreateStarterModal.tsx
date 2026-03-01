import React, { useEffect } from 'react';
import { Form, Input, Modal, Select } from 'antd';
import { useTranslation } from 'react-i18next';
import type { DirectoryCreateStarterValues } from './types';

interface DirectoryCreateStarterModalProps {
  open: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (values: DirectoryCreateStarterValues) => void;
}

const DirectoryCreateStarterModal: React.FC<DirectoryCreateStarterModalProps> = ({
  open,
  loading = false,
  onCancel,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const [form] = Form.useForm<DirectoryCreateStarterValues>();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      type: 'ad',
      name: '',
      remark: '',
    });
  }, [open, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    onConfirm({
      type: values.type,
      name: String(values.name || '').trim(),
      remark: String(values.remark || '').trim() || undefined,
    });
  };

  return (
    <Modal
      title={t('directory.wizard.title')}
      open={open}
      destroyOnHidden
      confirmLoading={loading}
      okText={t('directory.wizard.next')}
      cancelText={t('common.buttons.cancel')}
      onCancel={onCancel}
      onOk={() => void handleOk()}
    >
      <Form<DirectoryCreateStarterValues> form={form} layout="vertical">
        <Form.Item
          name="type"
          label={t('directory.wizard.fields.type')}
          rules={[{ required: true, message: t('directory.wizard.validation.typeRequired') }]}
        >
          <Select
            options={[
              { value: 'ad', label: t('directory.filters.typeAd') },
              { value: 'ldap', label: t('directory.filters.typeLdap') },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="name"
          label={t('directory.wizard.fields.name')}
          rules={[{ required: true, message: t('directory.wizard.validation.nameRequired') }]}
        >
          <Input placeholder={t('directory.wizard.placeholders.name')} maxLength={128} />
        </Form.Item>
        <Form.Item name="remark" label={t('directory.wizard.fields.remark')}>
          <Input.TextArea
            placeholder={t('directory.wizard.placeholders.remark')}
            autoSize={{ minRows: 3, maxRows: 6 }}
            maxLength={500}
            showCount
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default DirectoryCreateStarterModal;
