import React from 'react';
import { Card, Tag } from 'antd';
import { ApiOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const ThirdPartyNotifications: React.FC = () => {
    const { t } = useTranslation();

    return (
        <div>
            <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-800">{t('thirdPartyNotifications.title')}</h2>
                <p className="text-sm text-slate-500 mt-1">{t('thirdPartyNotifications.subtitle')}</p>
            </div>

            <Card className="shadow-sm border-slate-200">
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 bg-purple-50 rounded-2xl flex items-center justify-center mb-4">
                        <ApiOutlined className="text-2xl text-purple-400" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-700 mb-2">{t('thirdPartyNotifications.empty.title')}</h3>
                    <p className="text-sm text-slate-500 max-w-md">
                        {t('thirdPartyNotifications.empty.description')}
                    </p>
                    <Tag color="processing" className="mt-4">{t('thirdPartyNotifications.empty.tag')}</Tag>
                </div>
            </Card>
        </div>
    );
};

export default ThirdPartyNotifications;
