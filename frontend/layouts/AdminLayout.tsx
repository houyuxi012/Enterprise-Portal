import React, { useState } from 'react';
import { Layout, Menu, Button, theme, Avatar, Dropdown } from 'antd';
import {
    DashboardOutlined,
    UserOutlined,
    TeamOutlined,
    FileTextOutlined,
    LogoutOutlined,
    HomeOutlined,
    SafetyCertificateOutlined
} from '@ant-design/icons';
import AuthService from '../services/auth';

const { Header, Sider, Content } = Layout;

interface AdminLayoutProps {
    children: React.ReactNode;
    activeTab: 'dashboard' | 'news' | 'employees' | 'users';
    onTabChange: (tab: 'dashboard' | 'news' | 'employees' | 'users') => void;
    onExit: () => void;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children, activeTab, onTabChange, onExit }) => {
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
            type: 'group',
            label: '内容管理',
            children: [
                {
                    key: 'news',
                    icon: <FileTextOutlined />,
                    label: '新闻公告',
                },
                {
                    key: 'employees',
                    icon: <TeamOutlined />,
                    label: '用户管理',
                },
            ],
        },
        {
            type: 'group',
            label: '系统管理',
            children: [
                {
                    key: 'users',
                    icon: <SafetyCertificateOutlined />,
                    label: '用户权限',
                },
            ],
        },
    ];

    const userMenuItems = [
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
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">A</div>
                        {!collapsed && <span className="font-bold text-lg text-slate-800">Admin Portal</span>}
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
            </Layout>
        </Layout>
    );
};

export default AdminLayout;
