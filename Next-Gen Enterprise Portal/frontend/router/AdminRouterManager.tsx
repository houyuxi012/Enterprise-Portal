import React, { lazy } from 'react';
import { moduleRouteRegistry } from '../app/router';

const AdminLayout = lazy(() => import('../layouts/AdminLayout'));
const {
  dashboard: AdminDashboard,
  news: NewsList,
  users: UserList,
  tools: ToolList,
  appPermissions: AppPermissions,
  carousel: CarouselList,
  announcements: AnnouncementList,
  systemSettings: SystemSettings,
  platformSettings: PlatformSettings,
  license: LicenseManagement,
  security: SecuritySettings,
  mfaSettings: MfaSettings,
  notificationServices: NotificationServices,
  notificationTemplates: NotificationTemplates,
  thirdPartyNotifications: ThirdPartyNotifications,
  passwordPolicy: PasswordPolicy,
  systemUsers: SystemUserList,
  onlineUsers: OnlineUsers,
  directories: DirectoryListPage,
  roles: RoleList,
  organizations: OrganizationList,
  businessLogs: BusinessLogs,
  accessLogs: AccessLogs,
  aboutUs: AboutUs,
  logForwarding: LogForwarding,
  logStorage: LogStorage,
  aiAudit: AIAudit,
  aiModels: ModelConfig,
  aiSecurity: SecurityPolicy,
  aiSettings: AISettings,
  aiUsage: ModelUsagePage,
  knowledgeBase: KnowledgeBase,
  todos: AdminTodoList,
} = moduleRouteRegistry.admin;
const { auditLogs: IAMAuditLogs } = moduleRouteRegistry.iam;

type LicenseGateMode = 'full' | 'blocked' | 'read_only';

export interface AdminRouterManagerProps {
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
