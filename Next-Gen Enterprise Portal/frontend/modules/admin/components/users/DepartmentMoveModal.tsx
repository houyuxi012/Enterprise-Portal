import React from 'react';
import Select from 'antd/es/select';
import Space from 'antd/es/space';
import Typography from 'antd/es/typography';
import { useTranslation } from 'react-i18next';

import { AppModal } from '@/modules/admin/components/ui';

const { Text } = Typography;

interface DepartmentOption {
  name: string;
  label: string;
}

interface DepartmentMoveModalProps {
  open: boolean;
  moving: boolean;
  selectedCount: number;
  targetDepartment?: string;
  departmentOptions: DepartmentOption[];
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
  onTargetDepartmentChange: (value: string | undefined) => void;
}

const DepartmentMoveModal: React.FC<DepartmentMoveModalProps> = ({
  open,
  moving,
  selectedCount,
  targetDepartment,
  departmentOptions,
  onCancel,
  onConfirm,
  onTargetDepartmentChange,
}) => {
  const { t } = useTranslation();

  return (
    <AppModal
      title={t('userList.moveModal.title')}
      open={open}
      onCancel={onCancel}
      onOk={() => {
        void onConfirm();
      }}
      confirmLoading={moving}
      okText={t('userList.moveModal.confirm')}
      width={560}
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Text type="secondary">
          {t('userList.moveModal.descPrefix')} <Text strong>{selectedCount}</Text> {t('userList.moveModal.descSuffix')}
        </Text>
        <Select
          showSearch
          allowClear
          placeholder={t('userList.moveModal.placeholder')}
          value={targetDepartment}
          onChange={(value) => onTargetDepartmentChange(value)}
          optionFilterProp="label"
          options={departmentOptions.map((dept) => ({
            value: dept.name,
            label: dept.label,
          }))}
        />
      </Space>
    </AppModal>
  );
};

export default DepartmentMoveModal;
