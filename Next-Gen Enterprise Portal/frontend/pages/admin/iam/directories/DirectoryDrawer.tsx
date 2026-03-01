import React, { useEffect, useMemo, useState } from 'react';
import { ThunderboltOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Steps,
  Switch,
  Typography,
  message,
} from 'antd';
import { useTranslation } from 'react-i18next';
import type {
  DirectoryConfig,
  DirectoryCreatePayload,
  DirectoryCreateStarterValues,
  DirectoryDraftTestPayload,
  DirectoryUpdatePayload,
} from './types';

const { Text } = Typography;

type DrawerMode = 'create' | 'edit';

interface DirectoryDrawerProps {
  open: boolean;
  mode: DrawerMode;
  loading: boolean;
  actionsDisabled?: boolean;
  initialValue?: DirectoryConfig | null;
  createDefaults?: DirectoryCreateStarterValues | null;
  onCancel: () => void;
  onSubmit: (payload: DirectoryCreatePayload | DirectoryUpdatePayload) => Promise<void>;
  onTestConnection?: (payload: DirectoryDraftTestPayload) => Promise<void> | void;
  testLoading?: boolean;
}

interface DirectoryFormValues {
  name?: string;
  type?: 'ldap' | 'ad';
  remark?: string;
  host: string;
  port: number;
  use_ssl: boolean;
  start_tls: boolean;
  bind_dn?: string;
  bind_password?: string;
  clear_bind_password?: boolean;
  base_dn: string;
  user_filter: string;
  username_attr: string;
  email_attr: string;
  display_name_attr: string;
  mobile_attr: string;
  avatar_attr: string;
  sync_mode: 'manual' | 'auto';
  sync_interval_minutes?: number | null;
  enabled: boolean;
}

const DIRECTORY_DEFAULTS = {
  ldap: {
    user_filter: '(&(objectClass=person)(uid={username}))',
    username_attr: 'uid',
    email_attr: 'mail',
    display_name_attr: 'cn',
    mobile_attr: 'mobile',
    avatar_attr: 'thumbnailPhoto',
    port: 389,
  },
  ad: {
    user_filter: '(&(objectClass=user)(sAMAccountName={username}))',
    username_attr: 'sAMAccountName',
    email_attr: 'mail',
    display_name_attr: 'displayName',
    mobile_attr: 'mobile',
    avatar_attr: 'thumbnailPhoto',
    port: 389,
  },
} as const;

