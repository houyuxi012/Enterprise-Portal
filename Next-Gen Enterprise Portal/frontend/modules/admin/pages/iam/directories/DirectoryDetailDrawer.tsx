import React from 'react';
import Descriptions from 'antd/es/descriptions';
import Drawer from 'antd/es/drawer';
import Tag from 'antd/es/tag';
import Typography from 'antd/es/typography';
import { useTranslation } from 'react-i18next';
import type { DirectoryConfig } from './types';

const { Text } = Typography;

interface DirectoryDetailDrawerProps {
  open: boolean;
  data?: DirectoryConfig | null;
  onClose: () => void;
}

const renderDateTime = (value?: string, locale: string = 'zh-CN') => {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString(locale, { hour12: false });
};

const DirectoryDetailDrawer: React.FC<DirectoryDetailDrawerProps> = ({ open, data, onClose }) => {
  const { t, i18n } = useTranslation();

  return (
    <Drawer
      title={t('directory.detail.title')}
      width={600}
      open={open}
      onClose={onClose}
      destroyOnHidden
    >
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label={t('directory.table.name')}>{data?.name || '-'}</Descriptions.Item>
        <Descriptions.Item label={t('directory.table.type')}>
          {data?.type ? (
            <Tag color="blue">
              {String(data.type).toLowerCase() === 'ad'
                ? t('directory.filters.typeAd')
                : t('directory.filters.typeLdap')}
            </Tag>
          ) : '-'}
        </Descriptions.Item>
        <Descriptions.Item label={t('directory.table.address')}>
          {data ? `${data.host}:${data.port}` : '-'}
        </Descriptions.Item>
        <Descriptions.Item label={t('directory.table.security')}>
          {data?.use_ssl ? <Tag color="green">LDAPS</Tag> : null}
          {data?.start_tls ? <Tag color="cyan">STARTTLS</Tag> : null}
          {!data?.use_ssl && !data?.start_tls ? <Tag>{t('directory.table.securityNone')}</Tag> : null}
        </Descriptions.Item>
        <Descriptions.Item label={t('directory.table.baseDn')}>
          <Text copyable={{ text: data?.base_dn || '' }}>{data?.base_dn || '-'}</Text>
        </Descriptions.Item>
        <Descriptions.Item label={t('directory.form.fields.remark')}>
          {data?.remark || '-'}
        </Descriptions.Item>
        <Descriptions.Item label={t('directory.form.fields.bindDn')}>{data?.bind_dn || '-'}</Descriptions.Item>
        <Descriptions.Item label={t('directory.form.fields.bindPassword')}>
          {data?.has_bind_password ? t('directory.detail.bindPasswordConfigured') : t('directory.detail.bindPasswordNotConfigured')}
        </Descriptions.Item>
        <Descriptions.Item label={t('directory.form.fields.userFilter')}>
          <Text copyable={{ text: data?.user_filter || '' }}>{data?.user_filter || '-'}</Text>
        </Descriptions.Item>
        <Descriptions.Item label={t('directory.form.fields.usernameAttr')}>{data?.username_attr || '-'}</Descriptions.Item>
        <Descriptions.Item label={t('directory.form.fields.emailAttr')}>{data?.email_attr || '-'}</Descriptions.Item>
        <Descriptions.Item label={t('directory.form.fields.displayNameAttr')}>{data?.display_name_attr || '-'}</Descriptions.Item>
        <Descriptions.Item label={t('directory.form.fields.mobileAttr')}>{data?.mobile_attr || '-'}</Descriptions.Item>
        <Descriptions.Item label={t('directory.form.fields.avatarAttr')}>{data?.avatar_attr || '-'}</Descriptions.Item>
        <Descriptions.Item label={t('directory.form.fields.syncMode')}>
          {data?.sync_mode === 'auto' ? t('directory.form.syncMode.auto') : t('directory.form.syncMode.manual')}
        </Descriptions.Item>
        <Descriptions.Item label={t('directory.form.fields.syncIntervalMinutes')}>
          {data?.sync_mode === 'auto'
            ? (data?.sync_interval_minutes ?? 60)
            : t('directory.form.syncMode.manualNoSchedule')}
        </Descriptions.Item>
        <Descriptions.Item label={t('directory.table.status')}>
          {data?.enabled ? <Tag color="success">{t('directory.status.enabled')}</Tag> : <Tag>{t('directory.status.disabled')}</Tag>}
        </Descriptions.Item>
        <Descriptions.Item label={t('directory.table.updatedAt')}>
          {renderDateTime(data?.updated_at, String(i18n.resolvedLanguage || i18n.language || 'zh-CN'))}
        </Descriptions.Item>
      </Descriptions>
    </Drawer>
  );
};

export default DirectoryDetailDrawer;
