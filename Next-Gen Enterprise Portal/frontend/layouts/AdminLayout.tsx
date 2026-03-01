import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Layout, Menu, theme, Avatar, Dropdown, Modal, Tooltip } from 'antd';
import {
    DashboardOutlined,
    UserOutlined,
    TeamOutlined,
    FileTextOutlined,
    NotificationOutlined,
    LogoutOutlined,
    SafetyCertificateOutlined,
    AppstoreOutlined,
    SettingOutlined,
    InfoCircleOutlined,
    PictureOutlined,
    IdcardOutlined,
    RobotOutlined,
    ApiOutlined,
    BarChartOutlined,
    KeyOutlined,
    BookOutlined,
    CheckSquareOutlined
} from '@ant-design/icons';
import AuthService from '../services/auth';
import { useAuth } from '../contexts/AuthContext';
import { getLocalizedRoleMeta } from '../utils/iamRoleI18n';
import { hasAdminAccess } from '../utils/adminAccess';
import { useTranslation } from 'react-i18next';
import { buildUserLanguageScope, normalizeLanguage } from '../i18n';

import VersionModal from '../components/VersionModal';
import AdminChangePasswordModal from '../components/AdminChangePasswordModal';
import LanguageSwitcher from '../components/LanguageSwitcher';

const { Header, Sider, Content, Footer } = Layout;

