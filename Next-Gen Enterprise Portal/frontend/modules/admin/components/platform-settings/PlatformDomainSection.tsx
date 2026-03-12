import React from 'react';
import Card from 'antd/es/card';
import Divider from 'antd/es/divider';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import Space from 'antd/es/space';
import { SaveOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import { AppButton } from '@/modules/admin/components/ui';

interface PlatformDomainSectionProps {
  applying: boolean;
  ntpTesting: boolean;
  onSave: () => void;
}

const PlatformDomainSection: React.FC<PlatformDomainSectionProps> = ({
  applying,
  ntpTesting,
  onSave,
}) => {
  const { t } = useTranslation();

  return (
    <Card className="admin-card">
      <div className="grid grid-cols-1 gap-x-6 md:grid-cols-3">
        <Form.Item
          name="platform_domain"
          label={<span className="font-semibold">{t('platformSettingsPage.form.platformDomain')}</span>}
        >
          <Input placeholder={t('platformSettingsPage.form.placeholders.platformDomain')} />
        </Form.Item>
        <Form.Item
          name="platform_public_base_url"
          label={<span className="font-semibold">{t('platformSettingsPage.form.publicBaseUrl')}</span>}
        >
          <Input placeholder={t('platformSettingsPage.form.placeholders.publicBaseUrl')} />
        </Form.Item>
        <Form.Item
          name="platform_admin_base_url"
          label={<span className="font-semibold">{t('platformSettingsPage.form.adminBaseUrl')}</span>}
        >
          <Input placeholder={t('platformSettingsPage.form.placeholders.adminBaseUrl')} />
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

export default PlatformDomainSection;
