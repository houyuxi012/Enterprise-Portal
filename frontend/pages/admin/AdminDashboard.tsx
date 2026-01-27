import React from 'react';
import { Card, Col, Row, Statistic, Button, Space } from 'antd';
import {
    UserOutlined,
    FileTextOutlined,
    ThunderboltOutlined,
    PlusOutlined,
    CloudServerOutlined,
    FileSearchOutlined
} from '@ant-design/icons';

interface AdminDashboardProps {
    employeeCount: number;
    newsCount: number;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ employeeCount, newsCount }) => {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold mb-2">概览面板</h1>
                <p className="text-gray-500">欢迎常来，这里是您的管理控制台。</p>
            </div>

            <Row gutter={16}>
                <Col span={8}>
                    <Card bordered={false}>
                        <Statistic
                            title="总用户数"
                            value={employeeCount}
                            prefix={<UserOutlined />}
                            valueStyle={{ color: '#3f8600' }}
                        />
                        <div className="mt-2 text-xs text-gray-400">较上月 +12%</div>
                    </Card>
                </Col>
                <Col span={8}>
                    <Card bordered={false}>
                        <Statistic
                            title="已发布资讯"
                            value={newsCount}
                            prefix={<FileTextOutlined />}
                            valueStyle={{ color: '#cf1322' }}
                        />
                        <div className="mt-2 text-xs text-gray-400">本周新增 +3</div>
                    </Card>
                </Col>
                <Col span={8}>
                    <Card bordered={false}>
                        <Statistic
                            title="系统状态"
                            value="运行中"
                            prefix={<ThunderboltOutlined />}
                            valueStyle={{ color: '#1677ff' }}
                        />
                        <div className="mt-2 text-xs text-gray-400">所有服务正常</div>
                    </Card>
                </Col>
            </Row>

            <Card title="快速操作" bordered={false}>
                <Row gutter={[16, 16]}>
                    <Col span={6}>
                        <Button block type="dashed" icon={<PlusOutlined />} className="h-20 flex flex-col items-center justify-center gap-2">
                            发布公告
                        </Button>
                    </Col>
                    <Col span={6}>
                        <Button block type="dashed" icon={<UserOutlined />} className="h-20 flex flex-col items-center justify-center gap-2">
                            新增用户
                        </Button>
                    </Col>
                    <Col span={6}>
                        <Button block type="dashed" icon={<CloudServerOutlined />} className="h-20 flex flex-col items-center justify-center gap-2">
                            系统备份
                        </Button>
                    </Col>
                    <Col span={6}>
                        <Button block type="dashed" icon={<FileSearchOutlined />} className="h-20 flex flex-col items-center justify-center gap-2">
                            查看日志
                        </Button>
                    </Col>
                </Row>
            </Card>
        </div>
    );
};

export default AdminDashboard;
