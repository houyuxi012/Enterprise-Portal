import React from 'react';
import App from 'antd/es/app';
import Avatar from 'antd/es/avatar';
import Input from 'antd/es/input';
import type { FormInstance } from 'antd/es/form';
import { UserOutlined } from '@ant-design/icons';
import ApiClient from '@/services/api';
import { useTranslation } from 'react-i18next';
import UploadTriggerButton from '@/modules/admin/components/upload/UploadTriggerButton';
import { AppForm } from '@/modules/admin/components/ui';

interface EmployeeAvatarUploadFieldProps {
  form: FormInstance;
}

const EmployeeAvatarUploadField: React.FC<EmployeeAvatarUploadFieldProps> = ({ form }) => {
  const { t } = useTranslation();
  const { message } = App.useApp();

  return (
    <AppForm.Item label={t('userList.form.avatar')}>
      <div className="flex items-center gap-4">
        <AppForm.Item name="avatar" noStyle>
          <Input hidden />
        </AppForm.Item>
        <AppForm.Item shouldUpdate={(prev, curr) => prev.avatar !== curr.avatar} noStyle>
          {() => (
            <Avatar
              size={64}
              src={form.getFieldValue('avatar')}
              icon={<UserOutlined />}
              style={{ backgroundColor: form.getFieldValue('avatar') ? 'transparent' : '#bfbfbf' }}
            />
          )}
        </AppForm.Item>
        <UploadTriggerButton
          buttonLabel={t('userList.form.changeAvatar')}
          onSelect={async (file) => {
            try {
              const url = await ApiClient.uploadImage(file);
              form.setFieldsValue({ avatar: url });
              message.success(t('userList.messages.avatarUploadSuccess'));
            } catch {
              message.error(t('userList.messages.avatarUploadFailed'));
            }
          }}
        />
      </div>
    </AppForm.Item>
  );
};

export default EmployeeAvatarUploadField;
