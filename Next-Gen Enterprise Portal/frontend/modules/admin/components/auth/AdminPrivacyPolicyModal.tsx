import React from 'react';
import { useTranslation } from 'react-i18next';

import { AppModal, AppButton } from '@/modules/admin/components/ui';
import PrivacyPolicyContent from '@/shared/components/PrivacyPolicyContent';

interface AdminPrivacyPolicyModalProps {
  open: boolean;
  systemConfig: Record<string, string>;
  onClose: () => void;
}

const AdminPrivacyPolicyModal: React.FC<AdminPrivacyPolicyModalProps> = ({
  open,
  systemConfig,
  onClose,
}) => {
  const { t } = useTranslation();

  return (
    <AppModal
      title={t('loginAdmin.privacyPolicyTitle')}
      open={open}
      onCancel={onClose}
      footer={[
        <AppButton key="close" onClick={onClose}>
          {t('loginAdmin.privacyPolicyClose')}
        </AppButton>,
      ]}
      width={700}
      styles={{ body: { maxHeight: '60vh', overflowY: 'auto' } }}
    >
      <PrivacyPolicyContent
        content={systemConfig.privacy_policy}
        emptyText={t('loginAdmin.privacyPolicyEmpty')}
        className="p-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed"
        htmlClassName="[&_a]:text-blue-500 dark:[&_a]:text-blue-400 [&_blockquote]:border-slate-300 dark:[&_blockquote]:border-slate-700 [&_code]:bg-slate-100 dark:[&_code]:bg-slate-800 [&_pre]:bg-slate-100 dark:[&_pre]:bg-slate-800"
      />
    </AppModal>
  );
};

export default AdminPrivacyPolicyModal;
