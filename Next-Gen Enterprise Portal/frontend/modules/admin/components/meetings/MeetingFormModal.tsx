import React, { useEffect, useMemo, useState } from 'react';
import Col from 'antd/es/grid/col';
import DatePicker from 'antd/es/date-picker';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import InputNumber from 'antd/es/input-number';
import Row from 'antd/es/grid/row';
import Select from 'antd/es/select';
import Typography from 'antd/es/typography';
import type { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { AppForm, AppModal } from '@/modules/admin/components/ui';
import type { MeetingType } from '@/modules/admin/services/meetings';
import ApiClient from '@/shared/services/api';
import type { UserOption } from '@/types';

const { Paragraph } = Typography;

export interface MeetingFormValues {
  subject: string;
  startTime: Dayjs;
  durationMinutes: number;
  meetingType: MeetingType;
  meetingRoom: string;
  meetingSoftware: string;
  meetingId: string;
  organizerUserId: number;
  attendeeUserIds: number[];
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
  const meetingType = Form.useWatch('meetingType', form) ?? initialValues?.meetingType ?? 'online';
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    form.resetFields();
    const defaults: Partial<MeetingFormValues> = {
      durationMinutes: 60,
      meetingType: 'online',
      meetingRoom: '',
      meetingSoftware: '',
      meetingId: '',
      attendeeUserIds: [],
    };
    form.setFieldsValue({
      ...defaults,
      ...initialValues,
    });
  }, [form, initialValues, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;
    const loadUsers = async (): Promise<void> => {
      setUsersLoading(true);
      try {
        const users = await ApiClient.getUserOptions();
        if (active) {
          setUserOptions(Array.isArray(users) ? users : []);
        }
      } finally {
        if (active) {
          setUsersLoading(false);
        }
      }
    };

    void loadUsers();
    return () => {
      active = false;
    };
  }, [open]);

  const selectableUserOptions = useMemo(() => {
    const optionMap = new Map<number, { value: number; label: string }>();

    userOptions.forEach((user) => {
      const label = user.name?.trim()
        ? `${user.name.trim()} / ${user.username}`
        : user.username;
      optionMap.set(user.id, { value: user.id, label });
    });

    return Array.from(optionMap.values());
  }, [userOptions]);

  const handleOk = async (): Promise<void> => {
    const values = await form.validateFields();
    await onSubmit(values);
  };

  const isOnlineMeeting = meetingType === 'online';
  const locationLabel = isOnlineMeeting
    ? t('meetingLocal.form.meetingSoftware', '会议软件')
    : t('meetingLocal.form.room', '会议室');
  const locationPlaceholder = isOnlineMeeting
    ? t('meetingLocal.form.meetingSoftwarePlaceholder', '例如：腾讯会议 / 飞书会议 / Teams')
    : t('meetingLocal.form.roomPlaceholder', '例如：18F 星海会议室');
  const locationValidation = isOnlineMeeting
    ? t('meetingLocal.validation.meetingSoftware', '请输入会议软件')
    : t('meetingLocal.validation.room', '请输入会议室');
  const meetingIdLabel = isOnlineMeeting
    ? t('meetingLocal.form.onlineMeetingId', '会议 ID / 会议链接')
    : t('meetingLocal.form.meetingId', '会议 ID');
  const meetingIdPlaceholder = isOnlineMeeting
    ? t('meetingLocal.form.onlineMeetingIdPlaceholder', '例如：904-123-456 或 https://meeting.tencent.com/xxx')
    : t('meetingLocal.form.meetingIdPlaceholder', '例如：腾讯会议 904-123-456');
  const meetingIdValidation = isOnlineMeeting
    ? t('meetingLocal.validation.onlineMeetingId', '请输入会议 ID 或会议链接')
    : t('meetingLocal.validation.meetingId', '请输入会议 ID');

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
          ? t('meetingLocal.form.editTip', '你可以直接修改会议信息；会议 ID 需要手动维护并保持与外部会议平台一致。')
          : t('meetingLocal.form.tip', '会议 ID 需要手动填写，例如腾讯会议、飞书会议等平台生成的入会编号。')}
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
              name="organizerUserId"
              label={t('meetingLocal.form.organizer', '会议发起人')}
              rules={[{ required: true, message: t('meetingLocal.validation.organizer', '请输入会议发起人') }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                loading={usersLoading}
                options={selectableUserOptions}
                placeholder={t('meetingLocal.form.organizerPlaceholder', '从用户中心选择会议发起人')}
              />
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
              name={isOnlineMeeting ? 'meetingSoftware' : 'meetingRoom'}
              label={locationLabel}
              rules={[{ required: true, message: locationValidation }]}
            >
              <Input placeholder={locationPlaceholder} />
            </AppForm.Item>
          </Col>
          <Col xs={24}>
            <AppForm.Item
              name="meetingId"
              label={meetingIdLabel}
              rules={[{ required: true, message: meetingIdValidation }]}
            >
              <Input placeholder={meetingIdPlaceholder} />
            </AppForm.Item>
          </Col>
          <Col xs={24}>
            <AppForm.Item
              name="attendeeUserIds"
              label={t('meetingLocal.form.attendees', '参会人')}
              rules={[{ required: true, type: 'array', min: 1, message: t('meetingLocal.validation.attendees', '请至少填写一位参会人') }]}
            >
              <Select
                mode="multiple"
                showSearch
                optionFilterProp="label"
                loading={usersLoading}
                options={selectableUserOptions}
                placeholder={t('meetingLocal.form.attendeesPlaceholder', '从用户中心选择参会人，可多选')}
              />
            </AppForm.Item>
          </Col>
        </Row>
      </AppForm>
    </AppModal>
  );
};

export default MeetingFormModal;
