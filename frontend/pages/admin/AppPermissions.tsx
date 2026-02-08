import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, TreeSelect, message, Tag, Tooltip, Space, Row, Col, Card, Tree, Empty, Switch, Typography, App } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { KeyOutlined, EditOutlined, SafetyCertificateOutlined, TeamOutlined, GlobalOutlined, LockOutlined, InfoCircleOutlined, AppstoreOutlined } from '@ant-design/icons';
import ApiClient, { QuickToolDTO } from '../../services/api';
import { getIcon } from '../../utils/iconMap';
import { getColorClass } from '../../utils/colorMap';
import {
    AppButton,
    AppTable,
    AppModal,
    AppPageHeader,
} from '../../components/admin';

const { Text } = Typography;

const AppPermissions: React.FC = () => {
    const { message: antdMessage } = App.useApp();
    const [tools, setTools] = useState<QuickToolDTO[]>([]);
    const [loading, setLoading] = useState(false);
    const [departments, setDepartments] = useState<any[]>([]);
    const [deptTreeData, setDeptTreeData] = useState<DataNode[]>([]);
    const [selectedDeptName, setSelectedDeptName] = useState<string | null>(null);

    // Edit Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentTool, setCurrentTool] = useState<QuickToolDTO | null>(null);
    const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);

    // Transform departments to Tree data (Sidebar)
    const buildTreeData = (depts: any[]): DataNode[] => {
        return depts.map(dept => ({
            title: (
                <div className="flex items-center gap-2 py-1">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{dept.name}</span>
                </div>
            ),
            key: dept.name, // Use name as key
            children: dept.children && dept.children.length > 0 ? buildTreeData(dept.children) : undefined,
        }));
    };

    // Transform for TreeSelect (Modal)
    const transformDeptsToSelect = (depts: any[]) => {
        return depts.map(dept => ({
            title: dept.name,
            value: dept.name, // Use name as value
            key: dept.id,
            children: dept.children ? transformDeptsToSelect(dept.children) : [],
        }));
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const [toolsData, deptsData] = await Promise.all([
                ApiClient.getTools(true),
                ApiClient.getDepartments()
            ]);
            setTools(toolsData);
            setDepartments(deptsData);
            setDeptTreeData(buildTreeData(deptsData));
        } catch (error) {
            console.error(error);
            antdMessage.error('加载数据失败');
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Toggle Access for Selected Dept
    const handleToggleAccess = async (tool: QuickToolDTO, checked: boolean) => {
        if (!selectedDeptName) return;

        const isPublic = !tool.visible_to_departments;
        let currentList: string[] = [];
        try {
            if (tool.visible_to_departments) {
                currentList = JSON.parse(tool.visible_to_departments);
            }
        } catch (e) {
            currentList = [];
        }

        // Logic check
        if (isPublic) {
            if (!checked) {
                antdMessage.warning("全员可见的应用无法直接禁止单个部门。请先配置为'仅部分可见'。");
                return;
            }
            // Already public, checking it does nothing
            return;
        }

        // Update list
        let newList = [...currentList];
        if (checked) {
            if (!newList.includes(selectedDeptName)) newList.push(selectedDeptName);
        } else {
            newList = newList.filter(d => d !== selectedDeptName);
        }

        // Optimistic Update (optional) or just call API
        try {
            const payloadVal = newList.length > 0 ? JSON.stringify(newList) : "";
            // Empty string or empty list? Backend logic: if not visible_to_departments (null or empty string).
            // My backend logic: `if not tool.visible_to_departments`.
            // If I send "", it depends on how Pydantic handles it. 
            // Better strictly: 
            // If empty list -> JSON "[]". Backend parses "[]" -> Empty list -> Hidden?
            // Yes, backend: `if not allowed_depts` (empty list) -> continue (Hidden).
            // So JSON "[]" is correct for hidden.
            // But if I pass null, it becomes Public.
            // If list empty, user usually intends Hidden.

            await ApiClient.updateTool(tool.id, {
                // We need to send other fields too? ApiClient.updateTool is PATCH or PUT?
                // Usually PATCH in FastAPI if using exclude_unset=True.
                // Let's assume partial update is supported by my ApiClient / Backend?
                // Backend `update_tool` uses `tool.dict(exclude_unset=True)`.
                // So I need to send ONLY `visible_to_departments`?
                // Let's check `ApiClient` implementation or `updateTool` signature.
                // `updateTool` takes `tool: QuickToolCreate` usually.
                // React `ApiClient.updateTool(id, data)`.
                // Pass all fields to be safe if unsure.
                name: tool.name,
                icon_name: tool.icon_name,
                url: tool.url,
                color: tool.color,
                category: tool.category,
                description: tool.description,
                image: tool.image,
                sort_order: (tool as any).sort_order,
                visible_to_departments: newList.length > 0 ? JSON.stringify(newList) : "[]"
            });

            antdMessage.success("权限已更新");
            fetchData(); // Refresh to be sure
        } catch (e) {
            antdMessage.error("更新失败");
        }
    };

    // Modal Handlers
    const handleEdit = (tool: QuickToolDTO) => {
        setCurrentTool(tool);
        let initDepts: string[] = [];
        if ((tool as any).visible_to_departments) {
            try {
                initDepts = JSON.parse((tool as any).visible_to_departments);
            } catch (e) {
                initDepts = [];
            }
        }
        setSelectedDepts(initDepts);
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!currentTool) return;
        setSaving(true);
        try {
            let payloadVal: string | null = null;
            if (selectedDepts && selectedDepts.length > 0) {
                payloadVal = JSON.stringify(selectedDepts);
            } else {
                payloadVal = null; // UI "Empty" -> Public
            }

            await ApiClient.updateTool(currentTool.id, {
                name: currentTool.name,
                icon_name: currentTool.icon_name,
                url: currentTool.url,
                color: currentTool.color,
                category: currentTool.category,
                description: currentTool.description,
                image: currentTool.image,
                sort_order: (currentTool as any).sort_order,
                visible_to_departments: payloadVal
            });

            antdMessage.success('权限更新成功');
            setIsModalOpen(false);
            fetchData();
        } catch (error) {
            console.error(error);
            antdMessage.error('更新失败');
        }
        setSaving(false);
    };

    // Table Columns
    const columns = [
        {
            title: (
                <Space>
                    <AppstoreOutlined className="text-slate-400" />
                    <span>应用名称</span>
                </Space>
            ),
            dataIndex: 'name',
            key: 'name',
            render: (text: string, record: QuickToolDTO) => {
                const colorClass = getColorClass(record.color);
                return (
                    <Space>
                        {record.image ? (
                            <div className="w-8 h-8 rounded-lg overflow-hidden border border-slate-100 dark:border-slate-700 shadow-sm flex items-center justify-center bg-white dark:bg-slate-800">
                                <img src={record.image} alt="icon" className="w-full h-full object-cover" />
                            </div>
                        ) : (
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorClass} text-white shadow-sm`}>
                                {getIcon(record.icon_name, { size: 16 })}
                            </div>
                        )}
                        <span className="font-bold">{text}</span>
                    </Space>
                );
            }
        },
        {
            title: '范围',
            key: 'scope',
            width: 120,
            render: (_: any, record: QuickToolDTO) => {
                const raw = (record as any).visible_to_departments;
                if (!raw) return <Tag icon={<GlobalOutlined />} color="green">全员</Tag>;
                try {
                    const list = JSON.parse(raw);
                    if (list.length === 0) return <Tag icon={<LockOutlined />} color="red">隐藏</Tag>;
                    return <Tag color="blue">指定部门</Tag>;
                } catch {
                    return <Tag>Error</Tag>;
                }
            }
        },
        // Dynamic Column for Selected Dept
        ...(selectedDeptName ? [{
            title: `${selectedDeptName} 访问权限`,
            key: 'access',
            render: (_: any, record: QuickToolDTO) => {
                const isPublic = !(record as any).visible_to_departments;
                let hasAccess = isPublic;
                let list: string[] = [];
                if (!isPublic) {
                    try { list = JSON.parse((record as any).visible_to_departments); } catch { }
                    hasAccess = list.includes(selectedDeptName);
                }

                return (
                    <Space>
                        <Switch
                            checked={hasAccess}
                            disabled={isPublic} // Disable if public
                            onChange={(checked) => handleToggleAccess(record, checked)}
                            size="small"
                        />
                        {isPublic && <Tooltip title="全员可见应用默认允许访问"><InfoCircleOutlined className="text-slate-400" /></Tooltip>}
                    </Space>
                );
            }
        }] : []),
        {
            title: '操作',
            key: 'action',
            width: 100,
            render: (_: any, record: QuickToolDTO) => (
                <Button
                    type="link"
                    icon={<EditOutlined />}
                    onClick={() => handleEdit(record)}
                >
                    配置
                </Button>
            ),
        },
    ];

    return (
        <div className="admin-page p-6 bg-slate-50/50 dark:bg-slate-900/50 min-h-full -m-6">
            <AppPageHeader
                title="应用权限管理"
                subtitle="控制各部门对应用中心应用的访问权限"
            />

            <Row gutter={24}>
                {/* Left: Dept Tree */}
                <Col xs={24} lg={6}>
                    <Card
                        title={
                            <div className="flex items-center gap-2">
                                <TeamOutlined className="text-blue-500" />
                                <span>部门列表</span>
                            </div>
                        }
                        className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] h-full mb-6 lg:mb-0"
                        styles={{ body: { padding: '12px 0 12px 12px' } }}
                    >
                        <div className="max-h-[600px] overflow-y-auto pr-2">
                            {deptTreeData.length > 0 ? (
                                <Tree
                                    treeData={deptTreeData}
                                    onSelect={(selectedKeys) => {
                                        if (selectedKeys.length > 0) {
                                            setSelectedDeptName(selectedKeys[0] as string);
                                        } else {
                                            setSelectedDeptName(null);
                                        }
                                    }}
                                    selectedKeys={selectedDeptName ? [selectedDeptName] : []}
                                    blockNode
                                    defaultExpandAll
                                />
                            ) : (
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无部门" />
                            )}
                        </div>
                    </Card>
                </Col>

                {/* Right: Table */}
                <Col xs={24} lg={18}>
                    <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                            <h3 className="font-bold text-slate-700 dark:text-slate-200">
                                {selectedDeptName ? `${selectedDeptName} - 应用权限` : '所有应用'}
                            </h3>
                            {!selectedDeptName && <span className="text-xs text-slate-400">请选择左侧部门以快速配置权限</span>}
                        </div>
                        <AppTable
                            columns={columns}
                            dataSource={tools}
                            rowKey="id"
                            loading={loading}
                            pageSize={10}
                        />
                    </Card>
                </Col>
            </Row>

            <Modal
                title={
                    <div className="flex items-center gap-2">
                        <SafetyCertificateOutlined className="text-blue-600" />
                        <span>配置应用可见性 - {currentTool?.name}</span>
                    </div>
                }
                open={isModalOpen}
                onOk={handleSave}
                onCancel={() => setIsModalOpen(false)}
                confirmLoading={saving}
                width={600}
            >
                <div className="py-4">
                    <div className="bg-blue-50 text-blue-700 p-3 rounded mb-4 text-xs">
                        <InfoCircleOutlined className="mr-1" />
                        如果不选择任何部门，该应用将默认对<b>全员可见</b>。
                    </div>
                    <p className="mb-2 text-slate-500">选择允许访问该应用的部门：</p>
                    <TreeSelect
                        style={{ width: '100%' }}
                        value={selectedDepts}
                        dropdownStyle={{ maxHeight: 400, overflow: 'auto' }}
                        treeData={transformDeptsToSelect(departments)}
                        placeholder="请选择部门"
                        treeDefaultExpandAll
                        multiple
                        treeCheckable
                        showCheckedStrategy={TreeSelect.SHOW_PARENT}
                        onChange={(newValue) => setSelectedDepts(newValue as string[])}
                        allowClear
                    />
                </div>
            </Modal>
        </div>
    );
};

export default AppPermissions;
