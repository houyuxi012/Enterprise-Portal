import React from 'react';
import { Alert, Descriptions, Modal, Space, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import type { DirectoryTestResponse } from './types';

const { Text } = Typography;

interface DirectoryTestModalProps {
  open: boolean;
  loading: boolean;
  error?: { code?: string; message?: string } | null;
  result?: DirectoryTestResponse | null;
  onClose: () => void;
}

const DirectoryTestModal: React.FC<DirectoryTestModalProps> = ({
  open,
  loading,
  error,
  result,
  onClose,
}) => {
  const { t } = useTranslation();
  const hasSuccess = !!result?.success;
  const detailJson = JSON.stringify(
    {
      success: Boolean(result?.success),
      message: result?.message || error?.message,
      code: error?.code,
      matched_dn: result?.matched_dn || null,
      attributes: result?.attributes || {},
    },
    null,
    2,
  );

  return (
    <Modal
      title={t('directory.test.title')}
      open={open}
      onCancel={onClose}
      onOk={onClose}
      okText={t('common.buttons.confirm')}
      cancelButtonProps={{ style: { display: 'none' } }}
      confirmLoading={loading}
      width={760}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {loading ? (
          <Alert type="info" showIcon message={t('directory.test.running')} />
        ) : hasSuccess ? (
          <Alert type="success" showIcon message={t('directory.test.success')} description={result?.message} />
        ) : (
          <Alert
            type="error"
            showIcon
            message={t('directory.test.failed')}
            description={`${error?.code || 'UNKNOWN_ERROR'}: ${error?.message || t('directory.messages.unknownError')}`}
          />
        )}

        {!loading && hasSuccess ? (
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label={t('directory.test.server')} span={2}>
              {result?.attributes?.server || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('directory.test.tlsMode')}>
              {result?.attributes?.tls_mode || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('directory.test.baseDn')}>
              {result?.attributes?.base_dn || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('directory.test.matchedDn')} span={2}>
              {result?.matched_dn || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('directory.test.username')}>
              {result?.attributes?.username || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('directory.test.email')}>
              {result?.attributes?.email || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('directory.test.displayName')} span={2}>
              {result?.attributes?.display_name || '-'}
            </Descriptions.Item>
          </Descriptions>
        ) : null}

        {!loading ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="mb-2 flex items-center justify-between">
              <Text type="secondary">{t('directory.test.rawResult')}</Text>
              <Text copyable={{ text: detailJson }} />
            </div>
            <pre className="m-0 max-h-56 overflow-auto text-xs text-slate-700">{detailJson}</pre>
          </div>
        ) : null}
      </Space>
    </Modal>
  );
};

export default DirectoryTestModal;
