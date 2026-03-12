import React from 'react';
import Card from 'antd/es/card';
import Divider from 'antd/es/divider';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import InputNumber from 'antd/es/input-number';
import DatePicker from 'antd/es/date-picker';
import Space from 'antd/es/space';
import Switch from 'antd/es/switch';
import { SaveOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import { AppButton } from '@/modules/admin/components/ui';

interface PlatformNtpSectionProps {
  applying: boolean;
  ntpTesting: boolean;
  onSave: () => void;
  onTest: () => void;
}

const PlatformNtpSection: React.FC<PlatformNtpSectionProps> = ({
  applying,
  ntpTesting,
  onSave,
  onTest,
}) => {
  const { t } = useTranslation();

  return (
    <Card className="admin-card">
      <div className="grid grid-cols-1 gap-x-6 md:grid-cols-4">
        <Form.Item
          name="platform_ntp_enabled"
          label={<span className="font-semibold">{t('platformSettingsPage.form.ntpEnabled')}</span>}
          valuePropName="checked"
        >
          <Switch size="small" />
        </Form.Item>
        <Form.Item
          name="platform_ntp_server"
          label={<span className="font-semibold">{t('platformSettingsPage.form.ntpServer')}</span>}
        >
          <Input placeholder={t('platformSettingsPage.form.placeholders.ntpServer')} />
        </Form.Item>
        <Form.Item
          name="platform_ntp_port"
          label={<span className="font-semibold">{t('platformSettingsPage.form.ntpPort')}</span>}
        >
          <InputNumber min={1} max={65535} className="w-full" />
        </Form.Item>
        <Form.Item
          name="platform_ntp_sync_interval_minutes"
          label={<span className="font-semibold">{t('platformSettingsPage.form.ntpSyncInterval')}</span>}
        >
          <InputNumber min={1} max={10080} className="w-full" />
        </Form.Item>
        <Form.Item noStyle dependencies={['platform_ntp_enabled']}>
          {({ getFieldValue }) => {
            const isNtpEnabled = getFieldValue('platform_ntp_enabled');
            return (
              <Form.Item
                name="platform_ntp_manual_time"
                label={<span className="font-semibold">{t('platformSettingsPage.form.manualTime')}</span>}
              >
                <DatePicker
                  showTime
                  className="w-full"
                  disabled={isNtpEnabled}
                  placeholder={t('platformSettingsPage.form.placeholders.manualTime')}
                  format="YYYY-MM-DD HH:mm:ss"
                />
              </Form.Item>
            );
          }}
        </Form.Item>
      </div>
      <Divider />
      <Space>
        <AppButton
          intent="secondary"
          onClick={onTest}
          loading={ntpTesting}
          disabled={applying}
        >
          {t('platformSettingsPage.actions.testNtp')}
        </AppButton>
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

export default PlatformNtpSection;
