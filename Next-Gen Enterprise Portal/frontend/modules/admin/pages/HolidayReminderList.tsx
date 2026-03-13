import React, { Suspense, lazy, useEffect, useState } from 'react';
import App from 'antd/es/app';
import DatePicker from 'antd/es/date-picker';
import Input from 'antd/es/input';
import Alert from 'antd/es/alert';
import Popconfirm from 'antd/es/popconfirm';
import Radio from 'antd/es/radio';
import Segmented from 'antd/es/segmented';
import Select from 'antd/es/select';
import Steps from 'antd/es/steps';
import Switch from 'antd/es/switch';
import Tooltip from 'antd/es/tooltip';
import Card from 'antd/es/card';
import Col from 'antd/es/grid/col';
import Row from 'antd/es/grid/row';
import Space from 'antd/es/space';
import Typography from 'antd/es/typography';
import { CalendarOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';

import type { Employee, HolidayReminder } from '@/types';
import ApiClient, { type HolidayReminderUpsertPayload } from '@/services/api';
import {
  AppButton,
  AppForm,
  AppModal,
  AppPageHeader,
  AppTable,
  AppTag,
} from '@/modules/admin/components/ui';

const UploadTriggerButton = lazy(() => import('@/modules/admin/components/upload/UploadTriggerButton'));
const { TextArea } = Input;
const { Text } = Typography;

type HolidayLocalContentConfig = {
  owner_employee_id?: string | null;
  owner_avatar?: string | null;
  cover_image?: string | null;
  hero_title?: string | null;
  section_title?: string | null;
  intro_content?: string | null;
  activity_one_title?: string | null;
  activity_one_desc?: string | null;
  activity_two_title?: string | null;
  activity_two_desc?: string | null;
  tips_title?: string | null;
  tips_items?: string | null;
  owner_name?: string | null;
  owner_role?: string | null;
  contact_button_text?: string | null;
  achievement_card_json?: string | null;
  achievement_card_markdown?: string | null;
  achievement_value?: string | null;
  achievement_label?: string | null;
  target_label?: string | null;
  target_value?: string | null;
  target_progress?: number | null;
};

type HolidayReminderFormValues = Omit<HolidayReminderUpsertPayload, 'holiday_date'> & {
  holiday_date: Dayjs;
  local_content_config?: HolidayLocalContentConfig | null;
};

type HolidayActivityMode = 'off' | 'external' | 'local';
type AchievementEditorMode = 'json' | 'markdown';

const COLOR_OPTIONS = [
  'purple',
  'blue',
  'emerald',
  'green',
  'yellow',
  'orange',
  'red',
  'rose',
] as const;

const COLOR_TAG_MAP: Record<(typeof COLOR_OPTIONS)[number], string> = {
  purple: 'purple',
  blue: 'blue',
  emerald: 'green',
  green: 'green',
  yellow: 'gold',
  orange: 'orange',
  red: 'red',
  rose: 'magenta',
};

const resolveErrorMessage = (error: unknown, fallback: string): string => {
  if (
    error
    && typeof error === 'object'
    && 'response' in error
    && typeof (error as { response?: unknown }).response === 'object'
    && (error as { response?: { data?: unknown } }).response
    && 'data' in (error as { response: { data?: unknown } }).response
  ) {
    const data = (error as { response: { data?: { detail?: unknown } } }).response.data;
    const detail = data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
};

const HolidayReminderList: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { message } = App.useApp();
  const [items, setItems] = useState<HolidayReminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [coverUploadLoading, setCoverUploadLoading] = useState(false);
  const [toggleLoadingId, setToggleLoadingId] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<HolidayReminder | null>(null);
  const [modalStep, setModalStep] = useState(0);
  const [selectedActivityMode, setSelectedActivityMode] = useState<HolidayActivityMode>('off');
  const [achievementEditorMode, setAchievementEditorMode] = useState<AchievementEditorMode>('json');
  const [localCoverImage, setLocalCoverImage] = useState('');
  const [form] = AppForm.useForm<HolidayReminderFormValues>();

  const formatDate = (value?: string) => {
    if (!value) return '-';
    const locale = i18n.resolvedLanguage === 'zh-CN' ? 'zh-CN' : 'en-US';
    return dayjs(value).locale(locale).format('YYYY-MM-DD');
  };

  useEffect(() => {
    void fetchData();
  }, []);

  useEffect(() => {
    if (!isModalOpen) return;
    const ownerId = form.getFieldValue(['local_content_config', 'owner_employee_id']);
    const ownerAvatar = String(form.getFieldValue(['local_content_config', 'owner_avatar']) || '').trim();
    if (ownerId && !ownerAvatar) {
      syncOwnerFromEmployee(ownerId);
    }
  }, [employees, isModalOpen]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [holidayData, employeeData] = await Promise.all([
        ApiClient.getHolidayReminders(),
        ApiClient.getEmployees().catch(() => []),
      ]);
      setItems(holidayData);
      setEmployees(employeeData);
    } catch {
      message.error(t('holidayReminderList.messages.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const buildDefaultLocalContentConfig = (item?: HolidayReminder | null): HolidayLocalContentConfig => {
    const localContent = (item?.local_content_config as HolidayLocalContentConfig | undefined) || {};
    return {
      owner_employee_id: String(localContent.owner_employee_id || '').trim(),
      owner_avatar: String(localContent.owner_avatar || '').trim(),
      cover_image: localContent.cover_image || item?.cover_image || '',
      hero_title: localContent.hero_title || item?.title || '',
      section_title: localContent.section_title || item?.title || '',
      intro_content: localContent.intro_content || item?.content || '',
      activity_one_title: localContent.activity_one_title || '',
      activity_one_desc: localContent.activity_one_desc || '',
      activity_two_title: localContent.activity_two_title || '',
      activity_two_desc: localContent.activity_two_desc || '',
      tips_title: localContent.tips_title || '',
      tips_items: localContent.tips_items || '',
      owner_name: localContent.owner_name || '',
      owner_role: localContent.owner_role || '',
      contact_button_text: localContent.contact_button_text || t('dashboardHome.sections.viewDetails', '节日活动'),
      achievement_card_json: typeof localContent.achievement_card_json === 'string'
        ? localContent.achievement_card_json
        : JSON.stringify(
            (localContent.achievement_card_json && typeof localContent.achievement_card_json === 'object')
              ? localContent.achievement_card_json
              : {
                  eyebrow: '环保成就',
                  icon: 'award',
                  stat: localContent.achievement_value || '',
                  stat_caption: localContent.achievement_label || '',
                  progress_left_label: localContent.target_label || '',
                  progress_right_label: localContent.target_value || '',
                  progress: localContent.target_progress ?? 0,
                },
            null,
            2,
          ),
      achievement_card_markdown: localContent.achievement_card_markdown || '',
      achievement_value: localContent.achievement_value || '',
      achievement_label: localContent.achievement_label || '',
      target_label: localContent.target_label || '',
      target_value: localContent.target_value || '',
      target_progress: localContent.target_progress ?? 0,
    };
  };

  const handleAddNew = () => {
    const defaultLocalContent = buildDefaultLocalContentConfig(null);
    setEditingItem(null);
    setModalStep(0);
    form.resetFields();
    form.setFieldsValue({
      holiday_date: dayjs(),
      color: 'purple',
      activity_mode: 'off',
      activity_url: null,
      local_content_config: defaultLocalContent,
    });
    setLocalCoverImage(String(defaultLocalContent.cover_image || '').trim());
    setSelectedActivityMode('off');
    setAchievementEditorMode('json');
    setIsModalOpen(true);
  };

  const handleEdit = (item: HolidayReminder) => {
    const defaultLocalContent = buildDefaultLocalContentConfig(item);
    setEditingItem(item);
    setModalStep(0);
    form.setFieldsValue({
      holiday_date: dayjs(item.holiday_date),
      title: item.title,
      content: item.content,
      color: item.color || 'purple',
      activity_mode: item.activity_mode || 'off',
      activity_url: item.activity_url || null,
      local_content_config: defaultLocalContent,
    });
    setLocalCoverImage(String(defaultLocalContent.cover_image || '').trim());
    setSelectedActivityMode((item.activity_mode as HolidayActivityMode) || 'off');
    setAchievementEditorMode('json');
    syncOwnerFromEmployee(defaultLocalContent.owner_employee_id);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await ApiClient.deleteHolidayReminder(Number(id));
      message.success(t('holidayReminderList.messages.deleteSuccess'));
      await fetchData();
    } catch {
      message.error(t('holidayReminderList.messages.deleteFailed'));
    }
  };

  const handleToggleActive = async (item: HolidayReminder, checked: boolean) => {
    const payload: HolidayReminderUpsertPayload = {
      title: item.title,
      content: item.content,
      holiday_date: item.holiday_date,
      cover_image: item.cover_image || null,
      color: item.color || 'purple',
      is_active: checked,
      activity_mode: item.activity_mode || 'off',
      activity_url: item.activity_url || null,
      local_content_config: item.local_content_config || null,
    };

    try {
      setToggleLoadingId(Number(item.id));
      await ApiClient.updateHolidayReminder(Number(item.id), payload);
      message.success(
        checked
          ? t('holidayReminderList.messages.enableSuccess')
          : t('holidayReminderList.messages.disableSuccess'),
      );
      await fetchData();
    } catch (error) {
      message.error(
        t('holidayReminderList.messages.actionFailed', {
          reason: resolveErrorMessage(error, t('holidayReminderList.messages.unknownError')),
        }),
      );
    } finally {
      setToggleLoadingId(null);
    }
  };

  const handleSubmit = async (values: HolidayReminderFormValues) => {
    const fullValues = {
      ...form.getFieldsValue(true),
      ...values,
    } as HolidayReminderFormValues;

    if (!fullValues.holiday_date || !dayjs.isDayjs(fullValues.holiday_date)) {
      message.error(t('holidayReminderList.form.validation.dateRequired'));
      setModalStep(0);
      return;
    }

    const normalizedLocalContent = fullValues.activity_mode === 'local'
      ? {
          hero_title: String(fullValues.local_content_config?.hero_title || '').trim() || null,
          cover_image: String(localCoverImage || fullValues.local_content_config?.cover_image || '').trim() || null,
          section_title: String(fullValues.local_content_config?.section_title || '').trim() || null,
          intro_content: String(fullValues.local_content_config?.intro_content || '').trim(),
          activity_one_title: String(fullValues.local_content_config?.activity_one_title || '').trim() || null,
          activity_one_desc: String(fullValues.local_content_config?.activity_one_desc || '').trim() || null,
          activity_two_title: String(fullValues.local_content_config?.activity_two_title || '').trim() || null,
          activity_two_desc: String(fullValues.local_content_config?.activity_two_desc || '').trim() || null,
          tips_title: String(fullValues.local_content_config?.tips_title || '').trim() || null,
          tips_items: String(fullValues.local_content_config?.tips_items || '').trim() || null,
          owner_employee_id: String(fullValues.local_content_config?.owner_employee_id || '').trim() || null,
          owner_avatar: String(fullValues.local_content_config?.owner_avatar || '').trim() || null,
          owner_name: String(fullValues.local_content_config?.owner_name || '').trim() || null,
          owner_role: String(fullValues.local_content_config?.owner_role || '').trim() || null,
          contact_button_text: String(fullValues.local_content_config?.contact_button_text || '').trim() || null,
          achievement_card_json: String(fullValues.local_content_config?.achievement_card_json || '').trim() || null,
          achievement_card_markdown: String(fullValues.local_content_config?.achievement_card_markdown || '').trim() || null,
          achievement_value: String(fullValues.local_content_config?.achievement_value || '').trim() || null,
          achievement_label: String(fullValues.local_content_config?.achievement_label || '').trim() || null,
          target_label: String(fullValues.local_content_config?.target_label || '').trim() || null,
          target_value: String(fullValues.local_content_config?.target_value || '').trim() || null,
          target_progress: Number(fullValues.local_content_config?.target_progress || 0) || 0,
        }
      : null;

    const payload: HolidayReminderUpsertPayload = {
      ...fullValues,
      holiday_date: fullValues.holiday_date.format('YYYY-MM-DD'),
      color: fullValues.color || 'purple',
      cover_image: fullValues.activity_mode === 'local'
        ? (String(localCoverImage || fullValues.local_content_config?.cover_image || '').trim() || null)
        : null,
      is_active: editingItem?.is_active ?? true,
      activity_mode: fullValues.activity_mode || 'off',
      activity_url: fullValues.activity_mode === 'external' ? (fullValues.activity_url || null) : null,
      local_content_config: normalizedLocalContent,
    };

    try {
      setSubmitLoading(true);
      if (editingItem) {
        await ApiClient.updateHolidayReminder(Number(editingItem.id), payload);
        message.success(t('holidayReminderList.messages.updateSuccess'));
      } else {
        await ApiClient.createHolidayReminder(payload);
        message.success(t('holidayReminderList.messages.createSuccess'));
      }
      setIsModalOpen(false);
      await fetchData();
    } catch (error) {
      message.error(
        t('holidayReminderList.messages.actionFailed', {
          reason: resolveErrorMessage(error, t('holidayReminderList.messages.unknownError')),
        }),
      );
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleModalCancel = () => {
    setIsModalOpen(false);
    setModalStep(0);
    setSelectedActivityMode('off');
    setAchievementEditorMode('json');
    setLocalCoverImage('');
  };

  const handleModalConfirm = async () => {
    if (modalStep === 0) {
      await form.validateFields(['title', 'content', 'holiday_date', 'color']);
      setModalStep(1);
      return;
    }

    const activityMode = (form.getFieldValue('activity_mode') || 'off') as HolidayActivityMode;

    if (modalStep === 1) {
      await form.validateFields(['activity_mode']);

      if (activityMode === 'external') {
        await form.validateFields(['activity_url']);
        form.submit();
        return;
      }

      if (activityMode === 'local') {
        setModalStep(2);
        return;
      }

      form.submit();
      return;
    }

    if (modalStep === 2) {
      setModalStep(3);
      return;
    }

    if (modalStep === 3) {
      setModalStep(4);
      return;
    }

    const rawAchievementCardJson = String(form.getFieldValue(['local_content_config', 'achievement_card_json']) || '').trim();
    if (rawAchievementCardJson) {
      try {
        JSON.parse(rawAchievementCardJson);
      } catch {
        message.error(t('holidayReminderList.form.validation.achievementCardJsonInvalid'));
        return;
      }
    }

    form.submit();
  };

  const handleModalBack = () => {
    setModalStep((prev) => Math.max(0, prev - 1));
  };

  const columns: ColumnsType<HolidayReminder> = [
    {
      title: t('holidayReminderList.table.title'),
      dataIndex: 'title',
      key: 'title',
      render: (value: string) => <Text strong>{value}</Text>,
    },
    {
      title: t('holidayReminderList.table.date'),
      dataIndex: 'holiday_date',
      key: 'holiday_date',
      width: 120,
      render: (value: string) => <Text type="secondary">{formatDate(value)}</Text>,
    },
    {
      title: t('holidayReminderList.table.content'),
      dataIndex: 'content',
      key: 'content',
      ellipsis: { showTitle: false },
      render: (content: string) => (
        <Tooltip placement="topLeft" title={content}>
          <Text type="secondary">{content}</Text>
        </Tooltip>
      ),
    },
    {
      title: t('holidayReminderList.table.toggle'),
      dataIndex: 'is_active',
      key: 'toggle_active',
      width: 150,
      render: (_: boolean | undefined, record: HolidayReminder) => (
        <Switch
          checked={record.is_active !== false}
          loading={toggleLoadingId === Number(record.id)}
          checkedChildren={t('holidayReminderList.status.active')}
          unCheckedChildren={t('holidayReminderList.status.inactive')}
          onChange={(checked) => void handleToggleActive(record, checked)}
        />
      ),
    },
    {
      title: t('holidayReminderList.table.color'),
      dataIndex: 'color',
      key: 'color',
      width: 110,
      render: (value: HolidayReminder['color']) => (
        <AppTag color={COLOR_TAG_MAP[value] || 'default'}>
          {t(`holidayReminderList.colors.${value}`, { defaultValue: value })}
        </AppTag>
      ),
    },
    {
      title: t('holidayReminderList.table.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (value?: boolean) => (
        <AppTag status={value === false ? 'default' : 'success'}>
          {value === false ? t('holidayReminderList.status.inactive') : t('holidayReminderList.status.active')}
        </AppTag>
      ),
    },
    {
      title: t('holidayReminderList.table.createdAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 140,
      render: (value?: string) => <Text type="secondary">{formatDate(value)}</Text>,
    },
    {
      title: t('holidayReminderList.table.actions'),
      key: 'actions',
      width: 160,
      render: (_: unknown, record: HolidayReminder) => (
        <Space size="small">
          <AppButton intent="tertiary" size="sm" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            {t('common.buttons.edit')}
          </AppButton>
          <Popconfirm
            title={t('holidayReminderList.confirm.deleteTitle')}
            onConfirm={() => handleDelete(record.id)}
          >
            <AppButton intent="danger" size="sm" icon={<DeleteOutlined />}>
              {t('common.buttons.delete')}
            </AppButton>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const employeeOptions = employees.map((employee) => {
    const name = String(employee.name || '').trim() || String(employee.account || '').trim();
    const account = String(employee.account || '').trim();
    const department = String(employee.department || '').trim();
    const role = String(employee.role || department || '').trim();
    const avatar = String(
      employee.avatar
      || (employee as { avatar_url?: string }).avatar_url
      || (employee as { avatarUrl?: string }).avatarUrl
      || '',
    ).trim();
    const label = [name, account ? `(${account})` : '', department ? `· ${department}` : '']
      .filter(Boolean)
      .join(' ');
    return {
      value: String(employee.id),
      label,
      employee,
      role,
      name,
      avatar,
    };
  });

  const syncOwnerFromEmployee = (ownerId?: string | null) => {
    const normalized = String(ownerId || '').trim();
    if (!normalized) return;
    const selected = employeeOptions.find((option) => option.value === normalized);
    if (!selected) return;
    form.setFieldValue(
      ['local_content_config', 'owner_name'],
      selected.name || '',
    );
    form.setFieldValue(
      ['local_content_config', 'owner_role'],
      selected.role || '',
    );
    form.setFieldValue(
      ['local_content_config', 'owner_avatar'],
      selected.avatar || '',
    );
  };

  const isLocalMode = selectedActivityMode === 'local';
  const stepItems = [
    {
      title: t('holidayReminderList.steps.basic'),
      description: t('holidayReminderList.stepsDesc.basic', { defaultValue: '节日名称、文案与日期' }),
    },
    {
      title: t('holidayReminderList.steps.activity'),
      description: t('holidayReminderList.stepsDesc.activity', { defaultValue: '活动入口与打开方式' }),
    },
    ...(isLocalMode
      ? [
          {
            title: t('holidayReminderList.steps.localCardShort', { defaultValue: '活动卡片' }),
            description: t('holidayReminderList.steps.localCard', { defaultValue: '本地内容-活动卡片配置' }),
          },
          {
            title: t('holidayReminderList.steps.localDetailShort', { defaultValue: '详情配置' }),
            description: t('holidayReminderList.steps.localDetail', { defaultValue: '本地内容-详情配置' }),
          },
          {
            title: t('holidayReminderList.steps.localManageShort', { defaultValue: '运营配置' }),
            description: t('holidayReminderList.steps.localManage', { defaultValue: '活动负责人、按钮与成就卡片' }),
          },
        ]
      : []),
  ];
  const okText = modalStep < stepItems.length - 1
    ? t('common.buttons.next', { defaultValue: '下一步' })
    : t('common.buttons.confirm');
  const cancelText = modalStep === 0
    ? t('common.buttons.cancel')
    : t('common.buttons.previous', { defaultValue: '上一步' });

  return (
    <div className="admin-page admin-page-spaced">
      <AppPageHeader
        title={t('holidayReminderList.page.title')}
        subtitle={t('holidayReminderList.page.subtitle')}
        action={
          <AppButton intent="primary" icon={<PlusOutlined />} onClick={handleAddNew}>
            {t('holidayReminderList.page.addButton')}
          </AppButton>
        }
      />
      <Card className="admin-card overflow-hidden">
        <AppTable
          columns={columns}
          dataSource={items}
          rowKey="id"
          loading={loading}
          emptyText={t('holidayReminderList.table.empty')}
        />
      </Card>

      <AppModal
        title={editingItem ? t('holidayReminderList.modal.editTitle') : t('holidayReminderList.modal.createTitle')}
        open={isModalOpen}
        width={920}
        okText={okText}
        cancelText={cancelText}
        onOk={() => void handleModalConfirm()}
        onCancel={modalStep === 0 ? handleModalCancel : handleModalBack}
        confirmLoading={submitLoading}
      >
        <AppForm form={form} onFinish={handleSubmit}>
          <Steps
            current={modalStep}
            className="mb-6"
            labelPlacement="vertical"
            responsive={false}
            items={stepItems}
          />

          {modalStep === 0 ? (
            <>
              <AppForm.Item
                name="title"
                label={t('holidayReminderList.form.title')}
                rules={[{ required: true, message: t('holidayReminderList.form.validation.titleRequired') }]}
              >
                <Input placeholder={t('holidayReminderList.form.placeholders.title')} />
              </AppForm.Item>
              <AppForm.Item
                name="content"
                label={t('holidayReminderList.form.content')}
                rules={[{ required: true, message: t('holidayReminderList.form.validation.contentRequired') }]}
              >
                <TextArea rows={4} placeholder={t('holidayReminderList.form.placeholders.content')} />
              </AppForm.Item>

              <Card size="small" className="admin-card-subtle">
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <AppForm.Item
                      name="holiday_date"
                      label={t('holidayReminderList.form.date')}
                      rules={[{ required: true, message: t('holidayReminderList.form.validation.dateRequired') }]}
                    >
                      <DatePicker className="w-full" />
                    </AppForm.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <AppForm.Item
                      name="color"
                      label={t('holidayReminderList.form.color')}
                      rules={[{ required: true, message: t('holidayReminderList.form.validation.colorRequired') }]}
                    >
                      <Select placeholder={t('holidayReminderList.form.placeholders.color')}>
                        {COLOR_OPTIONS.map((color) => (
                          <Select.Option key={color} value={color}>
                            {t(`holidayReminderList.colors.${color}`)}
                          </Select.Option>
                        ))}
                      </Select>
                    </AppForm.Item>
                  </Col>
                </Row>
              </Card>
            </>
          ) : modalStep === 1 ? (
            <Card size="small" className="admin-card-subtle">
              <AppForm.Item
                name="activity_mode"
                label={t('holidayReminderList.form.activityMode')}
                initialValue={'off'}
                rules={[{ required: true, message: t('holidayReminderList.form.validation.activityModeRequired') }]}
              >
                <Radio.Group
                  className="w-full"
                  onChange={(event) => setSelectedActivityMode(event.target.value as HolidayActivityMode)}
                >
                  <Space direction="vertical" className="w-full">
                    <Radio value="off">
                      <div>
                        <Text strong>{t('holidayReminderList.activityModes.off')}</Text>
                        <div><Text type="secondary">{t('holidayReminderList.activityModeHelp.off')}</Text></div>
                      </div>
                    </Radio>
                    <Radio value="external">
                      <div>
                        <Text strong>{t('holidayReminderList.activityModes.external')}</Text>
                        <div><Text type="secondary">{t('holidayReminderList.activityModeHelp.external')}</Text></div>
                      </div>
                    </Radio>
                    <Radio value="local">
                      <div>
                        <Text strong>{t('holidayReminderList.activityModes.local')}</Text>
                        <div><Text type="secondary">{t('holidayReminderList.activityModeHelp.local')}</Text></div>
                      </div>
                    </Radio>
                  </Space>
                </Radio.Group>
              </AppForm.Item>

              <AppForm.Item noStyle shouldUpdate={(prev, curr) => prev.activity_mode !== curr.activity_mode}>
                {({ getFieldValue }) => {
                  const activityMode = (getFieldValue('activity_mode') || 'off') as HolidayActivityMode;
                  if (activityMode === 'external') {
                    return (
                      <AppForm.Item
                        name="activity_url"
                        label={t('holidayReminderList.form.activityUrl')}
                        rules={[
                          { required: true, message: t('holidayReminderList.form.validation.activityUrlRequired') },
                          { type: 'url', message: t('holidayReminderList.form.validation.activityUrlInvalid') },
                        ]}
                      >
                        <Input placeholder={t('holidayReminderList.form.placeholders.activityUrl')} />
                      </AppForm.Item>
                    );
                  }
                  if (activityMode === 'local') {
                    return (
                      <Alert
                        type="info"
                        showIcon
                        message={t('holidayReminderList.activityModeHelp.local')}
                      />
                    );
                  }
                  return (
                    <Alert
                      type="info"
                      showIcon
                      message={t('holidayReminderList.activityModeHelp.off')}
                    />
                  );
                }}
              </AppForm.Item>
            </Card>
          ) : modalStep === 2 ? (
            <Card size="small" className="admin-card-subtle">
              <Space direction="vertical" size={16} className="w-full">
                <AppForm.Item
                  label={t('holidayReminderList.form.local.coverImage')}
                  extra={t('holidayReminderList.form.help.localCoverImage')}
                  required
                >
                  <AppForm.Item name={['local_content_config', 'cover_image']} hidden>
                    <Input />
                  </AppForm.Item>
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4">
                    <Space direction="vertical" size={12} className="w-full">
                      <div className="relative h-40 overflow-hidden rounded-2xl bg-slate-100">
                        {localCoverImage ? (
                          <img
                            src={localCoverImage}
                            alt={t('holidayReminderList.form.local.coverImage')}
                            className="h-full w-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-400">
                            {t('holidayReminderList.form.placeholders.localCoverImage')}
                          </div>
                        )}
                        <div className={`absolute inset-x-0 ${localCoverImage ? 'bottom-3 flex justify-end px-3' : 'inset-y-0 flex items-center justify-center'}`}>
                          <Suspense fallback={null}>
                            <UploadTriggerButton
                              accept="image/*"
                              loading={coverUploadLoading}
                              onSelect={async (file) => {
                                try {
                                  setCoverUploadLoading(true);
                                  const url = await ApiClient.uploadImage(file);
                                  setLocalCoverImage(url);
                                  form.setFieldValue(['local_content_config', 'cover_image'], url);
                                  message.success(t('holidayReminderList.messages.uploadSuccess'));
                                } catch {
                                  message.error(t('holidayReminderList.messages.uploadFailed'));
                                } finally {
                                  setCoverUploadLoading(false);
                                }
                              }}
                              buttonLabel={t('systemSettingsPage.actions.localUpload')}
                            />
                          </Suspense>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <Text type="secondary">
                          {localCoverImage
                            ? t('holidayReminderList.form.help.localCoverImageReady', '已上传本地背景图片，前台将直接使用。')
                            : t('holidayReminderList.form.help.localCoverImageOnlyUpload', '仅支持本地上传背景图片，不读取外部链接。')}
                        </Text>
                        {localCoverImage ? (
                          <AppButton
                            intent="secondary"
                            onClick={() => {
                              setLocalCoverImage('');
                              form.setFieldValue(['local_content_config', 'cover_image'], '');
                            }}
                          >
                            {t('common.actions.clear', '清空')}
                          </AppButton>
                        ) : null}
                      </div>
                    </Space>
                  </div>
                </AppForm.Item>
                <AppForm.Item
                  name={['local_content_config', 'hero_title']}
                  label={t('holidayReminderList.form.local.heroTitle')}
                >
                  <TextArea
                    rows={2}
                    placeholder={t('holidayReminderList.form.placeholders.localHeroTitle')}
                  />
                </AppForm.Item>
              </Space>
            </Card>
          ) : modalStep === 3 ? (
            <Card size="small" className="admin-card-subtle">
              <Space direction="vertical" size={16} className="w-full">
                <AppForm.Item
                  name={['local_content_config', 'section_title']}
                  label={t('holidayReminderList.form.local.sectionTitle')}
                >
                  <Input placeholder={t('holidayReminderList.form.placeholders.localSectionTitle')} />
                </AppForm.Item>
                <AppForm.Item
                  name={['local_content_config', 'intro_content']}
                  label={t('holidayReminderList.form.local.introContent')}
                >
                  <TextArea rows={4} placeholder={t('holidayReminderList.form.placeholders.localIntroContent')} />
                </AppForm.Item>
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <AppForm.Item name={['local_content_config', 'activity_one_title']} label={t('holidayReminderList.form.local.activityOneTitle')}>
                      <Input placeholder={t('holidayReminderList.form.placeholders.localActivityOneTitle')} />
                    </AppForm.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <AppForm.Item name={['local_content_config', 'activity_two_title']} label={t('holidayReminderList.form.local.activityTwoTitle')}>
                      <Input placeholder={t('holidayReminderList.form.placeholders.localActivityTwoTitle')} />
                    </AppForm.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <AppForm.Item name={['local_content_config', 'activity_one_desc']} label={t('holidayReminderList.form.local.activityOneDesc')}>
                      <TextArea rows={3} placeholder={t('holidayReminderList.form.placeholders.localActivityOneDesc')} />
                    </AppForm.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <AppForm.Item name={['local_content_config', 'activity_two_desc']} label={t('holidayReminderList.form.local.activityTwoDesc')}>
                      <TextArea rows={3} placeholder={t('holidayReminderList.form.placeholders.localActivityTwoDesc')} />
                    </AppForm.Item>
                  </Col>
                </Row>
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <AppForm.Item name={['local_content_config', 'tips_title']} label={t('holidayReminderList.form.local.tipsTitle')}>
                      <Input placeholder={t('holidayReminderList.form.placeholders.localTipsTitle')} />
                    </AppForm.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <AppForm.Item name={['local_content_config', 'tips_items']} label={t('holidayReminderList.form.local.tipsItems')}>
                      <TextArea rows={3} placeholder={t('holidayReminderList.form.placeholders.localTipsItems')} />
                    </AppForm.Item>
                  </Col>
                </Row>
              </Space>
            </Card>
          ) : (
            <Card size="small" className="admin-card-subtle">
              <Space direction="vertical" size={16} className="w-full">
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <AppForm.Item name={['local_content_config', 'owner_employee_id']} label={t('holidayReminderList.form.local.ownerName')}>
                      <Select
                        showSearch
                        allowClear
                        optionFilterProp="label"
                        placeholder={t('holidayReminderList.form.placeholders.localOwnerName')}
                        options={employeeOptions}
                        onChange={(value) => {
                          const selected = employeeOptions.find((option) => option.value === value);
                          form.setFieldValue(
                            ['local_content_config', 'owner_name'],
                            selected?.name || '',
                          );
                          form.setFieldValue(
                            ['local_content_config', 'owner_role'],
                            selected?.role || '',
                          );
                          form.setFieldValue(
                            ['local_content_config', 'owner_avatar'],
                            selected?.avatar || '',
                          );
                        }}
                      />
                    </AppForm.Item>
                    <AppForm.Item name={['local_content_config', 'owner_name']} hidden>
                      <Input />
                    </AppForm.Item>
                    <AppForm.Item name={['local_content_config', 'owner_role']} hidden>
                      <Input />
                    </AppForm.Item>
                    <AppForm.Item name={['local_content_config', 'owner_avatar']} hidden>
                      <Input />
                    </AppForm.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <AppForm.Item name={['local_content_config', 'contact_button_text']} label={t('holidayReminderList.form.local.contactButtonText')}>
                      <Input placeholder={t('holidayReminderList.form.placeholders.localContactButtonText')} />
                    </AppForm.Item>
                  </Col>
                  <Col xs={24}>
                    <Card size="small" className="admin-card-subtle">
                      <Space direction="vertical" size={16} className="w-full">
                        <div>
                          <Text strong>{t('holidayReminderList.form.section.achievementCard')}</Text>
                          <div><Text type="secondary">{t('holidayReminderList.form.help.achievementCardGroup')}</Text></div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                          <Space direction="vertical" size={20} className="w-full">
                            <Segmented
                              block
                              value={achievementEditorMode}
                              onChange={(value) => setAchievementEditorMode(value as AchievementEditorMode)}
                              options={[
                                { label: t('holidayReminderList.form.local.achievementCardJson'), value: 'json' },
                                { label: t('holidayReminderList.form.local.achievementCardMarkdown'), value: 'markdown' },
                              ]}
                            />
                            {achievementEditorMode === 'json' ? (
                              <AppForm.Item
                                name={['local_content_config', 'achievement_card_json']}
                                extra={t('holidayReminderList.form.help.achievementCardJson')}
                                className="mb-0"
                              >
                                <TextArea rows={12} placeholder={t('holidayReminderList.form.placeholders.localAchievementCardJson')} />
                              </AppForm.Item>
                            ) : (
                              <AppForm.Item
                                name={['local_content_config', 'achievement_card_markdown']}
                                extra={t('holidayReminderList.form.help.achievementCardMarkdown')}
                                className="mb-0"
                              >
                                <TextArea rows={12} placeholder={t('holidayReminderList.form.placeholders.localAchievementCardMarkdown')} />
                              </AppForm.Item>
                            )}
                          </Space>
                        </div>
                      </Space>
                    </Card>
                  </Col>
                </Row>
              </Space>
            </Card>
          )}
        </AppForm>
      </AppModal>
    </div>
  );
};

export default HolidayReminderList;
