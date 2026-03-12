import React, { useEffect, useState } from 'react';
import App from 'antd/es/app';
import DatePicker from 'antd/es/date-picker';
import Input from 'antd/es/input';
import Popconfirm from 'antd/es/popconfirm';
import Select from 'antd/es/select';
import Switch from 'antd/es/switch';
import Tooltip from 'antd/es/tooltip';
import Card from 'antd/es/card';
import Col from 'antd/es/grid/col';
import Row from 'antd/es/grid/row';
import Space from 'antd/es/space';
import Typography from 'antd/es/typography';
import Alert from 'antd/es/alert';
import { CalendarOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';

import type { HolidayReminder } from '@/types';
import ApiClient, { type HolidayReminderUpsertPayload } from '@/services/api';
import {
  AppButton,
  AppForm,
  AppModal,
  AppPageHeader,
  AppTable,
  AppTag,
} from '@/modules/admin/components/ui';

const { TextArea } = Input;
const { Text } = Typography;

type HolidayReminderFormValues = Omit<HolidayReminderUpsertPayload, 'holiday_date'> & {
  holiday_date: Dayjs;
};

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
  const [submitLoading, setSubmitLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<HolidayReminder | null>(null);
  const [form] = AppForm.useForm<HolidayReminderFormValues>();

  const formatDate = (value?: string) => {
    if (!value) return '-';
    const locale = i18n.resolvedLanguage === 'zh-CN' ? 'zh-CN' : 'en-US';
    return dayjs(value).locale(locale).format('YYYY-MM-DD');
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await ApiClient.getHolidayReminders();
      setItems(data);
    } catch {
      message.error(t('holidayReminderList.messages.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({
      holiday_date: dayjs(),
      color: 'purple',
      is_active: true,
      cover_image: '',
    });
    setIsModalOpen(true);
  };

  const handleEdit = (item: HolidayReminder) => {
    setEditingItem(item);
    form.setFieldsValue({
      ...item,
      holiday_date: dayjs(item.holiday_date),
      cover_image: item.cover_image || '',
      is_active: item.is_active ?? true,
    });
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

  const handleSubmit = async (values: HolidayReminderFormValues) => {
    const payload: HolidayReminderUpsertPayload = {
      ...values,
      holiday_date: values.holiday_date.format('YYYY-MM-DD'),
      cover_image: values.cover_image?.trim() || null,
      color: values.color || 'purple',
      is_active: values.is_active ?? true,
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
      title: t('holidayReminderList.table.cover'),
      dataIndex: 'cover_image',
      key: 'cover_image',
      width: 180,
      ellipsis: { showTitle: false },
      render: (value?: string) => (
        value ? (
          <Tooltip placement="topLeft" title={value}>
            <Text type="secondary">{value}</Text>
          </Tooltip>
        ) : (
          <Text type="secondary">-</Text>
        )
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

      <Alert
        showIcon
        type="info"
        className="admin-card"
        message={t('holidayReminderList.page.subtitle')}
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
        onOk={() => form.submit()}
        onCancel={() => setIsModalOpen(false)}
        confirmLoading={submitLoading}
      >
        <AppForm form={form} onFinish={handleSubmit}>
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
              <Col xs={24} md={12}>
                <AppForm.Item
                  name="cover_image"
                  label={t('holidayReminderList.form.cover')}
                >
                  <Input placeholder={t('holidayReminderList.form.placeholders.cover')} />
                </AppForm.Item>
              </Col>
              <Col xs={24} md={12}>
                <AppForm.Item
                  name="is_active"
                  label={t('holidayReminderList.form.active')}
                  valuePropName="checked"
                >
                  <Switch
                    checkedChildren={t('holidayReminderList.status.active')}
                    unCheckedChildren={t('holidayReminderList.status.inactive')}
                  />
                </AppForm.Item>
              </Col>
            </Row>
          </Card>
        </AppForm>
      </AppModal>
    </div>
  );
};

export default HolidayReminderList;
