import React from 'react';
import Alert from 'antd/es/alert';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import InputNumber from 'antd/es/input-number';
import Select from 'antd/es/select';
import Switch from 'antd/es/switch';
import { useTranslation } from 'react-i18next';

import { AppButton, AppDrawer } from '@/modules/admin/components/ui';

export interface BackupPlanFormValues {
    enabled: boolean;
    frequency: 'daily' | 'weekly';
    weekday: string;
    hour: number;
    retentionDays: number;
    targetType: 'local' | 'network';
    targetPath: string;
}

interface BackupPlanDrawerProps {
    open: boolean;
    configSaving: boolean;
    backupConfig: BackupPlanFormValues;
    weekdayOptions: Array<{ value: string; label: string }>;
    onClose: () => void;
    onSubmit: (values: BackupPlanFormValues) => Promise<void> | void;
}

const BackupPlanDrawer: React.FC<BackupPlanDrawerProps> = ({
    open,
    configSaving,
    backupConfig,
    weekdayOptions,
    onClose,
    onSubmit,
}) => {
    const { t } = useTranslation();
    const [backupForm] = Form.useForm<BackupPlanFormValues>();

    return (
        <AppDrawer
            title={t('operationsManagementPage.backup.drawer.title')}
            width={520}
            open={open}
            onClose={onClose}
            destroyOnClose={false}
            footer={(
                <div className="flex justify-end gap-3">
                    <AppButton intent="secondary" onClick={onClose}>
                        {t('operationsManagementPage.backup.drawer.cancel')}
                    </AppButton>
                    <AppButton intent="primary" loading={configSaving} onClick={() => void backupForm.submit()}>
                        {t('operationsManagementPage.backup.drawer.save')}
                    </AppButton>
                </div>
            )}
        >
            <div className="space-y-4">
                <Alert type="info" showIcon message={t('operationsManagementPage.backup.drawer.description')} />
                <Form<BackupPlanFormValues>
                    form={backupForm}
                    layout="vertical"
                    initialValues={backupConfig}
                    preserve={false}
                    onFinish={onSubmit}
                >
                    <Form.Item
                        name="enabled"
                        label={t('operationsManagementPage.backup.drawer.fields.enabled')}
                        valuePropName="checked"
                    >
                        <Switch />
                    </Form.Item>

                    <Form.Item
                        name="frequency"
                        label={t('operationsManagementPage.backup.drawer.fields.frequency')}
                        rules={[{ required: true, message: t('operationsManagementPage.backup.drawer.validation.frequencyRequired') }]}
                    >
                        <Select
                            options={[
                                { value: 'daily', label: t('operationsManagementPage.backup.frequency.daily') },
                                { value: 'weekly', label: t('operationsManagementPage.backup.frequency.weekly') },
                            ]}
                        />
                    </Form.Item>

                    <Form.Item shouldUpdate={(prev, next) => prev.frequency !== next.frequency} noStyle>
                        {({ getFieldValue }) =>
                            getFieldValue('frequency') === 'weekly' ? (
                                <Form.Item
                                    name="weekday"
                                    label={t('operationsManagementPage.backup.drawer.fields.weekday')}
                                    rules={[{ required: true, message: t('operationsManagementPage.backup.drawer.validation.weekdayRequired') }]}
                                >
                                    <Select options={weekdayOptions} />
                                </Form.Item>
                            ) : null
                        }
                    </Form.Item>

                    <Form.Item
                        name="hour"
                        label={t('operationsManagementPage.backup.drawer.fields.hour')}
                        rules={[{ required: true, message: t('operationsManagementPage.backup.drawer.validation.hourRequired') }]}
                    >
                        <InputNumber min={0} max={23} precision={0} className="w-full" />
                    </Form.Item>

                    <Form.Item
                        name="retentionDays"
                        label={t('operationsManagementPage.backup.drawer.fields.retentionDays')}
                        rules={[{ required: true, message: t('operationsManagementPage.backup.drawer.validation.retentionRequired') }]}
                    >
                        <InputNumber min={1} max={3650} precision={0} className="w-full" />
                    </Form.Item>

                    <Form.Item
                        name="targetType"
                        label={t('operationsManagementPage.backup.drawer.fields.targetType')}
                        rules={[{ required: true, message: t('operationsManagementPage.backup.drawer.validation.targetTypeRequired') }]}
                    >
                        <Select
                            options={[
                                { value: 'local', label: t('operationsManagementPage.backup.targetType.local') },
                                { value: 'network', label: t('operationsManagementPage.backup.targetType.network') },
                            ]}
                        />
                    </Form.Item>

                    <Form.Item
                        name="targetPath"
                        label={t('operationsManagementPage.backup.drawer.fields.targetPath')}
                        rules={[{ required: true, message: t('operationsManagementPage.backup.drawer.validation.targetPathRequired') }]}
                    >
                        <Input placeholder={t('operationsManagementPage.backup.drawer.placeholders.targetPath')} />
                    </Form.Item>
                </Form>
            </div>
        </AppDrawer>
    );
};

export default BackupPlanDrawer;
