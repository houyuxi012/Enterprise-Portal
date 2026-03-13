import React from 'react';
import Card from 'antd/es/card';
import Empty from 'antd/es/empty';
import Space from 'antd/es/space';
import Typography from 'antd/es/typography';
import { useTranslation } from 'react-i18next';

import { AppPageHeader } from '@/modules/admin/components/ui';

const { Paragraph, Text } = Typography;

const ProcessMonitoring: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="admin-page admin-page-spaced">
      <AppPageHeader
        title={t('processMonitoring.page.title')}
        subtitle={t('processMonitoring.page.subtitle')}
      />

      <Card className="admin-card">
        <Empty description={t('processMonitoring.empty.title')}>
          <Space direction="vertical" size={8} style={{ textAlign: 'center' }}>
            <Paragraph style={{ margin: 0 }}>
              {t('processMonitoring.empty.description')}
            </Paragraph>
            <Text type="secondary">{t('processMonitoring.empty.hint')}</Text>
          </Space>
        </Empty>
      </Card>
    </div>
  );
};

export default ProcessMonitoring;