const DirectoryDrawer: React.FC<DirectoryDrawerProps> = ({
  open,
  mode,
  loading,
  actionsDisabled = false,
  initialValue,
  createDefaults,
  onCancel,
  onSubmit,
  onTestConnection,
  testLoading = false,
}) => {
  const { t } = useTranslation();
  const [form] = Form.useForm<DirectoryFormValues>();
  const [currentStep, setCurrentStep] = useState(0);
  const stepFieldGroups: Array<Array<keyof DirectoryFormValues>> = [
    ['host', 'port', 'use_ssl', 'start_tls', 'base_dn', 'bind_dn', 'bind_password', 'clear_bind_password'],
    ['user_filter', 'username_attr', 'email_attr', 'display_name_attr', 'mobile_attr', 'avatar_attr'],
    ['enabled'],
  ];

  const title = useMemo(
    () => (mode === 'create' ? t('directory.form.drawer.createTitle') : t('directory.form.drawer.editTitle')),
    [mode, t],
  );

  useEffect(() => {
    if (open) {
      setCurrentStep(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (mode === 'create') {
      const createType = createDefaults?.type || 'ad';
      const defaults = DIRECTORY_DEFAULTS[createType];
      form.setFieldsValue({
        name: createDefaults?.name || '',
        type: createType,
        remark: createDefaults?.remark || '',
        host: '',
        port: defaults.port,
        use_ssl: false,
        start_tls: true,
        bind_dn: '',
        bind_password: '',
        clear_bind_password: false,
        base_dn: '',
        user_filter: defaults.user_filter,
        username_attr: defaults.username_attr,
        email_attr: defaults.email_attr,
        display_name_attr: defaults.display_name_attr,
        mobile_attr: defaults.mobile_attr,
        avatar_attr: defaults.avatar_attr,
        sync_mode: 'manual',
        sync_interval_minutes: 60,
        enabled: true,
      });
      return;
    }

    if (initialValue) {
      form.setFieldsValue({
        host: initialValue.host,
        port: initialValue.port,
        use_ssl: initialValue.use_ssl,
        start_tls: initialValue.start_tls,
        bind_dn: initialValue.bind_dn || '',
        bind_password: '',
        clear_bind_password: false,
        base_dn: initialValue.base_dn,
        user_filter: initialValue.user_filter,
        username_attr: initialValue.username_attr,
        email_attr: initialValue.email_attr,
        display_name_attr: initialValue.display_name_attr,
        mobile_attr: initialValue.mobile_attr || 'mobile',
        avatar_attr: initialValue.avatar_attr || 'thumbnailPhoto',
        sync_mode: initialValue.sync_mode || 'manual',
        sync_interval_minutes: initialValue.sync_interval_minutes ?? 60,
        enabled: initialValue.enabled,
      });
    }
  }, [open, mode, initialValue, form, createDefaults]);

  const handleValuesChange = (changedValues: Partial<DirectoryFormValues>, values: DirectoryFormValues) => {
    if (Object.prototype.hasOwnProperty.call(changedValues, 'use_ssl') && values.use_ssl && values.start_tls) {
      form.setFieldValue('start_tls', false);
      message.warning(t('directory.messages.tlsConflictResolved'));
    }
    if (Object.prototype.hasOwnProperty.call(changedValues, 'start_tls') && values.start_tls && values.use_ssl) {
      form.setFieldValue('use_ssl', false);
      message.warning(t('directory.messages.tlsConflictResolved'));
    }

    if (Object.prototype.hasOwnProperty.call(changedValues, 'use_ssl')) {
      const port = Number(values.port || 0);
      if (values.use_ssl && port === 389) {
        form.setFieldValue('port', 636);
      } else if (!values.use_ssl && port === 636) {
        form.setFieldValue('port', 389);
      }
    }

  };

  const handleFinish = async (values: DirectoryFormValues) => {
    if (values.use_ssl && values.start_tls) {
      message.error(t('directory.messages.tlsConflict'));
      return;
    }

    const payload: DirectoryCreatePayload | DirectoryUpdatePayload = {
      host: values.host.trim(),
      port: Number(values.port),
      use_ssl: Boolean(values.use_ssl),
      start_tls: Boolean(values.start_tls),
      bind_dn: values.bind_dn?.trim() || null,
      base_dn: values.base_dn.trim(),
      user_filter: values.user_filter.trim(),
      username_attr: values.username_attr.trim(),
      email_attr: values.email_attr.trim(),
      display_name_attr: values.display_name_attr.trim(),
      mobile_attr: values.mobile_attr.trim(),
      avatar_attr: values.avatar_attr.trim(),
      sync_mode: values.sync_mode,
      sync_interval_minutes: values.sync_mode === 'auto' ? Number(values.sync_interval_minutes || 60) : null,
      enabled: Boolean(values.enabled),
    };

    if (mode === 'create') {
      (payload as DirectoryCreatePayload).name = String(createDefaults?.name || values.name || '').trim();
      (payload as DirectoryCreatePayload).type = createDefaults?.type || values.type || 'ad';
      (payload as DirectoryCreatePayload).remark = values.remark?.trim() || createDefaults?.remark?.trim() || null;
      (payload as DirectoryCreatePayload).bind_password = values.bind_password?.trim() || null;
    } else {
      if (values.clear_bind_password) {
        (payload as DirectoryUpdatePayload).bind_password = '';
      } else if (values.bind_password?.trim()) {
        (payload as DirectoryUpdatePayload).bind_password = values.bind_password.trim();
      }
    }

    await onSubmit(payload);
  };

  const handleNext = async () => {
    try {
      await form.validateFields(stepFieldGroups[currentStep]);
      setCurrentStep((prev) => Math.min(prev + 1, stepFieldGroups.length - 1));
    } catch {
      // validation error: keep current step
    }
  };

  const handlePrevious = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleTestConnection = async () => {
    if (!onTestConnection) return;
    try {
      await form.validateFields([
        'host',
        'port',
        'use_ssl',
        'start_tls',
        'base_dn',
        'bind_dn',
        'bind_password',
        'user_filter',
        'username_attr',
        'email_attr',
        'display_name_attr',
        'mobile_attr',
        'avatar_attr',
      ]);
      const values = form.getFieldsValue(true) as DirectoryFormValues;
      if (values.use_ssl && values.start_tls) {
        message.error(t('directory.messages.tlsConflict'));
        return;
      }

      const typeValue = (createDefaults?.type || initialValue?.type || values.type || 'ad') as 'ldap' | 'ad';
      const enteredBindPassword = values.bind_password?.trim();
      let bindPasswordForDraft: string | null | undefined;
      if (mode === 'edit') {
        if (values.clear_bind_password) {
          bindPasswordForDraft = '';
        } else if (enteredBindPassword) {
          bindPasswordForDraft = enteredBindPassword;
        }
      } else if (enteredBindPassword) {
        bindPasswordForDraft = enteredBindPassword;
      }

      const payload: DirectoryDraftTestPayload = {
        type: typeValue,
        host: values.host.trim(),
        port: Number(values.port),
        use_ssl: Boolean(values.use_ssl),
        start_tls: Boolean(values.start_tls),
        bind_dn: values.bind_dn?.trim() || null,
        bind_password: bindPasswordForDraft,
        base_dn: values.base_dn.trim(),
        user_filter: values.user_filter.trim(),
        username_attr: values.username_attr.trim(),
        email_attr: values.email_attr.trim(),
        display_name_attr: values.display_name_attr.trim(),
        mobile_attr: values.mobile_attr.trim(),
        avatar_attr: values.avatar_attr.trim(),
      };
      await onTestConnection(payload);
    } catch {
      // validation error handled by form
    }
  };

  return (
    <Modal
      title={title}
      open={open}
      width={760}
      destroyOnHidden
      onCancel={onCancel}
      footer={
        <div className="flex w-full items-center justify-between">
          <div>
            {currentStep === stepFieldGroups.length - 1 && onTestConnection ? (
              <Button
                icon={<ThunderboltOutlined />}
                loading={testLoading}
                disabled={loading || actionsDisabled}
                onClick={() => void handleTestConnection()}
              >
                {t('directory.actions.test')}
              </Button>
            ) : null}
          </div>
          <Space>
            <Button onClick={onCancel}>{t('common.buttons.cancel')}</Button>
            {currentStep > 0 ? (
              <Button onClick={handlePrevious} disabled={loading || actionsDisabled}>
                {t('directory.form.actions.previous')}
              </Button>
            ) : null}
            {currentStep < stepFieldGroups.length - 1 ? (
              <Button type="primary" onClick={() => void handleNext()} disabled={loading || actionsDisabled}>
                {t('directory.form.actions.next')}
              </Button>
            ) : (
              <Button type="primary" disabled={actionsDisabled} loading={loading} onClick={() => form.submit()}>
                {t('common.buttons.save')}
              </Button>
            )}
          </Space>
        </div>
      }
    >
      <Steps
        current={currentStep}
        className="mb-4"
        items={[
          { title: t('directory.form.sections.connection') },
          { title: t('directory.form.sections.mapping') },
          { title: t('directory.form.sections.extra') },
        ]}
      />

      {actionsDisabled ? (
        <Alert
          type="warning"
          showIcon
          message={t('directory.license.alert')}
          className="mb-4"
        />
      ) : null}

      <Form<DirectoryFormValues>
        form={form}
        layout="vertical"
        onValuesChange={handleValuesChange}
        onFinish={handleFinish}
        disabled={loading || actionsDisabled}
      >
        {currentStep === 0 ? (
          <>
            <Card size="small" title={t('directory.form.sections.connection')} className="mb-4">
              <div className="grid grid-cols-2 gap-3">
                <Form.Item
                  label={t('directory.form.fields.host')}
                  name="host"
                  rules={[{ required: true, message: t('directory.form.validation.hostRequired') }]}
                >
                  <Input placeholder={t('directory.form.placeholders.host')} />
                </Form.Item>
                <Form.Item
                  label={t('directory.form.fields.port')}
                  name="port"
                  rules={[{ required: true, message: t('directory.form.validation.portRequired') }]}
                >
                  <InputNumber min={1} max={65535} className="w-full" />
                </Form.Item>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Form.Item label={t('directory.form.fields.useSsl')} name="use_ssl" valuePropName="checked">
                  <Switch />
                </Form.Item>
                <Form.Item label={t('directory.form.fields.startTls')} name="start_tls" valuePropName="checked">
                  <Switch />
                </Form.Item>
              </div>

              <Form.Item
                label={t('directory.form.fields.baseDn')}
                name="base_dn"
                rules={[{ required: true, message: t('directory.form.validation.baseDnRequired') }]}
              >
                <Input placeholder={t('directory.form.placeholders.baseDn')} />
              </Form.Item>

              <Form.Item label={t('directory.form.fields.bindDn')} name="bind_dn">
                <Input placeholder={t('directory.form.placeholders.bindDn')} />
              </Form.Item>
            </Card>

            {mode === 'edit' && initialValue?.has_bind_password ? (
              <Alert
                type="info"
                showIcon
                className="mb-4"
                message={t('directory.form.bindPasswordSetHint')}
              />
            ) : null}

            <Form.Item label={t('directory.form.fields.bindPassword')} name="bind_password">
              <Input.Password
                autoComplete="new-password"
                placeholder={mode === 'edit' ? t('directory.form.placeholders.bindPasswordEdit') : t('directory.form.placeholders.bindPassword')}
              />
            </Form.Item>

            {mode === 'edit' && initialValue?.has_bind_password ? (
              <Form.Item name="clear_bind_password" valuePropName="checked">
                <Checkbox>{t('directory.form.fields.clearBindPassword')}</Checkbox>
              </Form.Item>
            ) : null}
          </>
        ) : null}

        {currentStep === 1 ? (
          <Card size="small" title={t('directory.form.sections.mapping')} className="mb-4">
            <Form.Item
              label={t('directory.form.fields.userFilter')}
              name="user_filter"
              rules={[{ required: true, message: t('directory.form.validation.userFilterRequired') }]}
            >
              <Input placeholder={t('directory.form.placeholders.userFilter')} />
            </Form.Item>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Form.Item label={t('directory.form.fields.usernameAttr')} name="username_attr">
                <Input placeholder={t('directory.form.placeholders.usernameAttr')} />
              </Form.Item>
              <Form.Item label={t('directory.form.fields.emailAttr')} name="email_attr">
                <Input placeholder={t('directory.form.placeholders.emailAttr')} />
              </Form.Item>
              <Form.Item label={t('directory.form.fields.displayNameAttr')} name="display_name_attr">
                <Input placeholder={t('directory.form.placeholders.displayNameAttr')} />
              </Form.Item>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Form.Item label={t('directory.form.fields.mobileAttr')} name="mobile_attr">
                <Input placeholder={t('directory.form.placeholders.mobileAttr')} />
              </Form.Item>
              <Form.Item label={t('directory.form.fields.avatarAttr')} name="avatar_attr">
                <Input placeholder={t('directory.form.placeholders.avatarAttr')} />
              </Form.Item>
            </div>
          </Card>
        ) : null}

        {currentStep === 2 ? (
          <Card size="small" title={t('directory.form.sections.extra')} className="mb-4">
            {mode === 'create' ? (
              <Form.Item label={t('directory.form.fields.remark')} name="remark">
                <Input.TextArea
                  placeholder={t('directory.form.placeholders.remark')}
                  autoSize={{ minRows: 2, maxRows: 4 }}
                  maxLength={500}
                  showCount
                />
              </Form.Item>
            ) : (
              <div className="text-sm text-slate-600">
                {t('directory.form.fields.remark')}：{initialValue?.remark || '-'}
              </div>
            )}

            <Form.Item label={t('directory.form.fields.enabled')} name="enabled" valuePropName="checked">
              <Switch />
            </Form.Item>
            <div className="grid grid-cols-2 gap-3">
              <Form.Item
                label={t('directory.form.fields.syncMode')}
                name="sync_mode"
                rules={[{ required: true, message: t('directory.form.validation.syncModeRequired') }]}
              >
                <Select
                  options={[
                    { value: 'manual', label: t('directory.form.syncMode.manual') },
                    { value: 'auto', label: t('directory.form.syncMode.auto') },
                  ]}
                />
              </Form.Item>
              <Form.Item
                shouldUpdate={(prev, cur) => prev.sync_mode !== cur.sync_mode}
                noStyle
              >
                {({ getFieldValue }) =>
                  getFieldValue('sync_mode') === 'auto' ? (
                    <Form.Item
                      label={t('directory.form.fields.syncIntervalMinutes')}
                      name="sync_interval_minutes"
                      rules={[
                        { required: true, message: t('directory.form.validation.syncIntervalRequired') },
                        {
                          type: 'number',
                          min: 5,
                          max: 10080,
                          message: t('directory.form.validation.syncIntervalRange'),
                        },
                      ]}
                    >
                      <InputNumber min={5} max={10080} className="w-full" />
                    </Form.Item>
                  ) : (
                    <Form.Item label={t('directory.form.fields.syncIntervalMinutes')}>
                      <Input value={t('directory.form.syncMode.manualNoSchedule')} disabled />
                    </Form.Item>
                  )
                }
              </Form.Item>
            </div>
            <Text type="secondary">{t('directory.form.footerHint')}</Text>
          </Card>
        ) : null}
      </Form>
    </Modal>
  );
};

export default DirectoryDrawer;
