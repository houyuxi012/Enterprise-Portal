import React from 'react';
import Alert from 'antd/es/alert';
import Card from 'antd/es/card';
import Col from 'antd/es/grid/col';
import Row from 'antd/es/grid/row';
import Statistic from 'antd/es/statistic';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';

import type { SystemBackupPreview } from '@/types';
import { AppDrawer, AppTable } from '@/modules/admin/components/ui';

interface BackupPreviewDrawerProps {
    open: boolean;
    loading: boolean;
    backupPreview: SystemBackupPreview | null;
    previewColumns: ColumnsType<SystemBackupPreview['diffs'][number]>;
    onClose: () => void;
}

const BackupPreviewDrawer: React.FC<BackupPreviewDrawerProps> = ({
    open,
    loading,
    backupPreview,
    previewColumns,
    onClose,
}) => {
    const { t } = useTranslation();

    return (
        <AppDrawer
            title={t('operationsManagementPage.backup.preview.title')}
            width={860}
            open={open}
            onClose={onClose}
            destroyOnClose
            hideFooter
        >
            <div className="space-y-6">
                <Alert
                    type="info"
                    showIcon
                    message={t('operationsManagementPage.backup.preview.description')}
                />

                <Row gutter={[16, 16]}>
                    <Col xs={24} md={6}>
                        <Card className="admin-card">
                            <Statistic
                                title={t('operationsManagementPage.backup.preview.summary.createCount')}
                                value={backupPreview?.summary.create_count || 0}
                                valueStyle={{ color: '#52c41a', fontWeight: 700 }}
                            />
                        </Card>
                    </Col>
                    <Col xs={24} md={6}>
                        <Card className="admin-card">
                            <Statistic
                                title={t('operationsManagementPage.backup.preview.summary.updateCount')}
                                value={backupPreview?.summary.update_count || 0}
                                valueStyle={{ color: '#1677ff', fontWeight: 700 }}
                            />
                        </Card>
                    </Col>
                    <Col xs={24} md={6}>
                        <Card className="admin-card">
                            <Statistic
                                title={t('operationsManagementPage.backup.preview.summary.unchangedCount')}
                                value={backupPreview?.summary.unchanged_count || 0}
                                valueStyle={{ fontWeight: 700 }}
                            />
                        </Card>
                    </Col>
                    <Col xs={24} md={6}>
                        <Card className="admin-card">
                            <Statistic
                                title={t('operationsManagementPage.backup.preview.summary.totalKeys')}
                                value={backupPreview?.summary.total_keys || 0}
                                valueStyle={{ fontWeight: 700 }}
                            />
                        </Card>
                    </Col>
                </Row>

                <Card className="admin-card" title={backupPreview?.backup.name || t('operationsManagementPage.backup.preview.title')}>
                    <AppTable<SystemBackupPreview['diffs'][number]>
                        rowKey="key"
                        columns={previewColumns}
                        dataSource={backupPreview?.diffs || []}
                        pagination={false}
                        size="middle"
                        loading={loading}
                        locale={{ emptyText: t('operationsManagementPage.backup.preview.table.empty') }}
                    />
                </Card>
            </div>
        </AppDrawer>
    );
};

export default BackupPreviewDrawer;
