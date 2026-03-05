import React from 'react';
import { Card, Tag } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const NotificationTemplates: React.FC = () => {
    const { t } = useTranslation();

    return (
        <div>
            <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-800">{t('notificationTemplates.title')}</h2>
                <p className="text-sm text-slate-500 mt-1">{t('notificationTemplates.subtitle')}</p>
            </div>

            <Card className="shadow-sm border-slate-200">
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
                        <FileTextOutlined className="text-2xl text-blue-400" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-700 mb-2">{t('notificationTemplates.empty.title')}</h3>
                    <p className="text-sm text-slate-500 max-w-md">
                        {t('notificationTemplates.empty.description')}
                    </p>
                    <Tag color="processing" className="mt-4">{t('notificationTemplates.empty.tag')}</Tag>
                </div>
            </Card>
        </div>
    );
};

export default NotificationTemplates;
