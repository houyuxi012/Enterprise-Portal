import React, { Suspense, lazy } from 'react';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import Select from 'antd/es/select';
import type { FormInstance } from 'antd/es/form';
import { useTranslation } from 'react-i18next';

import { AppForm, AppModal } from '@/modules/admin/components/ui';
import type { Employee } from '@/types';

const EmployeeAvatarUploadField = lazy(() => import('@/modules/admin/components/users/EmployeeAvatarUploadField'));

interface DepartmentOption {
  name: string;
  label: string;
}

interface EmployeeEditorModalProps {
  open: boolean;
  submitting: boolean;
  editingEmployee: Employee | null;
  form: FormInstance;
  departmentOptions: DepartmentOption[];
  onCancel: () => void;
  onSubmit: (values: any) => Promise<void> | void;
}

const EmployeeEditorModal: React.FC<EmployeeEditorModalProps> = ({
  open,
  submitting,
  editingEmployee,
  form,
  departmentOptions,
  onCancel,
  onSubmit,
}) => {
  const { t } = useTranslation();

  return (
    <AppModal
      title={editingEmployee ? t('userList.modal.editTitle') : t('userList.modal.createTitle')}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      okText={editingEmployee ? t('userList.modal.saveEdit') : t('userList.modal.create')}
      width={700}
    >
      <AppForm form={form} onFinish={onSubmit} initialValues={{ gender: 'male' }}>
        {open ? (
          <Suspense fallback={null}>
            <EmployeeAvatarUploadField form={form} />
          </Suspense>
        ) : null}

        <div className="grid grid-cols-2 gap-4">
          <AppForm.Item
            name="job_number"
            label={t('userList.form.jobNumber')}
          >
            <Input placeholder={t('userList.form.jobNumberPlaceholder')} />
          </AppForm.Item>
          <AppForm.Item
            name="account"
            label={t('userList.form.account')}
            rules={[{ required: true, message: t('userList.form.accountRequired') }]}
          >
            <Input placeholder={t('userList.form.accountPlaceholder')} />
          </AppForm.Item>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <AppForm.Item
            name="name"
            label={t('userList.form.name')}
            rules={[{ required: true, message: t('userList.form.nameRequired') }]}
          >
            <Input />
          </AppForm.Item>
          <AppForm.Item
            name="gender"
            label={t('userList.form.gender')}
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { value: 'male', label: t('userList.form.genderMale') },
                { value: 'female', label: t('userList.form.genderFemale') },
              ]}
            />
          </AppForm.Item>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <AppForm.Item
            name="department"
            label={t('userList.form.department')}
            rules={[{ required: true, message: t('userList.form.departmentRequired') }]}
          >
            <Select
              showSearch
              placeholder={t('userList.form.departmentPlaceholder')}
              optionFilterProp="label"
              options={departmentOptions.map((dept) => ({
                value: dept.name,
                label: dept.label,
              }))}
            />
          </AppForm.Item>
          <AppForm.Item
            name="role"
            label={t('userList.form.role')}
          >
            <Input placeholder={t('userList.form.rolePlaceholder')} />
          </AppForm.Item>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <AppForm.Item
            name="email"
            label={t('userList.form.email')}
            rules={[{ required: true, type: 'email', message: t('userList.form.emailRequired') }]}
          >
            <Input />
          </AppForm.Item>
          <AppForm.Item
            name="phone"
            label={t('userList.form.phone')}
            rules={[{ required: true, message: t('userList.form.phoneRequired') }]}
          >
            <Input />
          </AppForm.Item>
        </div>

        <AppForm.Item name="location" label={t('userList.form.location')}>
          <Input placeholder={t('userList.form.locationPlaceholder')} />
        </AppForm.Item>
      </AppForm>
    </AppModal>
  );
};

export default EmployeeEditorModal;
