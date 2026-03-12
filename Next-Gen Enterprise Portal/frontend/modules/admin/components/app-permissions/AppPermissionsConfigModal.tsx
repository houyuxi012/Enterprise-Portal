import React from 'react';
import Card from 'antd/es/card';
import Select from 'antd/es/select';
import Space from 'antd/es/space';
import Typography from 'antd/es/typography';
import { InfoCircleOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { AppModal } from '@/modules/admin/components/ui';

type DepartmentOption = {
  label: string;
  value: string;
};

interface AppPermissionsConfigModalProps {
  open: boolean;
  toolName: string;
  saving: boolean;
  departmentOptions: DepartmentOption[];
  selectedDepartments: string[];
  onChange: (value: string[]) => void;
  onOk: () => void;
  onCancel: () => void;
}

const { Text } = Typography;

const AppPermissionsConfigModal: React.FC<AppPermissionsConfigModalProps> = ({
  open,
  toolName,
  saving,
  departmentOptions,
  selectedDepartments,
  onChange,
  onOk,
  onCancel,
}) => {
  const { t } = useTranslation();

  return (
    <AppModal
      title={
        <Space size="small">
          <SafetyCertificateOutlined />
          <span>{t('appPermissions.modal.title', { name: toolName || '-' })}</span>
        </Space>
      }
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      confirmLoading={saving}
      width={600}
    >
      <div className="py-4">
        <Card size="small" className="admin-card-subtle mb-4">
          <Space size="small">
            <InfoCircleOutlined />
            <Text type="secondary">
              {t('appPermissions.modal.publicHintPrefix')}
              <Text strong>{t('appPermissions.modal.publicHintBold')}</Text>
              {t('appPermissions.modal.publicHintSuffix')}
            </Text>
          </Space>
        </Card>
        <Text type="secondary">{t('appPermissions.modal.selectDepartments')}</Text>
        <Select
          style={{ width: '100%' }}
          value={selectedDepartments}
          options={departmentOptions}
          placeholder={t('appPermissions.modal.departmentPlaceholder')}
          mode="multiple"
          showSearch
          optionFilterProp="label"
          onChange={(newValue) => onChange(newValue as string[])}
          allowClear
        />
      </div>
    </AppModal>
  );
};

export default AppPermissionsConfigModal;