interface AdminLayoutProps {
    children: React.ReactNode;
    activeTab: 'dashboard' | 'news' | 'announcements' | 'employees' | 'users' | 'online_users' | 'directories' | 'tools' | 'settings' | 'about_us' | 'org' | 'roles' | 'system_logs' | 'business_logs' | 'access_logs' | 'log_forwarding' | 'log_storage' | 'system_logs_internal' | 'carousel' | 'security' | 'password_policy' | 'ai_models' | 'ai_security' | 'ai_settings' | 'ai_usage' | 'ai_audit' | 'iam_audit_logs' | 'kb_manage' | 'todos' | 'license' | 'app_permissions';
    onTabChange: (tab: 'dashboard' | 'news' | 'announcements' | 'employees' | 'users' | 'online_users' | 'directories' | 'tools' | 'settings' | 'about_us' | 'org' | 'roles' | 'system_logs' | 'business_logs' | 'access_logs' | 'log_forwarding' | 'log_storage' | 'system_logs_internal' | 'carousel' | 'security' | 'password_policy' | 'ai_models' | 'ai_security' | 'ai_settings' | 'ai_usage' | 'ai_audit' | 'iam_audit_logs' | 'kb_manage' | 'todos' | 'license' | 'app_permissions') => void;
    onExit: () => void;
    footerText?: string;
    logoUrl?: string; // New prop for Logo URL
    appName?: string; // New prop for App Name
    licenseGateMode?: 'full' | 'blocked' | 'read_only';
    licenseGateMessage?: string;
    directoryLicenseBlocked?: boolean;
    directoryLicenseMessage?: string;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({
    children,
    activeTab,
    onTabChange,
    onExit,
    footerText,
    logoUrl,
    appName,
    licenseGateMode = 'full',
    licenseGateMessage = '',
    directoryLicenseBlocked = false,
    directoryLicenseMessage = '',
}) => {
    const [collapsed, setCollapsed] = useState(false);
    const [versionModalOpen, setVersionModalOpen] = useState(false);
    const [changePasswordModalOpen, setChangePasswordModalOpen] = useState(false);
    const [forcePasswordChange, setForcePasswordChange] = useState(false);
    const [preferencesModalOpen, setPreferencesModalOpen] = useState(false);
    const { i18n, t } = useTranslation();
    const { user } = useAuth();

    // We are overriding Antd token themes with CSS classes, but keeping this for safety
    const { token: { borderRadiusLG } } = theme.useToken();

    const canManageDirectories = useMemo(() => {
        if (!user) return false;
        if ((user.account_type || '').toUpperCase() === 'SYSTEM') return true;
        const normalizePermission = (code: string) => {
            const value = String(code || '').trim();
            return value.startsWith('portal.') ? value.slice(7) : value;
        };
        return (user.permissions || []).some((code) => normalizePermission(code) === 'iam:directory:manage');
    }, [user]);

    const handleMenuClick = (e: { key: string }) => {
        if (licenseGateMode === 'blocked' && e.key !== 'license') {
            return;
        }
        onTabChange(e.key as any);
    };

    const handleUserMenuClick = (e: { key: string }) => {
        if (e.key === 'exit') {
            onExit();
            return;
        }
        if (e.key === 'logout') {
            AuthService.logout('/admin/login');
            return;
        }
        if (e.key === 'about') {
            setVersionModalOpen(true);
            return;
        }
        if (e.key === 'change_password') {
            setChangePasswordModalOpen(true);
            return;
        }
        if (e.key === 'preferences') {
            setPreferencesModalOpen(true);
            return;
        }
    };

    const menuItems = [
        {
            key: 'dashboard',
            icon: <DashboardOutlined />,
            label: t('adminLayout.menu.dashboard'),
        },
        {
            key: 'sub_ai',
            label: t('adminLayout.menu.ai'),
            icon: <RobotOutlined />,
            children: [
                {
                    key: 'ai_settings',
                    label: t('adminLayout.menu.aiSettings'),
                },
                {
                    key: 'ai_models',
                    label: t('adminLayout.menu.aiModels'),
                },
                {
                    key: 'ai_usage',
                    label: t('adminLayout.menu.aiUsage'),
                },
                {
                    key: 'ai_security',
                    label: t('adminLayout.menu.aiSecurity'),
                },
                {
                    key: 'kb_manage',
                    label: t('adminLayout.menu.kbManage'),
                },
            ],
        },
        {
            key: 'sub_content',
            label: t('adminLayout.menu.content'),
            icon: <FileTextOutlined />,
            children: [
                {
                    key: 'todos',
                    label: t('adminLayout.menu.todos'),
                },
                {
                    key: 'news',
                    label: t('adminLayout.menu.news'),
                },
                {
                    key: 'announcements',
                    label: t('adminLayout.menu.announcements'),
                },
                {
                    key: 'carousel',
                    label: t('adminLayout.menu.carousel'),
                },

            ],
        },
        {
            key: 'sub_apps',
            label: t('adminLayout.menu.apps'),
            icon: <AppstoreOutlined />,
            children: [
                {
                    key: 'tools',
                    label: t('adminLayout.menu.tools'),
                },
                {
                    key: 'app_permissions',
                    label: t('adminLayout.menu.appPermissions'),
                },
            ],
        },
        {
            key: 'sub_users',
            label: t('adminLayout.menu.users'),
            icon: <TeamOutlined />,
            children: [
                {
                    key: 'employees',
                    label: t('adminLayout.menu.employees'),
                },
                {
                    key: 'org',
                    label: t('adminLayout.menu.org'),
                },
                {
                    key: 'users',
                    label: t('adminLayout.menu.systemUsers'),
                },
                {
                    key: 'online_users',
                    label: t('adminLayout.menu.onlineUsers'),
                },
                ...(canManageDirectories ? [{
                    key: 'directories',
                    label: directoryLicenseBlocked ? (
                        <Tooltip title={directoryLicenseMessage || t('adminLayout.menu.ldapLicenseRequired')}>
                            <span>{t('adminLayout.menu.identitySources')}</span>
                        </Tooltip>
                    ) : t('adminLayout.menu.identitySources'),
                    disabled: directoryLicenseBlocked,
                }] : []),
                {
                    key: 'roles',
                    label: t('adminLayout.menu.roles'),
                },
            ],
        },

        {
            key: 'sub_logs',
            label: t('adminLayout.menu.logs'),
            icon: <FileTextOutlined />,
            children: [
                { key: 'iam_audit_logs', label: t('adminLayout.menu.iamAudit') },
                { key: 'business_logs', label: t('adminLayout.menu.businessLogs') },
                { key: 'access_logs', label: t('adminLayout.menu.accessLogs') },
                { key: 'ai_audit', label: t('adminLayout.menu.aiAudit') },
                { key: 'log_forwarding', label: t('adminLayout.menu.logForwarding') },
                { key: 'log_storage', label: t('adminLayout.menu.logStorage') },
            ]
        },
        {
            key: 'sub_security',
            label: t('adminLayout.menu.security'),
            icon: <SafetyCertificateOutlined />,
            children: [
                {
                    key: 'security',
                    label: t('adminLayout.menu.securityBasic'),
                },
                {
                    key: 'password_policy',
                    label: t('adminLayout.menu.passwordPolicy'),
                },
            ]
        },
        {
            key: 'sub_system',
            label: t('adminLayout.menu.system'),
            icon: <SettingOutlined />,
            children: [
                {
                    key: 'settings',
                    label: t('adminLayout.menu.customization'),
                },
                {
                    key: 'license',
                    label: t('adminLayout.menu.license'),
                },
                {
                    key: 'about_us',
                    label: t('adminLayout.menu.aboutUs'),
                },
            ],
        },
    ];

    const limitedMenuItems = [
        {
            key: 'sub_system',
            label: t('adminLayout.menu.system'),
            icon: <SettingOutlined />,
            children: [
                {
                    key: 'license',
                    label: t('adminLayout.menu.license'),
                },
            ],
        },
    ];

    const effectiveMenuItems = licenseGateMode === 'blocked' ? limitedMenuItems : menuItems;

    const userMenuItems = [
        {
            key: 'about',
            icon: <InfoCircleOutlined />,
            label: t('adminLayout.userMenu.version'),
        },
        {
            key: 'preferences',
            icon: <SettingOutlined />,
            label: t('adminLayout.userMenu.preferences'),
        },
        {
            key: 'change_password',
            icon: <KeyOutlined />,
            label: t('adminLayout.userMenu.changePassword'),
        },
        {
            type: 'divider',
        },
        {
            key: 'logout',
            icon: <LogoutOutlined />,
            label: t('adminLayout.userMenu.logout'),
            danger: true,
        },
    ];

    const languageScope = buildUserLanguageScope(user);
    const locale = normalizeLanguage(i18n.resolvedLanguage || i18n.language);
    const isEnglish = locale === 'en-US';
    const fallbackAdminLabel = t('adminLayout.role.admin');
    const primaryRole = user?.roles?.[0];
    const localizedPrimaryRole = primaryRole
        ? getLocalizedRoleMeta({ code: primaryRole.code, name: primaryRole.name }, locale).name
        : undefined;
    const displayRole = localizedPrimaryRole || (hasAdminAccess(user) ? fallbackAdminLabel : t('adminLayout.role.user'));
    const brandName = appName || t('adminLayout.branding.fallbackAppName');
    const compactBrandTitle = isEnglish || brandName.length > 18;

    useEffect(() => {
        const shouldForce = Boolean(user?.password_change_required);
        setForcePasswordChange(shouldForce);
        if (shouldForce) {
            setChangePasswordModalOpen(true);
        }
    }, [user?.id, user?.password_change_required]);

    return (
        <Layout className="min-h-screen bg-slate-50 dark:bg-slate-900">
            {/* Sidebar with Glassmorphism / Soft Style */}
            <Sider
                collapsible
                collapsed={collapsed}
                onCollapse={(value) => setCollapsed(value)}
                theme="light"
                width={260}
                className="shadow-2xl shadow-slate-200/50 dark:shadow-none border-r border-slate-100 dark:border-slate-800 z-20"
                style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(10px)',
                }}
            >
                <div className="h-20 flex items-center justify-center border-b border-slate-50 dark:border-slate-800/50 mb-2">
                    <div className="flex items-center space-x-3 transition-all duration-300 w-full px-4 overflow-hidden">
                        {logoUrl ? (
                            <img src={logoUrl} alt="Logo" className="w-10 h-10 rounded-xl object-cover shadow-sm flex-shrink-0" />
                        ) : (
                            <img src="/images/logo.png" alt="Logo" className="w-10 h-10 rounded-xl object-cover shadow-sm flex-shrink-0" />
                        )}
                        {!collapsed && (
                            <div className="flex flex-col overflow-hidden min-w-0 flex-1">
                                <span
                                    className={`font-black text-slate-900 dark:text-white leading-tight w-full block break-words ${compactBrandTitle ? 'text-base' : 'text-lg'}`}
                                >
                                    {brandName}
                                </span>
                                <span
                                    className={`uppercase font-bold text-slate-400 w-full block break-words ${isEnglish ? 'text-[9px] tracking-[0.06em] leading-tight' : 'text-[10px] tracking-widest'}`}
                                >
                                    {t('adminLayout.branding.tagline')}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                <Menu
                    theme="light"
                    defaultSelectedKeys={[activeTab]}
                    selectedKeys={[activeTab]}
                    mode="inline"
                    items={effectiveMenuItems as any}
                    onClick={handleMenuClick}
                    className="border-none px-2 space-y-1 bg-transparent admin-menu"
                    style={{ background: 'transparent' }}
                />
            </Sider>

            <Layout className="bg-transparent">
                {/* Header - Floating & Transparent */}
                <Header className="px-8 h-20 bg-transparent flex justify-end items-center z-10 backdrop-blur-sm sticky top-0">
                    <div className="flex items-center space-x-6">
                        <div className="text-right hidden sm:block">
                            <div className="text-sm font-bold text-slate-800 dark:text-white">{user?.name || user?.username || t('adminLayout.branding.fallbackAdminUser')}</div>
                            <div className="text-xs text-slate-500 font-medium">{displayRole}</div>
                        </div>
                        <Dropdown menu={{ items: userMenuItems as any, onClick: handleUserMenuClick }} placement="bottomRight" trigger={['click']}>
                            <div className="cursor-pointer p-1 rounded-full border-2 border-white dark:border-slate-700 shadow-md hover:shadow-lg transition-shadow">
                                <Avatar
                                    size={40}
                                    src={user?.avatar}
                                    style={{ backgroundColor: user?.avatar ? 'transparent' : '#3b82f6' }}
                                    icon={<UserOutlined />}
                                    className={user?.avatar ? "" : "bg-gradient-to-br from-blue-500 to-indigo-600"}
                                >
                                    {!user?.avatar && (user?.name?.[0] || user?.username?.[0] || 'A').toUpperCase()}
                                </Avatar>
                            </div>
                        </Dropdown>
                    </div>
                </Header>

                <Content className="m-6 mt-2 p-6 min-h-[280px] overflow-visible">
                    {licenseGateMode === 'blocked' && (
                        <Alert
                            type="warning"
                            showIcon
                            className="mb-4"
                            message={licenseGateMessage || t('adminLayout.alerts.licenseBlocked')}
                        />
                    )}
                    {licenseGateMode === 'read_only' && (
                        <Alert
                            type="info"
                            showIcon
                            className="mb-4"
                            message={licenseGateMessage || t('adminLayout.alerts.licenseReadOnly')}
                        />
                    )}
                    {children}
                </Content>

                <Footer className="text-center text-slate-400 dark:text-slate-600 bg-transparent py-6 font-medium text-xs tracking-wide">
                    {footerText || t('adminLayout.footerDefault')}
                </Footer>
            </Layout>

            {/* Modals */}
            <VersionModal open={versionModalOpen} onClose={() => setVersionModalOpen(false)} />
            <AdminChangePasswordModal
                open={changePasswordModalOpen}
                onClose={() => {
                    if (forcePasswordChange) return;
                    setChangePasswordModalOpen(false);
                }}
                onSuccess={() => {
                    setForcePasswordChange(false);
                    setChangePasswordModalOpen(false);
                }}
                forceMode={forcePasswordChange}
            />
            <Modal
                title={t('adminLayout.preferences.title')}
                open={preferencesModalOpen}
                onCancel={() => setPreferencesModalOpen(false)}
                footer={null}
                width={420}
            >
                <div className="space-y-2">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        {t('adminLayout.preferences.language')}
                    </div>
                    <LanguageSwitcher size="middle" className="w-full" storageScope={languageScope} />
                </div>
            </Modal>

            {/* Global Styles specific to Admin to override Antd defaults directly */}
            <style>{`
                /* Customize Menu Item Selection */
                .admin-menu .ant-menu-item {
                    border-radius: 12px !important;
                    margin-bottom: 4px !important;
                    font-weight: 600 !important;
                }
                .admin-menu .ant-menu-item-selected {
                    background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%) !important;
                    color: #2563eb !important;
                }
                /* Dark mode adjustments would go here if we had full dark mode classes passed down */
            `}</style>
        </Layout>
    );
};

export default AdminLayout;
