import React, { useEffect, useMemo, useState } from 'react';
import {
  ApiOutlined,
  CloudServerOutlined,
  DeleteOutlined,
  PlusOutlined,
  SafetyOutlined,
  SettingOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Checkbox,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Steps,
  Switch,
  Tooltip,
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

  org_base_dn?: string;
  org_filter?: string;
  org_name_attr?: string;
  group_base_dn?: string;
  group_filter?: string;
  group_name_attr?: string;
  group_desc_attr?: string;

  sync_mode: 'manual' | 'auto';
  sync_interval_minutes?: number | null;
  sync_page_size?: number;
  delete_grace_days?: number;
  delete_whitelist?: string;
  enabled: boolean;
}

const DIRECTORY_DEFAULTS = {
  ldap: {
    user_filter: '(&(objectClass=inetOrgPerson)(uid={username}))',
    username_attr: 'uid',
    email_attr: 'mail',
    display_name_attr: 'cn',
    mobile_attr: 'mobile',
    avatar_attr: 'jpegPhoto',
    org_filter: '(|(objectClass=organizationalUnit)(objectClass=organization))',
    org_name_attr: 'ou',
    group_filter: '(|(objectClass=groupOfNames)(objectClass=groupOfUniqueNames)(objectClass=posixGroup))',
    group_name_attr: 'cn',
    port: 389,
    sync_page_size: 1000,
  },
  ad: {
    user_filter: '(&(objectClass=user)(sAMAccountName={username}))',
    username_attr: 'sAMAccountName',
    email_attr: 'mail',
    display_name_attr: 'displayName',
    mobile_attr: 'mobile',
    avatar_attr: 'thumbnailPhoto',
    org_filter: '(objectClass=organizationalUnit)',
    org_name_attr: 'ou',
    group_filter: '(objectClass=group)',
    group_name_attr: 'cn',
    port: 389,
    sync_page_size: 1000,
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
    ['org_base_dn', 'org_filter', 'org_name_attr', 'group_base_dn', 'group_filter', 'group_name_attr', 'group_desc_attr'],
    ['enabled', 'sync_mode', 'sync_interval_minutes', 'sync_page_size'],
  ];

  const title = useMemo(
    () => (mode === 'create' ? t('directory.form.drawer.createTitle') : t('directory.form.drawer.editTitle')),
    [mode, t],
  );

  useEffect(() => {
    if (open) setCurrentStep(0);
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
        org_base_dn: '',
        org_filter: defaults.org_filter,
        org_name_attr: defaults.org_name_attr,
        group_base_dn: '',
        group_filter: defaults.group_filter,
        group_name_attr: defaults.group_name_attr,
        group_desc_attr: 'description',
        sync_mode: 'manual',
        sync_interval_minutes: 60,
        sync_page_size: defaults.sync_page_size,
        delete_grace_days: 7,
        delete_whitelist: '[]',
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
        org_base_dn: initialValue.org_base_dn || '',
        org_filter: initialValue.org_filter || (initialValue.type === 'ad' ? DIRECTORY_DEFAULTS.ad.org_filter : DIRECTORY_DEFAULTS.ldap.org_filter),
        org_name_attr: initialValue.org_name_attr || 'ou',
        group_base_dn: initialValue.group_base_dn || '',
        group_filter: initialValue.group_filter || (initialValue.type === 'ad' ? DIRECTORY_DEFAULTS.ad.group_filter : DIRECTORY_DEFAULTS.ldap.group_filter),
        group_name_attr: initialValue.group_name_attr || 'cn',
        group_desc_attr: initialValue.group_desc_attr || 'description',
        sync_mode: initialValue.sync_mode || 'manual',
        sync_interval_minutes: initialValue.sync_interval_minutes ?? 60,
        sync_page_size: initialValue.sync_page_size ?? 1000,
        delete_grace_days: initialValue.delete_grace_days ?? 7,
        delete_whitelist: initialValue.delete_whitelist || '[]',
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
      if (values.use_ssl && port === 389) form.setFieldValue('port', 636);
      else if (!values.use_ssl && port === 636) form.setFieldValue('port', 389);
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
      org_base_dn: values.org_base_dn?.trim() || null,
      org_filter: values.org_filter?.trim() || null,
      org_name_attr: values.org_name_attr?.trim() || null,
      group_base_dn: values.group_base_dn?.trim() || null,
      group_filter: values.group_filter?.trim() || null,
      group_name_attr: values.group_name_attr?.trim() || null,
      group_desc_attr: values.group_desc_attr?.trim() || null,
      sync_mode: values.sync_mode,
      sync_interval_minutes: values.sync_mode === 'auto' ? Number(values.sync_interval_minutes || 60) : null,
      sync_page_size: values.sync_page_size ? Number(values.sync_page_size) : 1000,
      delete_grace_days: values.delete_grace_days ?? 7,
      delete_whitelist: values.delete_whitelist || '[]',
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
        'host', 'port', 'use_ssl', 'start_tls', 'base_dn', 'bind_dn', 'bind_password',
        'user_filter', 'username_attr', 'email_attr', 'display_name_attr', 'mobile_attr', 'avatar_attr',
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
        if (values.clear_bind_password) bindPasswordForDraft = '';
        else if (enteredBindPassword) bindPasswordForDraft = enteredBindPassword;
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

  const stepItems = [
    { title: t('directory.form.sections.connection'), icon: <ApiOutlined /> },
    { title: t('directory.form.sections.userMapping', '用户映射'), icon: <TeamOutlined /> },
    { title: t('directory.form.sections.orgMapping', '组织映射'), icon: <CloudServerOutlined /> },
    { title: t('directory.form.sections.extra', '扩展配置'), icon: <SettingOutlined /> },
  ];

  return (
    <Modal
      title={title}
      open={open}
      width={960}
      destroyOnHidden
      onCancel={onCancel}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
            {currentStep > 0 && (
              <Button onClick={handlePrevious} disabled={loading || actionsDisabled}>
                {t('directory.form.actions.previous')}
              </Button>
            )}
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
        size="small"
        onChange={(step) => { if (step < currentStep) setCurrentStep(step); }}
        style={{ marginTop: 24, marginBottom: 32 }}
        className="px-6 compact-steps"
        items={stepItems}
      />

      {actionsDisabled && (
        <Alert type="warning" showIcon message={t('directory.license.alert')} style={{ marginBottom: 16 }} />
      )}

      <Form<DirectoryFormValues>
        form={form}
        layout="vertical"
        onValuesChange={handleValuesChange}
        onFinish={handleFinish}
        disabled={loading || actionsDisabled}
        size="middle"
      >
        {/* ──── Step 1: 连接配置 ──── */}
        <div style={{ display: currentStep === 0 ? undefined : 'none' }}>

          <Row gutter={16}>
            <Col span={16}>
              <Form.Item
                label={t('directory.form.fields.host')}
                name="host"
                rules={[{ required: true, message: t('directory.form.validation.hostRequired') }]}
              >
                <Input placeholder={t('directory.form.placeholders.host')} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label={t('directory.form.fields.port')}
                name="port"
                rules={[{ required: true, message: t('directory.form.validation.portRequired') }]}
              >
                <InputNumber min={1} max={65535} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label={t('directory.form.fields.useSsl')} name="use_ssl" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={t('directory.form.fields.startTls')} name="start_tls" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label={t('directory.form.fields.baseDn')}
            name="base_dn"
            rules={[{ required: true, message: t('directory.form.validation.baseDnRequired') }]}
          >
            <Input placeholder={t('directory.form.placeholders.baseDn')} />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label={t('directory.form.fields.bindDn')} name="bind_dn">
                <Input placeholder={t('directory.form.placeholders.bindDn')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={t('directory.form.fields.bindPassword')} name="bind_password" style={{ marginBottom: mode === 'edit' && initialValue?.has_bind_password ? 8 : 24 }}>
                <Input.Password
                  autoComplete="new-password"
                  placeholder={mode === 'edit' ? t('directory.form.placeholders.bindPasswordEdit') : t('directory.form.placeholders.bindPassword')}
                />
              </Form.Item>
              {mode === 'edit' && initialValue?.has_bind_password && (
                <Form.Item name="clear_bind_password" valuePropName="checked" style={{ marginBottom: 24 }}>
                  <Checkbox>{t('directory.form.fields.clearBindPassword')}</Checkbox>
                </Form.Item>
              )}
            </Col>
          </Row>
        </div>

        {/* ──── Step 2: 用户映射 ──── */}
        <div style={{ display: currentStep === 1 ? undefined : 'none' }}>


          <Form.Item
            label={t('directory.form.fields.userFilter')}
            name="user_filter"
            rules={[{ required: true, message: t('directory.form.validation.userFilterRequired') }]}
            tooltip={t('directory.form.tooltips.userFilter')}
          >
            <Input placeholder={t('directory.form.placeholders.userFilter')} />
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                label={t('directory.form.fields.usernameAttr')}
                name="username_attr"
                tooltip={t('directory.form.tooltips.usernameAttr')}
              >
                <Input placeholder={t('directory.form.placeholders.usernameAttr')} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('directory.form.fields.emailAttr')} name="email_attr">
                <Input placeholder={t('directory.form.placeholders.emailAttr')} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('directory.form.fields.displayNameAttr')} name="display_name_attr">
                <Input placeholder={t('directory.form.placeholders.displayNameAttr')} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label={t('directory.form.fields.mobileAttr')} name="mobile_attr">
                <Input placeholder={t('directory.form.placeholders.mobileAttr')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label={t('directory.form.fields.avatarAttr')}
                name="avatar_attr"
                tooltip={t('directory.form.tooltips.avatarAttr')}
              >
                <Input placeholder={t('directory.form.placeholders.avatarAttr')} />
              </Form.Item>
            </Col>
          </Row>
        </div>

        {/* ──── Step 3: 组织 & 角色映射 ──── */}
        <div style={{ display: currentStep === 2 ? undefined : 'none' }}>


          <Form.Item
            label={t('directory.form.fields.orgBaseDn')}
            name="org_base_dn"
            tooltip={t('directory.form.tooltips.orgBaseDn')}
          >
            <Input placeholder={t('directory.form.placeholders.orgBaseDn')} />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label={t('directory.form.fields.orgFilter')} name="org_filter">
                <Input placeholder={t('directory.form.placeholders.orgFilter')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={t('directory.form.fields.orgNameAttr')} name="org_name_attr">
                <Input placeholder={t('directory.form.placeholders.orgNameAttr')} />
              </Form.Item>
            </Col>
          </Row>


          <Divider style={{ margin: '12px 0' }} />


          <Form.Item
            label={t('directory.form.fields.groupBaseDn')}
            name="group_base_dn"
            tooltip={t('directory.form.tooltips.groupBaseDn')}
          >
            <Input placeholder={t('directory.form.placeholders.groupBaseDn')} />
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label={t('directory.form.fields.groupFilter')} name="group_filter">
                <Input placeholder={t('directory.form.placeholders.groupFilter')} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('directory.form.fields.groupNameAttr')} name="group_name_attr">
                <Input placeholder={t('directory.form.placeholders.groupNameAttr')} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('directory.form.fields.groupDescAttr')} name="group_desc_attr">
                <Input placeholder={t('directory.form.placeholders.groupDescAttr')} />
              </Form.Item>
            </Col>
          </Row>
        </div>

        {/* ──── Step 4: 扩展配置 ──── */}
        <div style={{ display: currentStep === 3 ? undefined : 'none' }}>


          <Row gutter={16}>
            <Col span={12}>
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
            </Col>
            <Col span={12}>
              <Form.Item shouldUpdate={(prev, cur) => prev.sync_mode !== cur.sync_mode} noStyle>
                {({ getFieldValue }) =>
                  getFieldValue('sync_mode') === 'auto' ? (
                    <Form.Item
                      label={t('directory.form.fields.syncIntervalMinutes')}
                      name="sync_interval_minutes"
                      rules={[
                        { required: true, message: t('directory.form.validation.syncIntervalRequired') },
                        { type: 'number', min: 5, max: 10080, message: t('directory.form.validation.syncIntervalRange') },
                      ]}
                    >
                      <InputNumber min={5} max={10080} style={{ width: '100%' }} addonAfter="min" />
                    </Form.Item>
                  ) : (
                    <Form.Item label={t('directory.form.fields.syncIntervalMinutes')}>
                      <Input value={t('directory.form.syncMode.manualNoSchedule')} disabled />
                    </Form.Item>
                  )
                }
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label={
              <Tooltip title={t('directory.form.tooltips.syncPageSize')}>
                {t('directory.form.fields.syncPageSize')}
              </Tooltip>
            }
            name="sync_page_size"
          >
            <InputNumber min={50} max={10000} style={{ width: 200 }} addonAfter={t('directory.form.units.page')} />
          </Form.Item>

          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            {t('directory.form.footerHint')}
          </Text>
        </div>
      </Form>
    </Modal>
  );
};

export default DirectoryDrawer;
