import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyOutlined,
  SearchOutlined,
  SyncOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import DirectoryService, {
  type DirectoryListParams,
  getApiErrorDetail,
  isLdapLicenseRequiredError,
} from '@/services/directory';
import DirectoryDrawer from './DirectoryDrawer';
import DirectoryCreateStarterModal from './DirectoryCreateStarterModal';
import DirectoryDetailDrawer from './DirectoryDetailDrawer';
import DirectoryTestModal from './DirectoryTestModal';
import type {
  DirectoryConfig,
  DirectoryCreatePayload,
  DirectoryCreateStarterValues,
  DirectoryDraftTestPayload,
  DirectoryTestResponse,
  DirectoryUpdatePayload,
} from './types';

const { Text } = Typography;
const { RangePicker } = DatePicker;
const DEFAULT_PAGE_SIZE = 10;

const normalizePermission = (code: string): string => {
  const value = String(code || '').trim();
  return value.startsWith('portal.') ? value.slice(7) : value;
};

type DirectoryTypeFilter = 'all' | 'ad' | 'ldap';
type DirectoryStatusFilter = 'all' | 'enabled' | 'disabled';

type DrawerState =
  | { open: false; mode: 'create' | 'edit'; data?: DirectoryConfig | null }
  | { open: true; mode: 'create' | 'edit'; data?: DirectoryConfig | null };

interface DirectoryListPageProps {
  onLicenseStateChange?: (blocked: boolean, message: string) => void;
}

interface InitialDirectoryQueryState {
  searchText: string;
  typeFilter: DirectoryTypeFilter;
  statusFilter: DirectoryStatusFilter;
  updatedAtRange: [Dayjs | null, Dayjs | null] | null;
  page: number;
  pageSize: number;
}

