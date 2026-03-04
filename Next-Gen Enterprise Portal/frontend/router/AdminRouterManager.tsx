import React, { lazy } from 'react';

const AdminLayout = lazy(() => import('../layouts/AdminLayout'));
const AdminDashboard = lazy(() => import('../pages/admin/AdminDashboard'));
const NewsList = lazy(() => import('../pages/admin/NewsList'));
const UserList = lazy(() => import('../pages/admin/UserList'));
const ToolList = lazy(() => import('../pages/admin/ToolList'));
const AppPermissions = lazy(() => import('../pages/admin/AppPermissions'));
const CarouselList = lazy(() => import('../pages/admin/CarouselList'));
const AnnouncementList = lazy(() => import('../pages/admin/AnnouncementList'));
const SystemSettings = lazy(() => import('../pages/admin/SystemSettings'));
const PlatformSettings = lazy(() => import('../pages/admin/PlatformSettings'));
const LicenseManagement = lazy(() => import('../pages/admin/LicenseManagement'));
const SecuritySettings = lazy(() => import('../pages/admin/SecuritySettings'));
const MfaSettings = lazy(() => import('../pages/admin/MfaSettings'));
const NotificationServices = lazy(() => import('../pages/admin/NotificationServices'));
const NotificationTemplates = lazy(() => import('../pages/admin/NotificationTemplates'));
const ThirdPartyNotifications = lazy(() => import('../pages/admin/ThirdPartyNotifications'));
const PasswordPolicy = lazy(() => import('../pages/admin/PasswordPolicy'));
const SystemUserList = lazy(() => import('../pages/admin/SystemUserList'));
const OnlineUsers = lazy(() => import('../pages/admin/OnlineUsers'));
const DirectoryListPage = lazy(() => import('../pages/admin/iam/directories'));
const RoleList = lazy(() => import('../pages/admin/RoleList'));
const OrganizationList = lazy(() => import('../pages/admin/OrganizationList'));
const BusinessLogs = lazy(() => import('../pages/admin/BusinessLogs'));
const AccessLogs = lazy(() => import('../pages/admin/logs/AccessLogs'));
const AboutUs = lazy(() => import('../pages/admin/AboutUs'));
const LogForwarding = lazy(() => import('../pages/admin/LogForwarding'));
const LogStorage = lazy(() => import('../pages/admin/LogStorage'));
const AIAudit = lazy(() => import('../pages/admin/logs/AIAudit'));
const ModelConfig = lazy(() => import('../pages/admin/ai/ModelConfig'));
const SecurityPolicy = lazy(() => import('../pages/admin/ai/SecurityPolicy'));
const AISettings = lazy(() => import('../pages/admin/ai/AISettings'));
const ModelUsagePage = lazy(() => import('../pages/admin/ai/ModelUsagePage'));
const KnowledgeBase = lazy(() => import('../pages/admin/ai/KnowledgeBase'));
const IAMAuditLogs = lazy(() => import('../pages/iam/AuditLogs'));
const AdminTodoList = lazy(() => import('../pages/admin/Todos'));

type LicenseGateMode = 'full' | 'blocked' | 'read_only';

interface AdminRouterManagerProps {
  effectiveAdminTab: string;
  onTabChange: (tab: string) => void;
  onExit: () => void;
  systemConfig: Record<string, string>;
  adminLicenseGateMode: LicenseGateMode;
  adminLicenseGateMessage: string;
  directoryLicenseBlocked: boolean;
  directoryLicenseMessage: string;
  customizationLicenseBlocked: boolean;
  customizationLicenseMessage: string;
  mfaSettingsLicenseBlocked: boolean;
  mfaSettingsLicenseMessage: string;
  employeesCount: number;
  newsCount: number;
  onDirectoryLicenseStateChange: (blocked: boolean, messageText: string) => void;
}

