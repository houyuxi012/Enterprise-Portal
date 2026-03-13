import React from 'react';
import Card from 'antd/es/card';
import Empty from 'antd/es/empty';
import Space from 'antd/es/space';
import Typography from 'antd/es/typography';
import { useTranslation } from 'react-i18next';

import { AppPageHeader } from '@/modules/admin/components/ui';

const { Paragraph, Text } = Typography;

const ProcessIntegration: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="admin-page admin-page-spaced">
      <AppPageHeader
        title={t('processIntegration.page.title')}
        subtitle={t('processIntegration.page.subtitle')}
      />

      <Card className="admin-card">
        <Empty description={t('processIntegration.empty.title')}>
          <Space direction="vertical" size={8} style={{ textAlign: 'center' }}>
            <Paragraph style={{ margin: 0 }}>
              {t('processIntegration.empty.description')}
            </Paragraph>
            <Text type="secondary">{t('processIntegration.empty.hint')}</Text>
          </Space>
        </Empty>
      </Card>
    </div>
  );
};

export default ProcessIntegration;
