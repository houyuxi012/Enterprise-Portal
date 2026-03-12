import React from 'react';
import Card from 'antd/es/card';
import Divider from 'antd/es/divider';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import InputNumber from 'antd/es/input-number';
import Select from 'antd/es/select';
import Space from 'antd/es/space';
import Switch from 'antd/es/switch';
import { SaveOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import { AppButton } from '@/modules/admin/components/ui';

interface PlatformSnmpSectionProps {
  applying: boolean;
  ntpTesting: boolean;
  onSave: () => void;
}

const PlatformSnmpSection: React.FC<PlatformSnmpSectionProps> = ({
  applying,
  ntpTesting,
  onSave,
}) => {
  const { t } = useTranslation();

  return (
    <Card className="admin-card">
      <div className="grid grid-cols-1 gap-x-6 md:grid-cols-4">
        <Form.Item
          name="platform_snmp_enabled"
          label={<span className="font-semibold">{t('platformSettingsPage.form.snmpEnabled')}</span>}
          valuePropName="checked"
        >
          <Switch size="small" />
        </Form.Item>
        <Form.Item
          name="platform_snmp_host"
          label={<span className="font-semibold">{t('platformSettingsPage.form.snmpHost')}</span>}
        >
          <Input placeholder={t('platformSettingsPage.form.placeholders.snmpHost')} />
        </Form.Item>
        <Form.Item
          name="platform_snmp_port"
          label={<span className="font-semibold">{t('platformSettingsPage.form.snmpPort')}</span>}
        >
          <InputNumber min={1} max={65535} className="w-full" />
        </Form.Item>
        <Form.Item
          name="platform_snmp_version"
          label={<span className="font-semibold">{t('platformSettingsPage.form.snmpVersion')}</span>}
        >
          <Select
            options={[
              { value: 'v2c', label: 'SNMP v2c' },
              { value: 'v3', label: 'SNMP v3' },
            ]}
          />
        </Form.Item>
      </div>
      <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
        <Form.Item
          name="platform_snmp_community"
          label={<span className="font-semibold">{t('platformSettingsPage.form.snmpCommunity')}</span>}
          help={t('platformSettingsPage.form.snmpCommunityHelp')}
        >
          <Input.Password placeholder={t('platformSettingsPage.form.placeholders.snmpCommunity')} />
        </Form.Item>
      </div>
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

export default PlatformSnmpSection;
