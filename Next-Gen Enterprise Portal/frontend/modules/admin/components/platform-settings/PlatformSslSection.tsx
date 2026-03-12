import React from 'react';
import Card from 'antd/es/card';
import Divider from 'antd/es/divider';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import Space from 'antd/es/space';
import Switch from 'antd/es/switch';
import { SaveOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import UploadTriggerButton from '@/modules/admin/components/upload/UploadTriggerButton';
import { AppButton } from '@/modules/admin/components/ui';

interface PlatformSslSectionProps {
  applying: boolean;
  ntpTesting: boolean;
  onSave: () => void;
  onUploadCert: (file: File) => Promise<void> | void;
  onUploadKey: (file: File) => Promise<void> | void;
}

const PlatformSslSection: React.FC<PlatformSslSectionProps> = ({
  applying,
  ntpTesting,
  onSave,
  onUploadCert,
  onUploadKey,
}) => {
  const { t } = useTranslation();

  return (
    <Card className="admin-card">
      <div className="grid grid-cols-1 gap-x-6 md:grid-cols-3">
        <Form.Item
          name="platform_ssl_enabled"
          label={<span className="font-semibold">{t('platformSettingsPage.form.sslEnabled')}</span>}
          valuePropName="checked"
        >
          <Switch size="small" />
        </Form.Item>
      </div>
      <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
        <Form.Item
          name="platform_ssl_certificate"
          label={<span className="font-semibold">{t('platformSettingsPage.form.sslCertificate')}</span>}
        >
          <Input.TextArea rows={7} placeholder={t('platformSettingsPage.form.placeholders.sslCertificate')} />
        </Form.Item>
        <Form.Item
          name="platform_ssl_private_key"
          label={<span className="font-semibold">{t('platformSettingsPage.form.sslPrivateKey')}</span>}
        >
          <Input.TextArea rows={7} placeholder={t('platformSettingsPage.form.placeholders.sslPrivateKey')} />
        </Form.Item>
      </div>

      <Space wrap>
        <UploadTriggerButton
          buttonLabel={t('platformSettingsPage.actions.uploadCert')}
          onSelect={onUploadCert}
        />
        <UploadTriggerButton
          buttonLabel={t('platformSettingsPage.actions.uploadKey')}
          onSelect={onUploadKey}
        />
      </Space>
      <Divider />
      <Space>
        <AppButton
          intent="primary"
          icon={<SaveOutlined />}
          onClick={onSave}
          loading={applying}
          disabled={ntpTesting}
        >
          {t('platformSettingsPage.page.saveButton')}
        </AppButton>
      </Space>
    </Card>
  );
};

export default PlatformSslSection;