const parseInitialDirectoryQueryState = (): InitialDirectoryQueryState => {
  if (typeof window === 'undefined') {
    return {
      searchText: '',
      typeFilter: 'all',
      statusFilter: 'all',
      updatedAtRange: null,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const q = String(params.get('q') || '').trim();
  const rawType = String(params.get('type') || '').trim().toLowerCase();
  const rawEnabled = String(params.get('enabled') || '').trim().toLowerCase();
  const rawPage = Number(params.get('page') || 1);
  const rawPageSize = Number(params.get('page_size') || DEFAULT_PAGE_SIZE);
  const fromValue = params.get('updated_at_from');
  const toValue = params.get('updated_at_to');
  const from = fromValue ? dayjs(fromValue) : null;
  const to = toValue ? dayjs(toValue) : null;

  const typeFilter: DirectoryTypeFilter = rawType === 'ad' || rawType === 'ldap' ? rawType : 'all';
  const statusFilter: DirectoryStatusFilter =
    rawEnabled === 'true' ? 'enabled' : rawEnabled === 'false' ? 'disabled' : 'all';
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(Math.floor(rawPageSize), 100) : DEFAULT_PAGE_SIZE;
  const updatedAtRange = from?.isValid() || to?.isValid()
    ? [from?.isValid() ? from : null, to?.isValid() ? to : null] as [Dayjs | null, Dayjs | null]
    : null;

  return {
    searchText: q,
    typeFilter,
    statusFilter,
    updatedAtRange,
    page,
    pageSize,
  };
};

const DirectoryListPage: React.FC<DirectoryListPageProps> = ({ onLicenseStateChange }) => {
  const { t, i18n } = useTranslation();
  const { message } = App.useApp();
  const { user } = useAuth();
  const initialQueryState = useMemo(() => parseInitialDirectoryQueryState(), []);

  const [rows, setRows] = useState<DirectoryConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState(initialQueryState.searchText);
  const [typeFilter, setTypeFilter] = useState<DirectoryTypeFilter>(initialQueryState.typeFilter);
  const [statusFilter, setStatusFilter] = useState<DirectoryStatusFilter>(initialQueryState.statusFilter);
  const [updatedAtRange, setUpdatedAtRange] = useState<[Dayjs | null, Dayjs | null] | null>(initialQueryState.updatedAtRange);
  const [pageState, setPageState] = useState({ current: initialQueryState.page, pageSize: initialQueryState.pageSize, total: 0 });
  const [createStarterOpen, setCreateStarterOpen] = useState(false);
  const [createStarterDefaults, setCreateStarterDefaults] = useState<DirectoryCreateStarterValues | null>(null);
  const [drawerState, setDrawerState] = useState<DrawerState>({ open: false, mode: 'create', data: null });
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState<DirectoryConfig | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<DirectoryTestResponse | null>(null);
  const [testError, setTestError] = useState<{ code?: string; message?: string } | null>(null);
  const [licenseBlocked, setLicenseBlocked] = useState(false);
  const [licenseBlockedMessage, setLicenseBlockedMessage] = useState('');

  // ── Global delete-protection state ──
  const [deleteProtection, setDeleteProtection] = useState<{ delete_grace_days: number; delete_whitelist: string }>({ delete_grace_days: 7, delete_whitelist: '[]' });
  const [deleteProtectionModalOpen, setDeleteProtectionModalOpen] = useState(false);
  const [dpGraceDays, setDpGraceDays] = useState(7);
  const [dpWhitelistRules, setDpWhitelistRules] = useState<Array<{ type: string; pattern: string }>>([]);
  const [dpSaving, setDpSaving] = useState(false);

  const hasManagePermission = useMemo(() => {
    if (!user) return false;
    if (String(user.account_type || '').toUpperCase() === 'SYSTEM') return true;
    return (user.permissions || []).some((code) => normalizePermission(code) === 'iam:directory:manage');
  }, [user]);

  const actionDisabled = !hasManagePermission || licenseBlocked;
  const listParams = useMemo<DirectoryListParams>(() => {
    const params: DirectoryListParams = {};
    const keyword = searchText.trim();
    if (keyword) {
      params.q = keyword;
    }
    if (typeFilter !== 'all') {
      params.type = typeFilter;
    }
    if (statusFilter !== 'all') {
      params.enabled = statusFilter === 'enabled';
    }
    if (updatedAtRange?.[0]) {
      params.updated_at_from = dayjs(updatedAtRange[0]).startOf('day').toISOString();
    }
    if (updatedAtRange?.[1]) {
      params.updated_at_to = dayjs(updatedAtRange[1]).endOf('day').toISOString();
    }
    params.page = pageState.current;
    params.page_size = pageState.pageSize;
    return params;
  }, [searchText, typeFilter, statusFilter, updatedAtRange, pageState.current, pageState.pageSize]);
  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    const keyword = searchText.trim();
    if (keyword) {
      parts.push(t('directory.summary.keyword', { value: keyword }));
    }
    if (typeFilter !== 'all') {
      parts.push(
        t('directory.summary.type', {
          value: typeFilter === 'ad' ? t('directory.filters.typeAd') : t('directory.filters.typeLdap'),
        }),
      );
    }
    if (statusFilter !== 'all') {
      parts.push(
        t('directory.summary.status', {
          value: statusFilter === 'enabled' ? t('directory.status.enabled') : t('directory.status.disabled'),
        }),
      );
    }
    const from = updatedAtRange?.[0];
    const to = updatedAtRange?.[1];
    if (from && to) {
      parts.push(
        t('directory.summary.updatedAtRange', {
          from: dayjs(from).format('YYYY-MM-DD'),
          to: dayjs(to).format('YYYY-MM-DD'),
        }),
      );
    } else if (from) {
      parts.push(
        t('directory.summary.updatedAtFrom', {
          from: dayjs(from).format('YYYY-MM-DD'),
        }),
      );
    } else if (to) {
      parts.push(
        t('directory.summary.updatedAtTo', {
          to: dayjs(to).format('YYYY-MM-DD'),
        }),
      );
    }
    return parts.length ? parts.join(' · ') : t('directory.summary.none');
  }, [searchText, statusFilter, t, typeFilter, updatedAtRange]);

  const formatDateTime = (value?: string) => {
    if (!value) return '-';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    const locale = String(i18n.resolvedLanguage || i18n.language || 'zh-CN');
    return dt.toLocaleString(locale, { hour12: false });
  };

  const openLicenseTab = () => {
    localStorage.setItem('activeAdminTab', 'license');
    window.location.href = '/admin';
  };

  const getErrorMessage = (detail: { code?: string; message?: string }, fallback: string) => {
    if (!detail.code) return detail.message || fallback;
    const key = `directory.errors.${detail.code}`;
    const translated = t(key as any);
    return translated !== key ? translated : (detail.message || fallback);
  };

  const handleLicenseBlock = (error: any) => {
    const detail = getApiErrorDetail(error);
    const messageText = detail.message || t('directory.license.alert');
    setLicenseBlocked(true);
    setLicenseBlockedMessage(messageText);
    onLicenseStateChange?.(true, messageText);
    return messageText;
  };

  const fetchRows = async (params: DirectoryListParams = listParams) => {
    if (!hasManagePermission) return;
    setLoading(true);
    try {
      const data = await DirectoryService.listDirectories(params);
      setRows(data.items);
      setPageState((prev) => ({
        ...prev,
        current: data.page,
        pageSize: data.page_size,
        total: data.total,
      }));
      setLicenseBlocked(false);
      setLicenseBlockedMessage('');
      onLicenseStateChange?.(false, '');
    } catch (error: any) {
      if (isLdapLicenseRequiredError(error)) {
        handleLicenseBlock(error);
        setRows([]);
        setPageState((prev) => ({ ...prev, current: 1, total: 0 }));
      } else {
        const detail = getApiErrorDetail(error);
        message.error(detail.message || t('directory.messages.loadFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Delete protection ──
  const fetchDeleteProtection = useCallback(async () => {
    try {
      const data = await DirectoryService.getDeleteProtection();
      setDeleteProtection(data);
    } catch { /* ignore on first load */ }
  }, []);

  useEffect(() => {
    if (hasManagePermission) void fetchDeleteProtection();
  }, [hasManagePermission, fetchDeleteProtection]);

  const openDeleteProtectionModal = () => {
    setDpGraceDays(deleteProtection.delete_grace_days);
    try {
      setDpWhitelistRules(JSON.parse(deleteProtection.delete_whitelist || '[]'));
    } catch { setDpWhitelistRules([]); }
    setDeleteProtectionModalOpen(true);
  };

  const saveDeleteProtection = async () => {
    setDpSaving(true);
    try {
      const data = await DirectoryService.updateDeleteProtection({
        delete_grace_days: dpGraceDays,
        delete_whitelist: JSON.stringify(dpWhitelistRules),
      });
      setDeleteProtection(data);
      setDeleteProtectionModalOpen(false);
      message.success(t('directory.deleteProtection.saveSuccess'));
    } catch (error: any) {
      const detail = getApiErrorDetail(error);
      message.error(detail.message || t('directory.deleteProtection.saveFailed'));
    } finally {
      setDpSaving(false);
    }
  };

  useEffect(() => {
    if (!hasManagePermission) return;
    const timer = window.setTimeout(() => {
      void fetchRows();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [hasManagePermission, listParams]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const params = url.searchParams;
    const setOrDelete = (key: string, value?: string) => {
      if (value && String(value).trim() !== '') params.set(key, value);
      else params.delete(key);
    };
    setOrDelete('q', searchText.trim() || undefined);
    setOrDelete('type', typeFilter !== 'all' ? typeFilter : undefined);
    setOrDelete(
      'enabled',
      statusFilter === 'all' ? undefined : statusFilter === 'enabled' ? 'true' : 'false',
    );
    setOrDelete(
      'updated_at_from',
      updatedAtRange?.[0] ? dayjs(updatedAtRange[0]).startOf('day').toISOString() : undefined,
    );
    setOrDelete(
      'updated_at_to',
      updatedAtRange?.[1] ? dayjs(updatedAtRange[1]).endOf('day').toISOString() : undefined,
    );
    setOrDelete('page', pageState.current > 1 ? String(pageState.current) : undefined);
    setOrDelete(
      'page_size',
      pageState.pageSize !== DEFAULT_PAGE_SIZE ? String(pageState.pageSize) : undefined,
    );
    const nextSearch = params.toString();
    const next = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}`;
    const current = `${url.pathname}${url.search}`;
    if (next !== current) {
      window.history.replaceState(window.history.state, '', next);
    }
  }, [searchText, typeFilter, statusFilter, updatedAtRange, pageState.current, pageState.pageSize]);

  const handleResetFilters = () => {
    setSearchText('');
    setTypeFilter('all');
    setStatusFilter('all');
    setUpdatedAtRange(null);
    setPageState((prev) => ({ ...prev, current: 1, pageSize: DEFAULT_PAGE_SIZE }));
  };

  const handleClearUrlAndReset = () => {
    handleResetFilters();
    if (typeof window !== 'undefined') {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
  };

  const handleCreate = () => {
    if (actionDisabled) return;
    setCreateStarterOpen(true);
  };

  const handleConfirmStarter = (values: DirectoryCreateStarterValues) => {
    setCreateStarterDefaults(values);
    setCreateStarterOpen(false);
    setDrawerState({ open: true, mode: 'create', data: null });
  };

  const handleEdit = async (record: DirectoryConfig) => {
    if (actionDisabled) return;
    setDrawerLoading(true);
    try {
      const detail = await DirectoryService.getDirectory(record.id);
      setDrawerState({ open: true, mode: 'edit', data: detail });
    } catch (error: any) {
      if (isLdapLicenseRequiredError(error)) {
        message.warning(handleLicenseBlock(error));
      } else {
        const detail = getApiErrorDetail(error);
        message.error(detail.message || t('directory.messages.loadDetailFailed'));
      }
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleView = async (record: DirectoryConfig) => {
    setDrawerLoading(true);
    try {
      const detail = await DirectoryService.getDirectory(record.id);
      setDetailData(detail);
      setDetailOpen(true);
    } catch (error: any) {
      const detail = getApiErrorDetail(error);
      message.error(detail.message || t('directory.messages.loadDetailFailed'));
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleSubmitDrawer = async (payload: DirectoryCreatePayload | DirectoryUpdatePayload) => {
    setDrawerLoading(true);
    try {
      if (drawerState.mode === 'create') {
        await DirectoryService.createDirectory(payload as DirectoryCreatePayload);
        message.success(t('directory.messages.createSuccess'));
        setCreateStarterDefaults(null);
      } else if (drawerState.data?.id) {
        await DirectoryService.updateDirectory(drawerState.data.id, payload as DirectoryUpdatePayload);
        message.success(t('directory.messages.updateSuccess'));
      }
      setDrawerState({ open: false, mode: 'create', data: null });
      const nextParams: DirectoryListParams = {
        ...listParams,
        page: 1,
        page_size: pageState.pageSize,
      };
      setPageState((prev) => ({ ...prev, current: 1 }));
      await fetchRows(nextParams);
    } catch (error: any) {
      if (isLdapLicenseRequiredError(error)) {
        message.warning(handleLicenseBlock(error));
      } else {
        const detail = getApiErrorDetail(error);
        message.error(detail.message || t('directory.messages.saveFailed'));
      }
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleToggleEnabled = async (record: DirectoryConfig) => {
    if (actionDisabled) return;
    try {
      await DirectoryService.updateDirectory(record.id, { enabled: !record.enabled });
      message.success(record.enabled ? t('directory.messages.disableSuccess') : t('directory.messages.enableSuccess'));
      await fetchRows();
    } catch (error: any) {
      if (isLdapLicenseRequiredError(error)) {
        message.warning(handleLicenseBlock(error));
      } else {
        const detail = getApiErrorDetail(error);
        message.error(detail.message || t('directory.messages.toggleFailed'));
      }
    }
  };

  const handleSync = async (record: DirectoryConfig, isIncremental: boolean = false) => {
    const hideLoading = message.loading(t('directory.messages.syncRunning'), 0);
    try {
      const result = await DirectoryService.syncDirectory(record.id, isIncremental);
      message.success(
        t('directory.messages.syncSuccessDetails', {
          fetched: result.fetched_count,
          users: result.synced_user_count,
          orgs: result.synced_org_count,
          groups: result.synced_group_count,
          failed: result.failed_count,
        }),
      );
      await fetchRows();
    } catch (error: any) {
      if (isLdapLicenseRequiredError(error)) {
        message.warning(handleLicenseBlock(error));
      } else {
        const detail = getApiErrorDetail(error);
        message.error(detail.message || t('directory.messages.syncFailed'));
      }
    } finally {
      hideLoading();
    }
  };

  const handleTest = async (record: DirectoryConfig) => {
    setTestOpen(true);
    setTestLoading(true);
    setTestResult(null);
    setTestError(null);
    try {
      const result = await DirectoryService.testDirectory(record.id, {});
      setTestResult({
        ...result,
        attributes: {
          ...(result.attributes || {}),
          server: `${record.host}:${record.port}`,
          tls_mode: record.use_ssl ? 'LDAPS' : record.start_tls ? 'STARTTLS' : 'PLAIN',
          base_dn: record.base_dn,
        },
      });
      message.success(t('directory.messages.testSuccess'));
    } catch (error: any) {
      if (isLdapLicenseRequiredError(error)) {
        message.warning(handleLicenseBlock(error));
      }
      const detail = getApiErrorDetail(error);
      const errMsg = getErrorMessage(detail, t('directory.messages.testFailed'));
      setTestError({ code: detail.code, message: errMsg });
      message.error(errMsg);
    } finally {
      setTestLoading(false);
    }
  };

  const handleTestDraft = async (payload: DirectoryDraftTestPayload) => {
    setTestOpen(true);
    setTestLoading(true);
    setTestResult(null);
    setTestError(null);
    try {
      const result = await DirectoryService.testDirectoryDraft(payload);
      setTestResult({
        ...result,
        attributes: {
          ...(result.attributes || {}),
          server: `${payload.host}:${payload.port}`,
          tls_mode: payload.use_ssl ? 'LDAPS' : payload.start_tls ? 'STARTTLS' : 'PLAIN',
          base_dn: payload.base_dn,
        },
      });
      message.success(t('directory.messages.testSuccess'));
    } catch (error: any) {
      if (isLdapLicenseRequiredError(error)) {
        message.warning(handleLicenseBlock(error));
      }
      const detail = getApiErrorDetail(error);
      const errMsg = getErrorMessage(detail, t('directory.messages.testFailed'));
      setTestError({ code: detail.code, message: errMsg });
      message.error(errMsg);
    } finally {
      setTestLoading(false);
    }
  };

  const handleDrawerTest = async (payload: DirectoryDraftTestPayload) => {
    if (drawerState.mode === 'create') {
      await handleTestDraft(payload);
      return;
    }
    if (drawerState.mode === 'edit' && drawerState.data?.id) {
      const hasManualBindPasswordChange =
        payload.bind_password === '' ||
        (typeof payload.bind_password === 'string' && payload.bind_password.trim() !== '');
      if (hasManualBindPasswordChange) {
        await handleTestDraft(payload);
        return;
      }
      await handleTest(drawerState.data);
      return;
    }
    message.info(t('directory.messages.testAfterSave'));
  };

  const handleCloseDrawer = () => {
    if (drawerState.mode === 'create') {
      setCreateStarterDefaults(null);
    }
    setDrawerState({ open: false, mode: 'create', data: null });
  };

  const columns: ColumnsType<DirectoryConfig> = useMemo(() => {
    const baseColumns: ColumnsType<DirectoryConfig> = [
      {
        title: t('directory.table.name'),
        dataIndex: 'name',
        key: 'name',
        width: 200,
      },
      {
        title: t('directory.table.type'),
        dataIndex: 'type',
        key: 'type',
        width: 120,
        render: (value: string) => (
          <Tag color={String(value).toLowerCase() === 'ad' ? 'blue' : 'purple'}>
            {String(value).toLowerCase() === 'ad' ? t('directory.filters.typeAd') : t('directory.filters.typeLdap')}
          </Tag>
        ),
      },
      {
        title: t('directory.table.address'),
        key: 'address',
        width: 220,
        render: (_, record) => `${record.host}:${record.port}`,
      },
      {
        title: t('directory.table.security'),
        key: 'security',
        width: 180,
        render: (_, record) => (
          <Space size={4}>
            {record.use_ssl ? <Tag color="green">LDAPS</Tag> : null}
            {record.start_tls ? <Tag color="cyan">STARTTLS</Tag> : null}
            {!record.use_ssl && !record.start_tls ? <Tag>{t('directory.table.securityNone')}</Tag> : null}
          </Space>
        ),
      },
      {
        title: t('directory.table.baseDn'),
        dataIndex: 'base_dn',
        key: 'base_dn',
        ellipsis: true,
      },
      {
        title: t('directory.table.status'),
        dataIndex: 'enabled',
        key: 'enabled',
        width: 120,
        render: (enabled: boolean, record: DirectoryConfig) => (
          <div className="flex items-center gap-2">
            <Switch
              checked={enabled}
              onChange={() => void handleToggleEnabled(record)}
              size="small"
              disabled={actionDisabled || !hasManagePermission}
            />
            <Tag color={enabled ? 'success' : 'default'}>
              {enabled ? t('directory.status.enabled') : t('directory.status.disabled')}
            </Tag>
          </div>
        ),
      },
      {
        title: t('directory.table.updatedAt'),
        dataIndex: 'updated_at',
        key: 'updated_at',
        width: 190,
        render: (value: string) => <Text type="secondary">{formatDateTime(value)}</Text>,
      },
    ];

    const operationColumn: ColumnsType<DirectoryConfig>[number] = {
      title: t('directory.table.actions'),
      key: 'actions',
      fixed: 'right',
      width: hasManagePermission ? 200 : 100,
      render: (_, record) => (
        <Space size={8}>
          <Tooltip title={t('common.buttons.detail')}>
            <Button icon={<EyeOutlined />} onClick={() => void handleView(record)} />
          </Tooltip>
          {hasManagePermission ? (
            <>
              <Tooltip title={licenseBlocked ? t('directory.license.tooltip') : t('common.buttons.edit')}>
                <Button
                  icon={<EditOutlined />}
                  disabled={actionDisabled}
                  onClick={() => void handleEdit(record)}
                />
              </Tooltip>
              <Tooltip title={licenseBlocked ? t('directory.license.tooltip') : t('directory.actions.fullSync', '全量同步')}>
                <Button
                  icon={<SyncOutlined />}
                  disabled={actionDisabled || !record.enabled}
                  onClick={() => void handleSync(record, false)}
                />
              </Tooltip>
              <Tooltip title={licenseBlocked ? t('directory.license.tooltip') : t('directory.actions.incrementalSync', '增量同步')}>
                <Button
                  icon={<ThunderboltOutlined />}
                  disabled={actionDisabled || !record.enabled || !record.sync_cursor}
                  onClick={() => void handleSync(record, true)}
                />
              </Tooltip>
            </>
          ) : null}
        </Space>
      ),
    };

    return [...baseColumns, operationColumn];
  }, [t, hasManagePermission, actionDisabled, licenseBlocked]);

  return (
    <div className="bg-slate-50/50 dark:bg-slate-900/50 -m-6 min-h-full p-6">
      <Card className="rounded-2xl border border-slate-100 shadow-sm">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-xl font-black text-slate-900 dark:text-white">{t('directory.page.title')}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('directory.page.subtitle')}</p>
          </div>
          <Space size={12}>
            <Button icon={<ReloadOutlined />} onClick={() => void fetchRows()} loading={loading}>
              {t('common.buttons.refresh')}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={actionDisabled}
              onClick={handleCreate}
            >
              {t('directory.page.createButton')}
            </Button>
          </Space>
        </div>

        {!hasManagePermission ? (
          <Alert type="error" showIcon message={t('directory.permission.denied')} />
        ) : null}

        {licenseBlocked ? (
          <Alert
            type="warning"
            showIcon
            className="mb-4"
            message={licenseBlockedMessage || t('directory.license.alert')}
            action={
              <Button size="small" type="link" onClick={openLicenseTab}>
                {t('directory.license.goLicense')}
              </Button>
            }
          />
        ) : null}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Space size={12} wrap>
            <Input
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setPageState((prev) => ({ ...prev, current: 1 }));
              }}
              placeholder={t('directory.page.searchPlaceholder')}
              prefix={<SearchOutlined />}
              style={{ width: 320 }}
            />
            <Select
              value={typeFilter}
              onChange={(value) => {
                setTypeFilter(value);
                setPageState((prev) => ({ ...prev, current: 1 }));
              }}
              style={{ width: 160 }}
              options={[
                { value: 'all', label: t('directory.filters.typeAll') },
                { value: 'ad', label: t('directory.filters.typeAd') },
                { value: 'ldap', label: t('directory.filters.typeLdap') },
              ]}
            />
            <Select
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value);
                setPageState((prev) => ({ ...prev, current: 1 }));
              }}
              style={{ width: 160 }}
              options={[
                { value: 'all', label: t('directory.filters.statusAll') },
                { value: 'enabled', label: t('directory.status.enabled') },
                { value: 'disabled', label: t('directory.status.disabled') },
              ]}
            />
            <RangePicker
              value={updatedAtRange}
              onChange={(value) => {
                setUpdatedAtRange(value ? [value[0], value[1]] : null);
                setPageState((prev) => ({ ...prev, current: 1 }));
              }}
              allowEmpty={[true, true]}
              placeholder={[t('directory.filters.updatedAtStart'), t('directory.filters.updatedAtEnd')]}
            />
            <Button onClick={handleResetFilters}>{t('directory.filters.reset')}</Button>
          </Space>
          <Space size={8}>
            <Tooltip title={t('directory.deleteProtection.tooltip')}>
              <Button
                size="small"
                icon={<SafetyOutlined />}
                onClick={openDeleteProtectionModal}
                disabled={actionDisabled}
              >
                {t('directory.deleteProtection.buttonLabel', { days: deleteProtection.delete_grace_days })}
                {(() => {
                  try {
                    const rules = JSON.parse(deleteProtection.delete_whitelist || '[]');
                    return rules.length > 0 ? t('directory.deleteProtection.whitelistCount', { count: rules.length }) : '';
                  } catch { return ''; }
                })()}
              </Button>
            </Tooltip>
          </Space>
        </div>

        <Table<DirectoryConfig>
          rowKey="id"
          loading={loading || drawerLoading}
          columns={columns}
          dataSource={rows}
          pagination={{
            current: pageState.current,
            pageSize: pageState.pageSize,
            total: pageState.total,
            showSizeChanger: true,
            onChange: (page, pageSize) => {
              setPageState((prev) => ({
                ...prev,
                current: page,
                pageSize: pageSize || prev.pageSize,
              }));
            },
            showTotal: (total) => t('common.pagination.total', { count: total }),
          }}
          locale={{
            emptyText: (
              <Empty
                description={t('directory.empty.description')}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              >
                {hasManagePermission && !licenseBlocked ? (
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                    {t('directory.empty.createNow')}
                  </Button>
                ) : null}
              </Empty>
            ),
          }}
          scroll={{ x: 1400 }}
        />
      </Card>

      <DirectoryDrawer
        open={drawerState.open}
        mode={drawerState.mode}
        initialValue={drawerState.data}
        createDefaults={drawerState.mode === 'create' ? createStarterDefaults : null}
        loading={drawerLoading}
        testLoading={testLoading}
        actionsDisabled={actionDisabled}
        onCancel={handleCloseDrawer}
        onSubmit={handleSubmitDrawer}
        onTestConnection={handleDrawerTest}
      />
      <DirectoryCreateStarterModal
        open={createStarterOpen}
        onCancel={() => setCreateStarterOpen(false)}
        onConfirm={handleConfirmStarter}
      />

      <DirectoryDetailDrawer
        open={detailOpen}
        data={detailData}
        onClose={() => {
          setDetailOpen(false);
          setDetailData(null);
        }}
      />

      <DirectoryTestModal
        open={testOpen}
        loading={testLoading}
        result={testResult}
        error={testError}
        onClose={() => {
          setTestOpen(false);
          setTestResult(null);
          setTestError(null);
        }}
      />

      {/* ── 全局回收保护 Modal ── */}
      <Modal
        title={<><SafetyOutlined style={{ marginRight: 8 }} />{t('directory.deleteProtection.modalTitle')}</>}
        open={deleteProtectionModalOpen}
        onOk={() => void saveDeleteProtection()}
        onCancel={() => setDeleteProtectionModalOpen(false)}
        okText={t('directory.deleteProtection.save')}
        cancelText={t('directory.deleteProtection.cancel')}
        confirmLoading={dpSaving}
        width={560}
      >
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">{t('directory.deleteProtection.description')}</Text>
        </div>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={12}>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>{t('directory.deleteProtection.graceDaysLabel')}</div>
            <InputNumber min={0} max={365} value={dpGraceDays} onChange={(v) => setDpGraceDays(v ?? 7)} style={{ width: '100%' }} />
          </Col>
          <Col span={12}>
            <Text type="secondary" style={{ display: 'block', marginTop: 24, fontSize: 12 }}>
              {t('directory.deleteProtection.graceDaysHint')}
            </Text>
          </Col>
        </Row>
        <div style={{ marginBottom: 8, fontWeight: 500 }}>{t('directory.deleteProtection.whitelistLabel')}</div>
        <div style={{ marginBottom: 4 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('directory.deleteProtection.whitelistHint')}</Text>
        </div>
        {dpWhitelistRules.map((rule, idx) => (
          <Row key={idx} gutter={8} style={{ marginBottom: 8 }}>
            <Col span={8}>
              <Select
                size="small"
                value={rule.type}
                onChange={(val) => {
                  const copy = [...dpWhitelistRules];
                  copy[idx] = { ...copy[idx], type: val };
                  setDpWhitelistRules(copy);
                }}
                style={{ width: '100%' }}
                options={[
                  { value: 'username', label: t('directory.deleteProtection.typeUsername') },
                  { value: 'ou', label: t('directory.deleteProtection.typeOu') },
                  { value: 'group', label: t('directory.deleteProtection.typeGroup') },
                ]}
              />
            </Col>
            <Col span={12}>
              <Input
                size="small"
                placeholder={t('directory.deleteProtection.patternPlaceholder')}
                value={rule.pattern}
                onChange={(e) => {
                  const copy = [...dpWhitelistRules];
                  copy[idx] = { ...copy[idx], pattern: e.target.value };
                  setDpWhitelistRules(copy);
                }}
              />
            </Col>
            <Col span={4}>
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => setDpWhitelistRules(dpWhitelistRules.filter((_, i) => i !== idx))}
              />
            </Col>
          </Row>
        ))}
        <Button
          size="small"
          type="dashed"
          icon={<PlusOutlined />}
          onClick={() => setDpWhitelistRules([...dpWhitelistRules, { type: 'username', pattern: '' }])}
          style={{ width: '100%' }}
        >
          {t('directory.deleteProtection.addRule')}
        </Button>
      </Modal>
    </div>
  );
};

export default DirectoryListPage;
