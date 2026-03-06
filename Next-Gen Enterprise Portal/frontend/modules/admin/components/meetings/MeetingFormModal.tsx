import React, { useEffect } from 'react';
import { Col, DatePicker, Input, InputNumber, Row, Select, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { AppForm, AppModal } from '@/modules/admin/components/ui';
import type { MeetingType } from '@/modules/admin/services/meetings';

const { Paragraph } = Typography;

export interface MeetingFormValues {
  subject: string;
  startTime: Dayjs;
  durationMinutes: number;
  meetingType: MeetingType;
  meetingRoom: string;
  meetingId?: string;
  organizer: string;
  attendees: string[];
}

interface MeetingFormModalProps {
  open: boolean;
  confirmLoading: boolean;
  mode?: 'create' | 'edit';
  initialValues?: Partial<MeetingFormValues>;
  onCancel: () => void;
  onSubmit: (values: MeetingFormValues) => Promise<void> | void;
}

const MeetingFormModal: React.FC<MeetingFormModalProps> = ({
  open,
  confirmLoading,
  mode = 'create',
  initialValues,
  onCancel,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const [form] = AppForm.useForm<MeetingFormValues>();

  useEffect(() => {
    if (!open) {
      return;
    }
    form.resetFields();
    const defaults: Partial<MeetingFormValues> = {
      durationMinutes: 60,
      meetingType: 'online',
      attendees: [],
    };
    form.setFieldsValue({
      ...defaults,
      ...initialValues,
    });
  }, [form, initialValues, open]);

  const handleOk = async (): Promise<void> => {
    const values = await form.validateFields();
    await onSubmit(values);
  };

  return (
    <AppModal
      open={open}
      title={mode === 'edit'
        ? t('meetingLocal.modal.editTitle', '编辑会议')
        : t('meetingLocal.modal.title', '创建会议')}
      width={820}
      okText={mode === 'edit'
        ? t('meetingLocal.actions.save', '保存修改')
        : t('meetingLocal.actions.create', '创建会议')}
      cancelText={t('common.buttons.cancel', '取消')}
      confirmLoading={confirmLoading}
      onOk={() => {
        void handleOk().catch(() => undefined);
      }}
      onCancel={onCancel}
    >
      <Paragraph className="text-slate-500 mb-5">
        {mode === 'edit'
          ? t('meetingLocal.form.editTip', '你可以直接修改会议信息；保留会议 ID 不变可避免外部引用失效。')
          : t('meetingLocal.form.tip', '未填写会议 ID 时，系统会在保存时自动生成一个唯一标识。')}
      </Paragraph>
      <AppForm form={form} layout="vertical">
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <AppForm.Item
              name="subject"
              label={t('meetingLocal.form.subject', '会议主题')}
              rules={[{ required: true, message: t('meetingLocal.validation.subject', '请输入会议主题') }]}
            >
              <Input placeholder={t('meetingLocal.form.subjectPlaceholder', '例如：Q2 经营复盘会')} />
            </AppForm.Item>
          </Col>
          <Col xs={24} md={12}>
            <AppForm.Item
              name="organizer"
              label={t('meetingLocal.form.organizer', '会议发起人')}
              rules={[{ required: true, message: t('meetingLocal.validation.organizer', '请输入会议发起人') }]}
            >
              <Input placeholder={t('meetingLocal.form.organizerPlaceholder', '例如：王敏 / wangmin')} />
            </AppForm.Item>
          </Col>
          <Col xs={24} md={12}>
            <AppForm.Item
              name="startTime"
              label={t('meetingLocal.form.startTime', '开始时间')}
              rules={[{ required: true, message: t('meetingLocal.validation.startTime', '请选择开始时间') }]}
            >
              <DatePicker
                showTime
                format="YYYY-MM-DD HH:mm"
                className="w-full"
                placeholder={t('meetingLocal.form.startTimePlaceholder', '选择会议开始时间')}
              />
            </AppForm.Item>
          </Col>
          <Col xs={24} md={12}>
            <AppForm.Item
              name="durationMinutes"
              label={t('meetingLocal.form.duration', '会议时长（分钟）')}
              rules={[{ required: true, message: t('meetingLocal.validation.duration', '请输入会议时长') }]}
            >
              <InputNumber min={15} max={1440} step={15} className="w-full" />
            </AppForm.Item>
          </Col>
          <Col xs={24} md={12}>
            <AppForm.Item
              name="meetingType"
              label={t('meetingLocal.form.meetingType', '会议类型')}
              rules={[{ required: true, message: t('meetingLocal.validation.meetingType', '请选择会议类型') }]}
            >
              <Select
                options={[
                  { value: 'online', label: t('meetingLocal.types.online', '线上') },
                  { value: 'offline', label: t('meetingLocal.types.offline', '线下') },
                ]}
                placeholder={t('meetingLocal.form.meetingTypePlaceholder', '选择会议类型')}
              />
            </AppForm.Item>
          </Col>
          <Col xs={24} md={12}>
            <AppForm.Item
              name="meetingRoom"
              label={t('meetingLocal.form.room', '会议室')}
              rules={[{ required: true, message: t('meetingLocal.validation.room', '请输入会议室') }]}
            >
              <Input placeholder={t('meetingLocal.form.roomPlaceholder', '例如：18F 星海会议室 / 腾讯会议 904-123')} />
            </AppForm.Item>
          </Col>
          <Col xs={24}>
            <AppForm.Item
              name="meetingId"
              label={t('meetingLocal.form.meetingId', '会议 ID')}
            >
              <Input placeholder={t('meetingLocal.form.meetingIdPlaceholder', '可选，留空时自动生成')} />
            </AppForm.Item>
          </Col>
          <Col xs={24}>
            <AppForm.Item
              name="attendees"
              label={t('meetingLocal.form.attendees', '参会人')}
              rules={[{ required: true, type: 'array', min: 1, message: t('meetingLocal.validation.attendees', '请至少填写一位参会人') }]}
            >
              <Select
                mode="tags"
                tokenSeparators={[',', '，', ';', '；']}
                placeholder={t('meetingLocal.form.attendeesPlaceholder', '输入参会人姓名后回车，可连续添加多个')}
              />
            </AppForm.Item>
          </Col>
        </Row>
      </AppForm>
    </AppModal>
  );
};

export default MeetingFormModal;
