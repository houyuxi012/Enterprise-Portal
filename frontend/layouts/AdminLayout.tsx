import React, { useState } from 'react';
import { Layout, Menu, Button, theme, Avatar, Dropdown } from 'antd';
import {
    DashboardOutlined,
    UserOutlined,
    TeamOutlined,
    FileTextOutlined,
    NotificationOutlined,
    LogoutOutlined,
    HomeOutlined,
    SafetyCertificateOutlined,
    AppstoreOutlined,
    SettingOutlined,
    InfoCircleOutlined,
    PictureOutlined,
    IdcardOutlined,
    RobotOutlined,
    ApiOutlined,
    BarChartOutlined
} from '@ant-design/icons';
import AuthService from '../services/auth';
import { useAuth } from '../contexts/AuthContext';

const { Header, Sider, Content, Footer } = Layout;

interface AdminLayoutProps {
    children: React.ReactNode;
    activeTab: 'dashboard' | 'news' | 'announcements' | 'employees' | 'users' | 'tools' | 'settings' | 'about_us' | 'org' | 'roles' | 'system_logs' | 'business_logs' | 'access_logs' | 'log_forwarding' | 'log_storage' | 'system_logs_internal' | 'carousel' | 'security' | 'ai_models' | 'ai_security' | 'ai_settings' | 'ai_usage' | 'ai_audit' | 'iam_audit_logs';
    onTabChange: (tab: 'dashboard' | 'news' | 'announcements' | 'employees' | 'users' | 'tools' | 'settings' | 'about_us' | 'org' | 'roles' | 'system_logs' | 'business_logs' | 'access_logs' | 'log_forwarding' | 'log_storage' | 'system_logs_internal' | 'carousel' | 'security' | 'ai_models' | 'ai_security' | 'ai_settings' | 'ai_usage' | 'ai_audit' | 'iam_audit_logs') => void;
    onExit: () => void;
    footerText?: string;
    logoUrl?: string; // New prop for Logo URL
    appName?: string; // New prop for App Name
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children, activeTab, onTabChange, onExit, footerText, logoUrl, appName }) => {
    const [collapsed, setCollapsed] = useState(false);

    // We are overriding Antd token themes with CSS classes, but keeping this for safety
    const { token: { borderRadiusLG } } = theme.useToken();

    const handleMenuClick = (e: { key: string }) => {
        onTabChange(e.key as any);
    };

    const handleUserMenuClick = (e: { key: string }) => {
        if (e.key === 'exit') {
            onExit();
            return;
        }
        if (e.key === 'logout') {
            AuthService.logout();
            return;
        }
    };

    const menuItems = [
        {
            key: 'dashboard',
            icon: <DashboardOutlined />,
            label: '概览面板',
        },
        {
            key: 'sub_ai',
            label: 'AI 管理',
            icon: <RobotOutlined />,
            children: [
                {
                    key: 'ai_settings',
                    icon: <SettingOutlined />,
                    label: '基础设置',
                },
                {
                    key: 'ai_models',
                    icon: <ApiOutlined />,
                    label: '模型配置',
                },
                {
                    key: 'ai_usage',
                    icon: <BarChartOutlined />,
                    label: '模型用量',
                },
                {
                    key: 'ai_security',
                    icon: <SafetyCertificateOutlined />,
                    label: '安全策略',
                },
            ],
        },
        {
            key: 'sub_content',
            label: '内容管理',
            icon: <FileTextOutlined />,
            children: [
                {
                    key: 'news',
                    icon: <FileTextOutlined />,
                    label: '新闻资讯',
                },
                {
                    key: 'announcements',
                    icon: <NotificationOutlined />,
                    label: '实时公告',
                },
                {
                    key: 'carousel',
                    icon: <PictureOutlined />,
                    label: '轮播管理',
                },
                {
                    key: 'tools',
                    icon: <AppstoreOutlined />,
                    label: '应用管理',
                },
            ],
        },
        {
            key: 'sub_users',
            label: '用户管理',
            icon: <TeamOutlined />,
            children: [
                {
                    key: 'employees',
                    icon: <IdcardOutlined />,
                    label: '用户管理',
                },
                {
                    key: 'org',
                    icon: <AppstoreOutlined />,
                    label: '组织机构',
                },
            ],
        },

        {
            key: 'sub_logs',
            label: '日志管理',
            icon: <FileTextOutlined />,
            children: [
                { key: 'iam_audit_logs', label: 'IAM 审计' },
                { key: 'business_logs', label: '业务日志' },
                { key: 'access_logs', label: '访问日志' },
                { key: 'ai_audit', label: 'AI 审计' },
                { key: 'log_forwarding', label: '日志外发' },
                { key: 'log_storage', label: '存储设置' },
            ]
        },
        {
            key: 'sub_system',
            label: '系统管理',
            icon: <SettingOutlined />,
            children: [
                {
                    key: 'security',
                    icon: <SafetyCertificateOutlined />,
                    label: '安全设置',
                },
                {
                    key: 'users',
                    icon: <UserOutlined />,
                    label: '账户管理',
                },
                {
                    key: 'roles',
                    icon: <SafetyCertificateOutlined />,
                    label: '角色管理',
                },
                {
                    key: 'settings',
                    icon: <SettingOutlined />,
                    label: '客户化设置',
                },
                {
                    key: 'about_us',
                    icon: <InfoCircleOutlined />,
                    label: '关于我们',
                },
            ],
        },
    ]; const userMenuItems = [
        {
            key: 'exit',
            icon: <HomeOutlined />,
            label: '返回前台',
        },
        {
            type: 'divider',
        },
        {
            key: 'logout',
            icon: <LogoutOutlined />,
            label: '退出登录',
            danger: true,
        },
    ];

    const { user } = useAuth(); // Import user from AuthContext

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
                    <div className="flex items-center space-x-3 transition-all duration-300">
                        {logoUrl ? (
                            <img src={logoUrl} alt="Logo" className="w-10 h-10 rounded-xl object-cover shadow-sm" />
                        ) : (
                            <img src="/images/logo.png" alt="Logo" className="w-10 h-10 rounded-xl object-cover shadow-sm" />
                        )}
                        {!collapsed && (
                            <div className="flex flex-col">
                                <span className="font-black text-lg text-slate-900 dark:text-white leading-tight">{appName || 'Admin Portal'}</span>
                                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">下一代企业门户系统</span>
                            </div>
                        )}
                    </div>
                </div>

                <Menu
                    theme="light"
                    defaultSelectedKeys={[activeTab]}
                    selectedKeys={[activeTab]}
                    mode="inline"
                    items={menuItems as any}
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
                            <div className="text-sm font-bold text-slate-800 dark:text-white">{user?.name || user?.username || 'Admin User'}</div>
                            <div className="text-xs text-slate-500 font-medium">{user?.role || 'Administrator'}</div>
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
                    {children}
                </Content>

                <Footer className="text-center text-slate-400 dark:text-slate-600 bg-transparent py-6 font-medium text-xs tracking-wide">
                    {footerText || '© 2025 侯钰熙. All Rights Reserved.'}
                </Footer>
            </Layout>

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
