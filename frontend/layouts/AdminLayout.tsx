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
    IdcardOutlined
} from '@ant-design/icons';
import AuthService from '../services/auth';

const { Header, Sider, Content, Footer } = Layout;

interface AdminLayoutProps {
    children: React.ReactNode;
    activeTab: 'dashboard' | 'news' | 'announcements' | 'employees' | 'users' | 'tools' | 'settings' | 'about_us' | 'org' | 'roles' | 'system_logs' | 'business_logs' | 'log_forwarding' | 'carousel';
    onTabChange: (tab: 'dashboard' | 'news' | 'announcements' | 'employees' | 'users' | 'tools' | 'settings' | 'about_us' | 'org' | 'roles' | 'system_logs' | 'business_logs' | 'log_forwarding' | 'carousel') => void;
    onExit: () => void;
    footerText?: string;
    logoUrl?: string; // New prop for Logo URL
    appName?: string; // New prop for App Name
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children, activeTab, onTabChange, onExit, footerText, logoUrl, appName }) => {
    const [collapsed, setCollapsed] = useState(false);
    const {
        token: { colorBgContainer, borderRadiusLG },
    } = theme.useToken();

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
            window.location.reload();
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
                    label: '员工管理',
                },
                {
                    key: 'users',
                    icon: <UserOutlined />, // Changed to UserOutlined to distinguish from parent
                    label: '系统账户',
                },
                {
                    key: 'roles',
                    icon: <SafetyCertificateOutlined />,
                    label: '角色管理',
                },
                {
                    key: 'org',
                    icon: <AppstoreOutlined />, // Changed icon to distinguish
                    label: '组织机构',
                },
            ],
        },
        {
            key: 'sub_logs',
            label: '日志管理',
            icon: <FileTextOutlined />,
            children: [
                { key: 'system_logs', label: '系统日志' },
                { key: 'business_logs', label: '业务日志' },
                { key: 'log_forwarding', label: '日志外发' },
            ]
        },
        {
            key: 'sub_system',
            label: '系统管理',
            icon: <SettingOutlined />,
            children: [
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
    return (
        <Layout style={{ minHeight: '100vh' }}>
            <Sider collapsible collapsed={collapsed} onCollapse={(value) => setCollapsed(value)} theme="light" width={250}>
                <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #f0f0f0' }}>
                    <div className="flex items-center space-x-2">
                        {logoUrl ? (
                            <img src={logoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-cover" />
                        ) : (
                            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
                                {(appName || 'A')[0].toUpperCase()}
                            </div>
                        )}
                        {!collapsed && <span className="font-bold text-lg text-slate-800">{appName ? `${appName} 后台管理` : 'Admin Portal'}</span>}
                    </div>
                </div>
                <Menu
                    theme="light"
                    defaultSelectedKeys={[activeTab]}
                    selectedKeys={[activeTab]}
                    mode="inline"
                    items={menuItems as any}
                    onClick={handleMenuClick}
                    style={{ borderRight: 0 }}
                />
            </Sider>
            <Layout>
                <Header style={{ padding: '0 24px', background: colorBgContainer, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <div className="flex items-center space-x-4">
                        <span className="text-slate-500">Welcome, Admin</span>
                        <Dropdown menu={{ items: userMenuItems as any, onClick: handleUserMenuClick }} placement="bottomRight">
                            <Avatar style={{ backgroundColor: '#1890ff', cursor: 'pointer' }} icon={<UserOutlined />} />
                        </Dropdown>
                    </div>
                </Header>
                <Content style={{ margin: '24px 16px', padding: 24, minHeight: 280, background: colorBgContainer, borderRadius: borderRadiusLG }}>
                    {children}
                </Content>
                <Footer style={{ textAlign: 'center', color: '#94a3b8' }}>
                    {footerText || '© 2025 侯钰熙 版权所有'}
                </Footer>
            </Layout>
        </Layout>
    );
};

export default AdminLayout;
