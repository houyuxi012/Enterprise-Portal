import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import App from 'antd/es/app';
import Alert from 'antd/es/alert';
import Badge from 'antd/es/badge';
import type { BadgeProps } from 'antd/es/badge';
import Card from 'antd/es/card';
import Col from 'antd/es/grid/col';
import Descriptions from 'antd/es/descriptions';
import List from 'antd/es/list';
import Popconfirm from 'antd/es/popconfirm';
import Row from 'antd/es/grid/row';
import Segmented from 'antd/es/segmented';
import Space from 'antd/es/space';
import Statistic from 'antd/es/statistic';
import Typography from 'antd/es/typography';
import type { ColumnsType } from 'antd/es/table';
import {
    CopyOutlined,
    DatabaseOutlined,
    ReloadOutlined,
    ScheduleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import ApiClient from '@/services/api';
import type {
    StorageStats,
    SystemBackupRecord,
    SystemBackupPreview,
    SystemHardwareInfo,
    SystemInfo,
    SystemResources,
    SystemVersion,
} from '@/types';
import { AppButton, AppPageHeader, AppTable } from '@/modules/admin/components/ui';

const BackupPlanDrawer = lazy(() => import('@/modules/admin/components/operations/BackupPlanDrawer'));
const BackupPreviewDrawer = lazy(() => import('@/modules/admin/components/operations/BackupPreviewDrawer'));
import type { BackupPlanFormValues } from '@/modules/admin/components/operations/BackupPlanDrawer';

interface NotificationHealthState {
    overall_status: 'healthy' | 'degraded' | 'disabled' | string;
    channels: {
        smtp: { enabled: boolean; configured: boolean; status: string; sender?: string };
        telegram: { enabled: boolean; configured: boolean; status: string };
        sms: { enabled: boolean; configured: boolean; status: string; provider?: string };
    };
}

interface StatusRow {
    key: string;
    name: string;
    detail: string;
    badgeStatus: BadgeProps['status'];
    statusLabel: string;
}

interface BackupPlanConfig {
    enabled: boolean;
    frequency: 'daily' | 'weekly';
    weekday: string;
    hour: number;
    retentionDays: number;
    targetType: 'local' | 'network';
    targetPath: string;
}

const BACKUP_CONFIG_DEFAULTS: BackupPlanConfig = {
    enabled: false,
    frequency: 'daily',
    weekday: '1',
    hour: 2,
    retentionDays: 14,
    targetType: 'local',
    targetPath: '',
};

const formatBytes = (bytes?: number | null): string => {
    if (!Number.isFinite(bytes || 0) || !bytes) return '-';
    const value = Number(bytes);
    if (value >= 1024 ** 4) return `${(value / 1024 ** 4).toFixed(2)} TB`;
    if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
    if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(2)} MB`;
    if (value >= 1024) return `${(value / 1024).toFixed(2)} KB`;
    return `${value} B`;
};

const formatDateTime = (value?: string | null): string => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
};

const normalizeRuntimeStatus = (value?: string | null): { badgeStatus: BadgeProps['status']; labelKey: string } => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return { badgeStatus: 'default', labelKey: 'unknown' };
    if (['success', 'healthy', 'active', 'enabled', 'ok', '已连接'].includes(normalized)) {
        return { badgeStatus: 'success', labelKey: 'healthy' };
    }
    if (['processing', 'running', 'syncing'].includes(normalized)) {
        return { badgeStatus: 'processing', labelKey: 'processing' };
    }
    if (['degraded', 'misconfigured', 'warning'].includes(normalized)) {
        return { badgeStatus: 'warning', labelKey: 'warning' };
    }
    if (['disabled', 'not_configured', 'not configured', 'stopped', 'unknown'].includes(normalized)) {
        return {
            badgeStatus: 'default',
            labelKey:
                normalized === 'disabled'
                    ? 'disabled'
                    : normalized === 'not_configured' || normalized === 'not configured'
                      ? 'notConfigured'
                      : 'unknown',
        };
    }
    if (['failed', 'error', '连接失败'].includes(normalized)) {
        return { badgeStatus: 'error', labelKey: 'failed' };
    }
    return { badgeStatus: 'default', labelKey: 'unknown' };
};

const buildBackupPlanConfig = (configMap: Record<string, string> | null | undefined): BackupPlanConfig => {
    const resolved = configMap || {};
    const parseInteger = (value: string | undefined, fallback: number, min: number, max: number) => {
        const parsed = Number.parseInt(String(value || ''), 10);
        if (Number.isNaN(parsed)) return fallback;
        return Math.max(min, Math.min(max, parsed));
    };

    const frequency = String(resolved.backup_schedule_frequency || BACKUP_CONFIG_DEFAULTS.frequency).toLowerCase();
    const targetType = String(resolved.backup_target_type || BACKUP_CONFIG_DEFAULTS.targetType).toLowerCase();

    return {
        enabled: String(resolved.backup_enabled || '').toLowerCase() === 'true',
        frequency: frequency === 'weekly' ? 'weekly' : 'daily',
        weekday: String(parseInteger(resolved.backup_schedule_weekday, Number(BACKUP_CONFIG_DEFAULTS.weekday), 1, 7)),
        hour: parseInteger(resolved.backup_schedule_hour, BACKUP_CONFIG_DEFAULTS.hour, 0, 23),
        retentionDays: parseInteger(resolved.backup_retention_days, BACKUP_CONFIG_DEFAULTS.retentionDays, 1, 3650),
        targetType: targetType === 'network' ? 'network' : 'local',
        targetPath: String(resolved.backup_target_path || '').trim(),
    };
};

const OperationsManagement: React.FC = () => {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [activeTab, setActiveTab] = useState<'server-monitoring' | 'backup-restore'>('server-monitoring');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [configSaving, setConfigSaving] = useState(false);
    const [configDrawerOpen, setConfigDrawerOpen] = useState(false);
    const [creatingBackup, setCreatingBackup] = useState(false);
    const [backupActionTarget, setBackupActionTarget] = useState<string | null>(null);
    const [backupActionType, setBackupActionType] = useState<'restore' | 'delete' | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [warningMessage, setWarningMessage] = useState<string | null>(null);
    const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
    const [versionInfo, setVersionInfo] = useState<SystemVersion | null>(null);
    const [resources, setResources] = useState<SystemResources | null>(null);
    const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
    const [notificationHealth, setNotificationHealth] = useState<NotificationHealthState | null>(null);
    const [hardwareInfo, setHardwareInfo] = useState<SystemHardwareInfo | null>(null);
    const [platformRuntime, setPlatformRuntime] = useState<Record<string, string>>({});
    const [backupConfig, setBackupConfig] = useState<BackupPlanConfig>(BACKUP_CONFIG_DEFAULTS);
    const [backups, setBackups] = useState<SystemBackupRecord[]>([]);
    const [backupPreview, setBackupPreview] = useState<SystemBackupPreview | null>(null);

    const weekdayOptions = useMemo(
        () => [
            { value: '1', label: t('operationsManagementPage.backup.weekdays.monday') },
            { value: '2', label: t('operationsManagementPage.backup.weekdays.tuesday') },
            { value: '3', label: t('operationsManagementPage.backup.weekdays.wednesday') },
            { value: '4', label: t('operationsManagementPage.backup.weekdays.thursday') },
            { value: '5', label: t('operationsManagementPage.backup.weekdays.friday') },
            { value: '6', label: t('operationsManagementPage.backup.weekdays.saturday') },
            { value: '7', label: t('operationsManagementPage.backup.weekdays.sunday') },
        ],
        [t],
    );

    const getWeekdayLabel = useCallback(
        (weekday: string) => weekdayOptions.find((item) => item.value === weekday)?.label || weekdayOptions[0]?.label || '-',
        [weekdayOptions],
    );

    const describeBackupSchedule = useCallback(
        (config: BackupPlanConfig) => {
            const hourLabel = `${String(config.hour).padStart(2, '0')}:00`;
            if (!config.enabled) {
                return t('operationsManagementPage.backup.plan.disabled');
            }
            if (!config.targetPath) {
                return t('operationsManagementPage.backup.plan.notConfigured');
            }
            if (config.frequency === 'weekly') {
                return t('operationsManagementPage.backup.plan.weeklyAt', {
                    weekday: getWeekdayLabel(config.weekday),
                    hour: hourLabel,
                });
            }
            return t('operationsManagementPage.backup.plan.dailyAt', { hour: hourLabel });
        },
        [getWeekdayLabel, t],
    );

    const computeNextBackupWindow = useCallback(
        (config: BackupPlanConfig) => {
            if (!config.enabled || !config.targetPath) {
                return t('operationsManagementPage.backup.plan.notScheduled');
            }

            const now = new Date();
            const nextRun = new Date(now);
            nextRun.setMinutes(0, 0, 0);
            nextRun.setHours(config.hour);

            if (config.frequency === 'daily') {
                if (nextRun <= now) {
                    nextRun.setDate(nextRun.getDate() + 1);
                }
            } else {
                const targetWeekday = config.weekday === '7' ? 0 : Number(config.weekday);
                const currentWeekday = now.getDay();
                let offset = targetWeekday - currentWeekday;
                if (offset < 0 || (offset === 0 && nextRun <= now)) {
                    offset += 7;
                }
                nextRun.setDate(now.getDate() + offset);
            }

            return nextRun.toLocaleString();
        },
        [t],
    );

    const refreshData = useCallback(async (options?: { notify?: boolean; firstLoad?: boolean }) => {
        const notify = Boolean(options?.notify);
        const firstLoad = Boolean(options?.firstLoad);

        if (firstLoad) {
            setLoading(true);
        } else {
            setRefreshing(true);
        }

        const results = await Promise.allSettled([
            ApiClient.getSystemInfo(),
            ApiClient.getSystemVersion(),
            ApiClient.getSystemResources(),
            ApiClient.getStorageStats(),
            ApiClient.getNotificationHealth(),
            ApiClient.getPlatformRuntimeStatus(),
            ApiClient.getSystemHardware(),
            ApiClient.getSystemConfig(),
            ApiClient.getSystemBackups(),
        ]);

        const [
            systemInfoResult,
            versionInfoResult,
            resourcesResult,
            storageResult,
            notificationResult,
            runtimeResult,
            hardwareResult,
            configResult,
            backupsResult,
        ] = results;

        let failedCount = 0;

        if (systemInfoResult.status === 'fulfilled') setSystemInfo(systemInfoResult.value);
        else failedCount += 1;

        if (versionInfoResult.status === 'fulfilled') setVersionInfo(versionInfoResult.value);
        else failedCount += 1;

        if (resourcesResult.status === 'fulfilled') setResources(resourcesResult.value);
        else failedCount += 1;

        if (storageResult.status === 'fulfilled') setStorageStats(storageResult.value);
        else failedCount += 1;

        if (notificationResult.status === 'fulfilled') setNotificationHealth(notificationResult.value);
        else failedCount += 1;

        if (runtimeResult.status === 'fulfilled') setPlatformRuntime(runtimeResult.value);
        else failedCount += 1;

        if (hardwareResult.status === 'fulfilled') setHardwareInfo(hardwareResult.value);
        else failedCount += 1;

        if (configResult.status === 'fulfilled') {
            const resolvedBackupConfig = buildBackupPlanConfig(configResult.value);
            setBackupConfig(resolvedBackupConfig);
        } else {
            failedCount += 1;
        }

        if (backupsResult.status === 'fulfilled') {
            setBackups(backupsResult.value);
        } else {
            failedCount += 1;
        }

        if (failedCount > 0) {
            const text = t('operationsManagementPage.messages.partialLoaded', { count: failedCount });
            setWarningMessage(text);
            if (notify) message.warning(text);
        } else {
            setWarningMessage(null);
            if (notify) message.success(t('operationsManagementPage.messages.refreshed'));
        }

        setLoading(false);
        setRefreshing(false);
    }, [t]);

    useEffect(() => {
        void refreshData({ firstLoad: true });
        const interval = window.setInterval(() => {
            void refreshData();
        }, 15000);
        return () => window.clearInterval(interval);
    }, [refreshData]);

    const handleRefresh = () => {
        void refreshData({ notify: true });
    };

    const handleBackupNow = async () => {
        setCreatingBackup(true);
        try {
            const backup = await ApiClient.createSystemBackup();
            message.success(t('operationsManagementPage.messages.backupCreated', { name: backup.name }));
            await refreshData();
        } catch {
            message.error(t('operationsManagementPage.messages.backupCreateFailed'));
        } finally {
            setCreatingBackup(false);
        }
    };

    const handlePreviewBackup = async (backupName: string) => {
        setPreviewLoading(true);
        setBackupPreview(null);
        setPreviewOpen(true);
        try {
            const preview = await ApiClient.getSystemBackupPreview(backupName);
            setBackupPreview(preview);
        } catch {
            setPreviewOpen(false);
            message.error(t('operationsManagementPage.messages.backupPreviewFailed'));
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleRestoreBackup = async (backupName: string) => {
        setBackupActionTarget(backupName);
        setBackupActionType('restore');
        try {
            await ApiClient.restoreSystemBackup(backupName);
            message.success(t('operationsManagementPage.messages.backupRestored', { name: backupName }));
            await refreshData();
        } catch {
            message.error(t('operationsManagementPage.messages.backupRestoreFailed'));
        } finally {
            setBackupActionTarget(null);
            setBackupActionType(null);
        }
    };

    const handleDeleteBackup = async (backupName: string) => {
        setBackupActionTarget(backupName);
        setBackupActionType('delete');
        try {
            await ApiClient.deleteSystemBackup(backupName);
            message.success(t('operationsManagementPage.messages.backupDeleted', { name: backupName }));
            await refreshData();
        } catch {
            message.error(t('operationsManagementPage.messages.backupDeleteFailed'));
        } finally {
            setBackupActionTarget(null);
            setBackupActionType(null);
        }
    };

    const handleOpenPlanConfig = () => {
        setConfigDrawerOpen(true);
    };

    const handleClosePlanConfig = () => {
        setConfigDrawerOpen(false);
    };

    const handleClosePreview = () => {
        setPreviewOpen(false);
        setBackupPreview(null);
    };

    const handleSaveBackupConfig = async (values: BackupPlanFormValues) => {
        setConfigSaving(true);
        try {
            const savedConfigMap = await ApiClient.updateSystemConfig({
                backup_enabled: String(values.enabled),
                backup_schedule_frequency: values.frequency,
                backup_schedule_weekday: String(values.weekday),
                backup_schedule_hour: String(values.hour),
                backup_retention_days: String(values.retentionDays),
                backup_target_type: values.targetType,
                backup_target_path: values.targetPath.trim(),
            });
            const resolved = buildBackupPlanConfig(savedConfigMap);
            setBackupConfig(resolved);
            setConfigDrawerOpen(false);
            message.success(t('operationsManagementPage.messages.backupConfigSaved'));
        } catch {
            message.error(t('operationsManagementPage.messages.backupConfigSaveFailed'));
        } finally {
            setConfigSaving(false);
        }
    };

    const handleCopyDeviceId = async () => {
        const deviceId = systemInfo?.serial_number || systemInfo?.license_id;
        if (!deviceId) {
            message.warning(t('operationsManagementPage.messages.copyFailed'));
            return;
        }
        try {
            await navigator.clipboard.writeText(deviceId);
            message.success(t('operationsManagementPage.messages.copySuccess'));
        } catch {
            message.error(t('operationsManagementPage.messages.copyFailed'));
        }
    };

    const platformStatusRows = useMemo<StatusRow[]>(() => {
        const databaseState = normalizeRuntimeStatus(systemInfo?.database);
        const notificationState = normalizeRuntimeStatus(notificationHealth?.overall_status);
        const applyState = normalizeRuntimeStatus(platformRuntime.platform_last_apply_status);
        const hookState = normalizeRuntimeStatus(platformRuntime.platform_last_hook_status);
        const storageState = storageStats ? normalizeRuntimeStatus('healthy') : normalizeRuntimeStatus('unknown');

        return [
            {
                key: 'database',
                name: t('operationsManagementPage.server.services.database'),
                detail: systemInfo?.database || '-',
                badgeStatus: databaseState.badgeStatus,
                statusLabel: t(`operationsManagementPage.server.status.${databaseState.labelKey}`),
            },
            {
                key: 'notification-center',
                name: t('operationsManagementPage.server.services.notificationCenter'),
                detail: notificationHealth?.overall_status || '-',
                badgeStatus: notificationState.badgeStatus,
                statusLabel: t(`operationsManagementPage.server.status.${notificationState.labelKey}`),
            },
            {
                key: 'platform-apply',
                name: t('operationsManagementPage.server.services.platformApply'),
                detail: formatDateTime(platformRuntime.platform_last_applied_at),
                badgeStatus: applyState.badgeStatus,
                statusLabel: t(`operationsManagementPage.server.status.${applyState.labelKey}`),
            },
            {
                key: 'platform-hook',
                name: t('operationsManagementPage.server.services.platformHook'),
                detail: platformRuntime.platform_last_hook_status || t('operationsManagementPage.server.runtime.notConfigured'),
                badgeStatus: hookState.badgeStatus,
                statusLabel: t(`operationsManagementPage.server.status.${hookState.labelKey}`),
            },
            {
                key: 'object-storage',
                name: t('operationsManagementPage.server.services.objectStorage'),
                detail: storageStats
                    ? `${formatBytes(storageStats.used_bytes)} / ${formatBytes(storageStats.total_bytes)}`
                    : '-',
                badgeStatus: storageState.badgeStatus,
                statusLabel: t(`operationsManagementPage.server.status.${storageState.labelKey}`),
            },
        ];
    }, [notificationHealth?.overall_status, platformRuntime.platform_last_applied_at, platformRuntime.platform_last_apply_status, platformRuntime.platform_last_hook_status, storageStats, systemInfo?.database, t]);

    const notificationRows = useMemo<StatusRow[]>(() => {
        if (!notificationHealth) {
            return [];
        }
        const smtp = notificationHealth.channels.smtp;
        const telegram = notificationHealth.channels.telegram;
        const sms = notificationHealth.channels.sms;
        const channelEntries = [
            {
                key: 'smtp',
                name: t('operationsManagementPage.server.services.smtp'),
                status: smtp.status,
                detail: smtp.sender || t('operationsManagementPage.server.runtime.notConfigured'),
            },
            {
                key: 'telegram',
                name: t('operationsManagementPage.server.services.telegram'),
                status: telegram.status,
                detail: telegram.configured ? t('operationsManagementPage.server.runtime.configured') : t('operationsManagementPage.server.runtime.notConfigured'),
            },
            {
                key: 'sms',
                name: t('operationsManagementPage.server.services.sms'),
                status: sms.status,
                detail: sms.provider || t('operationsManagementPage.server.runtime.notConfigured'),
            },
        ];

        return channelEntries.map((item) => {
            const runtimeState = normalizeRuntimeStatus(item.status);
            return {
                key: item.key,
                name: item.name,
                detail: item.detail,
                badgeStatus: runtimeState.badgeStatus,
                statusLabel: t(`operationsManagementPage.server.status.${runtimeState.labelKey}`),
            };
        });
    }, [notificationHealth, t]);

    const backupColumns: ColumnsType<SystemBackupRecord> = useMemo(
        () => [
            {
                title: t('operationsManagementPage.backup.table.name'),
                dataIndex: 'name',
                key: 'name',
                render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
            },
            {
                title: t('operationsManagementPage.backup.table.size'),
                dataIndex: 'size_bytes',
                key: 'size_bytes',
                width: 120,
                render: (value: number) => formatBytes(value),
            },
            {
                title: t('operationsManagementPage.backup.table.time'),
                dataIndex: 'created_at',
                key: 'created_at',
                width: 190,
                render: (value: string) => formatDateTime(value),
            },
            {
                title: t('operationsManagementPage.backup.table.version'),
                key: 'version',
                width: 180,
                render: (_value, record) => (
                    <div className="leading-6">
                        <div>{record.version || '-'}</div>
                        <Typography.Text type="secondary" className="text-xs">
                            Schema {record.schema_version || '-'}
                        </Typography.Text>
                    </div>
                ),
            },
            {
                title: t('operationsManagementPage.backup.table.pathType'),
                dataIndex: 'target_type',
                key: 'target_type',
                width: 140,
                render: (value: string) => (
                    value === 'network'
                        ? t('operationsManagementPage.backup.targetType.network')
                        : t('operationsManagementPage.backup.targetType.local')
                ),
            },
            {
                title: t('operationsManagementPage.backup.table.path'),
                dataIndex: 'path',
                key: 'path',
                ellipsis: true,
            },
            {
                title: t('operationsManagementPage.backup.table.actions'),
                key: 'actions',
                width: 240,
                render: (_value, record) => (
                    <Space size={4} wrap>
                        <AppButton intent="tertiary" size="sm" onClick={() => void handlePreviewBackup(record.name)}>
                            {t('operationsManagementPage.backup.record.preview')}
                        </AppButton>
                        <AppButton
                            intent="tertiary"
                            size="sm"
                            loading={backupActionTarget === record.name && backupActionType === 'restore'}
                            disabled={!record.restorable}
                            onClick={() => void handleRestoreBackup(record.name)}
                        >
                            {t('operationsManagementPage.backup.record.restore')}
                        </AppButton>
                        <Popconfirm
                            title={t('operationsManagementPage.backup.record.deleteConfirm')}
                            onConfirm={() => void handleDeleteBackup(record.name)}
                        >
                            <AppButton
                                intent="danger"
                                size="sm"
                                loading={backupActionTarget === record.name && backupActionType === 'delete'}
                            >
                                {t('operationsManagementPage.backup.record.delete')}
                            </AppButton>
                        </Popconfirm>
                    </Space>
                ),
            },
        ],
        [backupActionTarget, backupActionType, t],
    );

    const previewColumns: ColumnsType<SystemBackupPreview['diffs'][number]> = useMemo(
        () => [
            {
                title: t('operationsManagementPage.backup.preview.table.key'),
                dataIndex: 'key',
                key: 'key',
                render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
            },
            {
                title: t('operationsManagementPage.backup.preview.table.status'),
                dataIndex: 'status',
                key: 'status',
                width: 140,
                render: (value: 'create' | 'update') => {
                    const statusMeta =
                        value === 'create'
                            ? { badgeStatus: 'success' as BadgeProps['status'], label: t('operationsManagementPage.backup.preview.status.create') }
                            : { badgeStatus: 'processing' as BadgeProps['status'], label: t('operationsManagementPage.backup.preview.status.update') };
                    return <Badge status={statusMeta.badgeStatus} text={statusMeta.label} />;
                },
            },
            {
                title: t('operationsManagementPage.backup.preview.table.currentValue'),
                dataIndex: 'current_value',
                key: 'current_value',
                ellipsis: true,
                render: (value: string) => (
                    <Typography.Text type="secondary">
                        {value === '__MASKED__' ? t('operationsManagementPage.backup.preview.masked') : value || '-'}
                    </Typography.Text>
                ),
            },
            {
                title: t('operationsManagementPage.backup.preview.table.backupValue'),
                dataIndex: 'backup_value',
                key: 'backup_value',
                ellipsis: true,
                render: (value: string) => (
                    <Typography.Text type="secondary">
                        {value === '__MASKED__' ? t('operationsManagementPage.backup.preview.masked') : value || '-'}
                    </Typography.Text>
                ),
            },
        ],
        [t],
    );

    const backupPlanStatus = backupConfig.enabled
        ? t('operationsManagementPage.backup.plan.enabled')
        : t('operationsManagementPage.backup.plan.disabled');
    const backupTargetTypeLabel =
        backupConfig.targetType === 'network'
            ? t('operationsManagementPage.backup.targetType.network')
            : t('operationsManagementPage.backup.targetType.local');
    const nextBackupWindow = computeNextBackupWindow(backupConfig);
    const backupScheduleLabel = describeBackupSchedule(backupConfig);

    const serverTabContent = (
        <div className="space-y-6 pt-2">
            {warningMessage && (
                <Alert
                    type="warning"
                    showIcon
                    message={warningMessage}
                />
            )}

            <Row gutter={[16, 16]}>
                <Col xs={24} xl={14}>
                    <Card
                        loading={loading}
                        className="admin-card"
                        styles={{
                            body: {
                                background: 'linear-gradient(180deg, #eff6ff 0%, #ffffff 100%)',
                                padding: 24,
                            },
                        }}
                    >
                        <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-6 items-start">
                            <div className="px-6 py-4 text-center">
                                <img
                                    src="/images/ops0617.png"
                                    alt={t('operationsManagementPage.server.overview.title')}
                                    className="mx-auto mb-4 h-20 w-20 object-contain"
                                />
                                <Typography.Title level={2} className="!mb-0">
                                    {systemInfo?.status || t('operationsManagementPage.server.overview.running')}
                                </Typography.Title>
                            </div>
                            <Descriptions
                                column={1}
                                size="middle"
                                colon={false}
                                items={[
                                    {
                                        key: 'productVersion',
                                        label: t('operationsManagementPage.server.overview.productVersion'),
                                        children: versionInfo ? `${systemInfo?.software_name || '-'} / ${versionInfo.version}` : '-',
                                    },
                                    {
                                        key: 'databaseStatus',
                                        label: t('operationsManagementPage.server.overview.databaseStatus'),
                                        children: systemInfo?.database || '-',
                                    },
                                    {
                                        key: 'licenseExpiry',
                                        label: t('operationsManagementPage.server.overview.licenseExpiry'),
                                        children: formatDateTime(systemInfo?.license_expires_at),
                                    },
                                    {
                                        key: 'deviceId',
                                        label: t('operationsManagementPage.server.overview.deviceId'),
                                        children: (
                                            <Space size={8}>
                                                <Typography.Text>{systemInfo?.serial_number || '-'}</Typography.Text>
                                                <AppButton intent="tertiary" size="sm" icon={<CopyOutlined />} iconOnly onClick={handleCopyDeviceId} />
                                            </Space>
                                        ),
                                    },
                                    {
                                        key: 'buildRef',
                                        label: t('operationsManagementPage.server.overview.buildRef'),
                                        children: versionInfo?.release_id || versionInfo?.build_id || '-',
                                    },
                                ]}
                            />
                        </div>
                    </Card>
                </Col>
                <Col xs={24} xl={10}>
                    <Card loading={loading} className="admin-card h-full" title={t('operationsManagementPage.server.config.title')}>
                        <Descriptions
                            column={1}
                            size="middle"
                            colon={false}
                            items={[
                                {
                                    key: 'os',
                                    label: t('operationsManagementPage.server.config.os'),
                                    children: hardwareInfo ? `${hardwareInfo.system.os} ${hardwareInfo.system.release}` : '-',
                                },
                                {
                                    key: 'arch',
                                    label: t('operationsManagementPage.server.config.architecture'),
                                    children: hardwareInfo?.system.machine || '-',
                                },
                                {
                                    key: 'cpuModel',
                                    label: t('operationsManagementPage.server.config.cpuModel'),
                                    children: hardwareInfo?.cpu.model || '-',
                                },
                                {
                                    key: 'cpuTopology',
                                    label: t('operationsManagementPage.server.config.cpuTopology'),
                                    children: hardwareInfo
                                        ? `${hardwareInfo.cpu.logical_count || 0} logical / ${hardwareInfo.cpu.physical_count || 0} physical`
                                        : '-',
                                },
                                {
                                    key: 'memory',
                                    label: t('operationsManagementPage.server.config.memory'),
                                    children: resources ? `${resources.memory_used} / ${resources.memory_total}` : '-',
                                },
                                {
                                    key: 'disk',
                                    label: t('operationsManagementPage.server.config.disk'),
                                    children: hardwareInfo ? `${formatBytes(hardwareInfo.disk.total_bytes)} / ${hardwareInfo.disk.device}` : '-',
                                },
                                {
                                    key: 'diskFs',
                                    label: t('operationsManagementPage.server.config.diskFs'),
                                    children: hardwareInfo?.disk.fstype || '-',
                                },
                                {
                                    key: 'hostname',
                                    label: t('operationsManagementPage.server.config.hostname'),
                                    children: hardwareInfo?.host.hostname || '-',
                                },
                            ]}
                        />
                    </Card>
                </Col>
            </Row>

            <Row gutter={[16, 16]}>
                <Col xs={24}>
                    <Card loading={loading} className="admin-card h-full" title={t('operationsManagementPage.server.tables.platformServices')}>
                        <List
                            dataSource={platformStatusRows}
                            loading={loading && platformStatusRows.length === 0}
                            renderItem={(item) => (
                                <List.Item
                                    className="!px-0"
                                    actions={[<Badge key={`${item.key}-status`} status={item.badgeStatus} text={item.statusLabel} />]}
                                >
                                    <List.Item.Meta
                                        title={<Typography.Text strong>{item.name}</Typography.Text>}
                                        description={<Typography.Text type="secondary">{item.detail || '-'}</Typography.Text>}
                                    />
                                </List.Item>
                            )}
                        />
                    </Card>
                </Col>
            </Row>

            <Card loading={loading} className="admin-card" title={t('operationsManagementPage.server.tables.notificationChannels')}>
                <List
                    dataSource={notificationRows}
                    loading={loading && notificationRows.length === 0}
                    renderItem={(item) => (
                        <List.Item
                            className="!px-0"
                            actions={[<Badge key={`${item.key}-status`} status={item.badgeStatus} text={item.statusLabel} />]}
                        >
                            <List.Item.Meta
                                title={<Typography.Text strong>{item.name}</Typography.Text>}
                                description={<Typography.Text type="secondary">{item.detail || '-'}</Typography.Text>}
                            />
                        </List.Item>
                    )}
                />
            </Card>
        </div>
    );

    const backupTabContent = (
        <div className="space-y-6 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <Space wrap>
                    <AppButton intent="primary" icon={<DatabaseOutlined />} loading={creatingBackup} onClick={() => void handleBackupNow()}>
                        {t('operationsManagementPage.backup.actions.backupNow')}
                    </AppButton>
                    <AppButton intent="secondary" icon={<ScheduleOutlined />} onClick={handleOpenPlanConfig}>
                        {t('operationsManagementPage.backup.actions.scheduleConfig')}
                    </AppButton>
                </Space>
                <AppButton intent="secondary" icon={<ReloadOutlined />} loading={refreshing} onClick={handleRefresh}>
                    {t('operationsManagementPage.backup.actions.refresh')}
                </AppButton>
            </div>

            <Row gutter={[16, 16]}>
                <Col xs={24} md={8}>
                    <Card loading={loading} className="admin-card">
                        <Statistic
                            title={t('operationsManagementPage.backup.summary.storageUsage')}
                            value={storageStats?.used_percent || 0}
                            precision={2}
                            suffix="%"
                            valueStyle={{ color: '#1677ff', fontWeight: 700 }}
                        />
                    </Card>
                </Col>
                <Col xs={24} md={8}>
                    <Card loading={loading} className="admin-card">
                        <Statistic
                            title={t('operationsManagementPage.backup.summary.objectCount')}
                            value={storageStats?.object_count || 0}
                            valueStyle={{ fontWeight: 700 }}
                        />
                    </Card>
                </Col>
                <Col xs={24} md={8}>
                    <Card loading={loading} className="admin-card">
                        <Statistic
                            title={t('operationsManagementPage.backup.summary.backupCount')}
                            value={backups.length}
                            valueStyle={{ fontWeight: 700 }}
                        />
                    </Card>
                </Col>
            </Row>

            <Alert
                type="info"
                showIcon
                message={t('operationsManagementPage.backup.alert.message')}
            />

            <Row gutter={[16, 16]}>
                <Col xs={24} xl={12}>
                    <Card loading={loading} className="admin-card" title={t('operationsManagementPage.backup.plan.title')}>
                        <Descriptions
                            column={1}
                            size="middle"
                            colon={false}
                            items={[
                                {
                                    key: 'status',
                                    label: t('operationsManagementPage.backup.plan.status'),
                                    children: backupPlanStatus,
                                },
                                {
                                    key: 'schedule',
                                    label: t('operationsManagementPage.backup.plan.schedule'),
                                    children: backupScheduleLabel,
                                },
                                {
                                    key: 'nextWindow',
                                    label: t('operationsManagementPage.backup.plan.nextWindow'),
                                    children: nextBackupWindow,
                                },
                                {
                                    key: 'retention',
                                    label: t('operationsManagementPage.backup.plan.retention'),
                                    children: t('operationsManagementPage.backup.plan.retentionValue', { days: backupConfig.retentionDays }),
                                },
                                {
                                    key: 'targetType',
                                    label: t('operationsManagementPage.backup.plan.targetType'),
                                    children: backupTargetTypeLabel,
                                },
                                {
                                    key: 'targetPath',
                                    label: t('operationsManagementPage.backup.plan.targetPath'),
                                    children: backupConfig.targetPath || t('operationsManagementPage.backup.plan.notConfigured'),
                                },
                            ]}
                        />
                    </Card>
                </Col>
                <Col xs={24} xl={12}>
                    <Card loading={loading} className="admin-card" title={t('operationsManagementPage.backup.context.title')}>
                        <Descriptions
                            column={1}
                            size="middle"
                            colon={false}
                            items={[
                                {
                                    key: 'version',
                                    label: t('operationsManagementPage.backup.context.currentVersion'),
                                    children: versionInfo?.version || '-',
                                },
                                {
                                    key: 'schema',
                                    label: t('operationsManagementPage.backup.context.schemaVersion'),
                                    children: versionInfo?.db_schema_version || '-',
                                },
                                {
                                    key: 'build',
                                    label: t('operationsManagementPage.backup.context.buildId'),
                                    children: versionInfo?.release_id || versionInfo?.build_id || '-',
                                },
                                {
                                    key: 'free',
                                    label: t('operationsManagementPage.backup.context.availableStorage'),
                                    children: formatBytes(storageStats?.free_bytes),
                                },
                                {
                                    key: 'access',
                                    label: t('operationsManagementPage.backup.context.accessAddress'),
                                    children: systemInfo?.access_address || '-',
                                },
                            ]}
                        />
                    </Card>
                </Col>
            </Row>

            <Card loading={loading} className="admin-card" title={t('operationsManagementPage.backup.table.title')}>
                <AppTable<SystemBackupRecord>
                    rowKey="name"
                    columns={backupColumns}
                    dataSource={backups}
                    pagination={false}
                    size="middle"
                    locale={{ emptyText: t('operationsManagementPage.backup.table.empty') }}
                />
            </Card>
        </div>
    );

    const tabItems = [
        {
            key: 'server-monitoring' as const,
            label: t('operationsManagementPage.tabs.serverMonitoring'),
            children: serverTabContent,
        },
        {
            key: 'backup-restore' as const,
            label: t('operationsManagementPage.tabs.backupRestore'),
            children: backupTabContent,
        },
    ];

    const activeTabContent = tabItems.find((item) => item.key === activeTab)?.children || null;

    return (
        <div className="admin-page admin-page-spaced">
            <AppPageHeader
                title={t('operationsManagementPage.page.title')}
                subtitle={t('operationsManagementPage.page.subtitle')}
                action={(
                    <AppButton intent="secondary" icon={<ReloadOutlined />} loading={refreshing} onClick={handleRefresh}>
                        {t('operationsManagementPage.page.refresh')}
                    </AppButton>
                )}
            />

            <Card className="admin-card">
                <Space direction="vertical" size={16} className="w-full">
                    <Segmented
                        block
                        size="middle"
                        value={activeTab}
                        onChange={(value) => setActiveTab(value as 'server-monitoring' | 'backup-restore')}
                        options={tabItems.map((item) => ({ label: item.label, value: item.key }))}
                    />
                    {activeTabContent}
                </Space>
            </Card>

            {configDrawerOpen ? (
                <Suspense fallback={null}>
                        <BackupPlanDrawer
                            open={configDrawerOpen}
                            configSaving={configSaving}
                            backupConfig={backupConfig}
                            weekdayOptions={weekdayOptions}
                            onClose={handleClosePlanConfig}
                            onSubmit={handleSaveBackupConfig}
                    />
                </Suspense>
            ) : null}

            {previewOpen ? (
                <Suspense fallback={null}>
                    <BackupPreviewDrawer
                        open={previewOpen}
                        loading={previewLoading}
                        backupPreview={backupPreview}
                        previewColumns={previewColumns}
                        onClose={handleClosePreview}
                    />
                </Suspense>
            ) : null}
        </div>
    );
};

export default OperationsManagement;