const AdminRouterManager: React.FC<AdminRouterManagerProps> = ({
  effectiveAdminTab,
  onTabChange,
  onExit,
  systemConfig,
  adminLicenseGateMode,
  adminLicenseGateMessage,
  directoryLicenseBlocked,
  directoryLicenseMessage,
  customizationLicenseBlocked,
  customizationLicenseMessage,
  mfaSettingsLicenseBlocked,
  mfaSettingsLicenseMessage,
  employeesCount,
  newsCount,
  onDirectoryLicenseStateChange,
}) => (
  <AdminLayout
    activeTab={effectiveAdminTab as any}
    onTabChange={onTabChange as any}
    onExit={onExit}
    footerText={systemConfig.footer_text}
    logoUrl={systemConfig.logo_url}
    appName={systemConfig.app_name}
    licenseGateMode={adminLicenseGateMode}
    licenseGateMessage={adminLicenseGateMessage}
    directoryLicenseBlocked={directoryLicenseBlocked}
    directoryLicenseMessage={directoryLicenseMessage}
    customizationLicenseBlocked={customizationLicenseBlocked}
    customizationLicenseMessage={customizationLicenseMessage}
    mfaSettingsLicenseBlocked={mfaSettingsLicenseBlocked}
    mfaSettingsLicenseMessage={mfaSettingsLicenseMessage}
  >
    {effectiveAdminTab === 'dashboard' && <AdminDashboard employeeCount={employeesCount} newsCount={newsCount} />}
    {effectiveAdminTab === 'news' && <NewsList />}
    {effectiveAdminTab === 'carousel' && <CarouselList />}
    {effectiveAdminTab === 'announcements' && <AnnouncementList />}
    {effectiveAdminTab === 'employees' && <UserList />}
    {effectiveAdminTab === 'users' && <SystemUserList />}
    {effectiveAdminTab === 'online_users' && <OnlineUsers />}
    {effectiveAdminTab === 'directories' && (
      <DirectoryListPage
        onLicenseStateChange={onDirectoryLicenseStateChange}
      />
    )}
    {effectiveAdminTab === 'roles' && <RoleList />}
    {effectiveAdminTab === 'tools' && <ToolList />}
    {effectiveAdminTab === 'app_permissions' && <AppPermissions />}
    {effectiveAdminTab === 'settings' && (
      <SystemSettings
        licenseBlocked={customizationLicenseBlocked}
        licenseBlockedMessage={customizationLicenseMessage}
      />
    )}
    {effectiveAdminTab === 'platform_settings' && <PlatformSettings />}
    {effectiveAdminTab === 'license' && <LicenseManagement />}
    {effectiveAdminTab === 'security' && <SecuritySettings />}
    {effectiveAdminTab === 'password_policy' && <PasswordPolicy />}
    {effectiveAdminTab === 'mfa_settings' && <MfaSettings />}
    {effectiveAdminTab === 'org' && <OrganizationList />}
    {effectiveAdminTab === 'business_logs' && <BusinessLogs />}
    {effectiveAdminTab === 'access_logs' && <AccessLogs />}
    {effectiveAdminTab === 'iam_audit_logs' && <IAMAuditLogs />}
    {effectiveAdminTab === 'ai_audit' && <AIAudit />}
    {effectiveAdminTab === 'log_forwarding' && <LogForwarding />}
    {effectiveAdminTab === 'log_storage' && <LogStorage />}
    {effectiveAdminTab === 'ai_models' && <ModelConfig />}
    {effectiveAdminTab === 'ai_security' && <SecurityPolicy />}
    {effectiveAdminTab === 'ai_settings' && <AISettings />}
    {effectiveAdminTab === 'ai_usage' && <ModelUsagePage />}
    {effectiveAdminTab === 'kb_manage' && <KnowledgeBase />}
    {effectiveAdminTab === 'todos' && <AdminTodoList />}
    {effectiveAdminTab === 'about_us' && <AboutUs />}
    {effectiveAdminTab === 'notification_services' && <NotificationServices />}
    {effectiveAdminTab === 'notification_templates' && <NotificationTemplates />}
    {effectiveAdminTab === 'third_party_notifications' && <ThirdPartyNotifications />}
  </AdminLayout>
);

export default AdminRouterManager;
