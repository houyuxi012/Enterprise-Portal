import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import App from 'antd/es/app';
import Avatar from 'antd/es/avatar';
import Card from 'antd/es/card';
import Col from 'antd/es/grid/col';
import Row from 'antd/es/grid/row';
import Space from 'antd/es/space';
import Switch from 'antd/es/switch';
import Tooltip from 'antd/es/tooltip';
import Typography from 'antd/es/typography';
import type { ColumnsType } from 'antd/es/table';
import type { DataNode } from 'antd/es/tree';
import { EditOutlined, TeamOutlined, InfoCircleOutlined, AppstoreOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ApiClient, { type QuickToolDTO, type QuickToolUpsertPayload } from '@/services/api';
import type { Department } from '@/types';
import {
    AppButton,
    AppTable,
    AppPageHeader,
    AppTag,
} from '@/modules/admin/components/ui';

const { Text } = Typography;
const AppPermissionsConfigModal = lazy(() => import('@/modules/admin/components/app-permissions/AppPermissionsConfigModal'));
const DepartmentTreeCard = lazy(() => import('@/modules/admin/components/tree/DepartmentTreeCard'));

type DepartmentOption = {
    label: string;
    value: string;
};

const parseVisibleDepartments = (raw?: string | null): { parsed: boolean; list: string[] } => {
    if (!raw) {
        return { parsed: true, list: [] };
    }
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return { parsed: false, list: [] };
        }
        return {
            parsed: true,
            list: parsed.filter((item): item is string => typeof item === 'string'),
        };
    } catch {
        return { parsed: false, list: [] };
    }
};

const buildToolUpdatePayload = (
    tool: QuickToolDTO,
    visibleToDepartments: string | null,
): QuickToolUpsertPayload => ({
    name: tool.name,
    url: tool.url,
    category: tool.category,
    description: tool.description,
    image: tool.image,
    sort_order: tool.sort_order,
    visible_to_departments: visibleToDepartments,
});

const AppPermissions: React.FC = () => {
    const { t } = useTranslation();
    const { message: antdMessage } = App.useApp();
    const [tools, setTools] = useState<QuickToolDTO[]>([]);
    const [loading, setLoading] = useState(false);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [deptTreeData, setDeptTreeData] = useState<DataNode[]>([]);
    const [selectedDeptName, setSelectedDeptName] = useState<string | null>(null);

    // Edit Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentTool, setCurrentTool] = useState<QuickToolDTO | null>(null);
    const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);

    // Transform departments to Tree data (Sidebar)
    const buildTreeData = (depts: Department[]): DataNode[] => {
        return depts.map(dept => ({
            title: (
                <Text>{dept.name}</Text>
            ),
            key: dept.name, // Use name as key
            children: dept.children && dept.children.length > 0 ? buildTreeData(dept.children) : undefined,
        }));
    };

    // Flatten departments for modal selection
    const flattenDeptOptions = (depts: Department[], parentPath = ''): DepartmentOption[] => {
        return depts.flatMap((dept) => {
            const label = parentPath ? `${parentPath} / ${dept.name}` : dept.name;
            return [
                { label, value: dept.name },
                ...(dept.children ? flattenDeptOptions(dept.children, label) : []),
            ];
        });
    };

    const deptSelectOptions = useMemo(() => flattenDeptOptions(departments), [departments]);

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
            antdMessage.error(t('appPermissions.messages.loadFailed'));
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
        const currentList = parseVisibleDepartments(tool.visible_to_departments).list;

        // Logic check
        if (isPublic) {
            if (!checked) {
                antdMessage.warning(t('appPermissions.messages.publicCannotDisable'));
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
            await ApiClient.updateTool(
                tool.id,
                buildToolUpdatePayload(
                    tool,
                    newList.length > 0 ? JSON.stringify(newList) : '[]',
                ),
            );

            antdMessage.success(t('appPermissions.messages.permissionUpdated'));
            fetchData(); // Refresh to be sure
        } catch (e) {
            antdMessage.error(t('appPermissions.messages.updateFailed'));
        }
    };

    // Modal Handlers
    const handleEdit = (tool: QuickToolDTO) => {
        setCurrentTool(tool);
        setSelectedDepts(parseVisibleDepartments(tool.visible_to_departments).list);
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

            await ApiClient.updateTool(
                currentTool.id,
                buildToolUpdatePayload(currentTool, payloadVal),
            );

            antdMessage.success(t('appPermissions.messages.permissionUpdateSuccess'));
            setIsModalOpen(false);
            fetchData();
        } catch (error) {
            console.error(error);
            antdMessage.error(t('appPermissions.messages.updateFailed'));
        }
        setSaving(false);
    };

    // Table Columns
    const selectedDept = selectedDeptName;
    const columns: ColumnsType<QuickToolDTO> = [
        {
            title: (
                <Space>
                    <AppstoreOutlined />
                    <span>{t('appPermissions.table.appName')}</span>
                </Space>
            ),
            dataIndex: 'name',
            key: 'name',
            render: (text: string, record: QuickToolDTO) => {
                return (
                    <Space>
                        <Avatar shape="square" size={32} src={record.image || undefined} icon={<AppstoreOutlined />} />
                        <Text strong>{text}</Text>
                    </Space>
                );
            }
        },
        {
            title: t('appPermissions.table.scope'),
            key: 'scope',
            width: 120,
            render: (_: unknown, record: QuickToolDTO) => {
                const raw = record.visible_to_departments;
                if (!raw) return <AppTag status="success">{t('appPermissions.scope.all')}</AppTag>;
                const { parsed, list } = parseVisibleDepartments(raw);
                if (!parsed) {
                    return <AppTag status="default">{t('appPermissions.scope.error')}</AppTag>;
                }
                if (list.length === 0) return <AppTag status="error">{t('appPermissions.scope.hidden')}</AppTag>;
                return <AppTag status="info">{t('appPermissions.scope.selectedDepartments')}</AppTag>;
            }
        },
        // Dynamic Column for Selected Dept
        ...(selectedDept ? [{
            title: t('appPermissions.table.departmentAccess', { dept: selectedDept }),
            key: 'access',
            render: (_: unknown, record: QuickToolDTO) => {
                const isPublic = !record.visible_to_departments;
                let hasAccess = isPublic;
                if (!isPublic) {
                    hasAccess = parseVisibleDepartments(record.visible_to_departments).list.includes(selectedDept);
                }

                return (
                    <Space>
                        <Switch
                            checked={hasAccess}
                            disabled={isPublic} // Disable if public
                            onChange={(checked) => handleToggleAccess(record, checked)}
                            size="small"
                        />
                        {isPublic && <Tooltip title={t('appPermissions.tooltips.publicAllowed')}><InfoCircleOutlined /></Tooltip>}
                    </Space>
                );
            }
        }] : []),
        {
            title: t('appPermissions.table.actions'),
            key: 'action',
            width: 100,
            render: (_: unknown, record: QuickToolDTO) => (
                <AppButton
                    intent="tertiary"
                    size="sm"
                    icon={<EditOutlined />}
                    onClick={() => handleEdit(record)}
                >
                    {t('appPermissions.actions.configure')}
                </AppButton>
            ),
        },
    ];

    return (
        <div className="admin-page admin-page-spaced">
            <AppPageHeader
                title={t('appPermissions.page.title')}
                subtitle={t('appPermissions.page.subtitle')}
            />

            <Row gutter={24}>
                {/* Left: Dept Tree */}
                <Col xs={24} lg={6}>
                    <Suspense fallback={null}>
                        <DepartmentTreeCard
                            title={
                                <Space>
                                    <TeamOutlined />
                                    <span>{t('appPermissions.sidebar.departments')}</span>
                                </Space>
                            }
                            className="admin-card h-full mb-6 lg:mb-0"
                            bodyStyle={{ padding: '12px 0 12px 12px' }}
                            treeData={deptTreeData}
                            selectedKeys={selectedDeptName ? [selectedDeptName] : []}
                            defaultExpandAll
                            onSelect={(selectedKeys) => {
                                if (selectedKeys.length > 0) {
                                    setSelectedDeptName(selectedKeys[0] as string);
                                } else {
                                    setSelectedDeptName(null);
                                }
                            }}
                            emptyDescription={t('appPermissions.sidebar.empty')}
                            scrollClassName="max-h-[600px] overflow-y-auto pr-2"
                        />
                    </Suspense>
                </Col>

                {/* Right: Table */}
                <Col xs={24} lg={18}>
                    <Card className="admin-card overflow-hidden" title={
                        selectedDeptName
                            ? t('appPermissions.content.selectedDeptTitle', { dept: selectedDeptName })
                            : t('appPermissions.content.allApps')
                    } extra={
                        !selectedDeptName ? <Text type="secondary">{t('appPermissions.content.selectHint')}</Text> : null
                    }>
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

            <Suspense fallback={null}>
                {isModalOpen && (
                    <AppPermissionsConfigModal
                        open={isModalOpen}
                        toolName={currentTool?.name || '-'}
                        saving={saving}
                        departmentOptions={deptSelectOptions}
                        selectedDepartments={selectedDepts}
                        onChange={setSelectedDepts}
                        onOk={handleSave}
                        onCancel={() => setIsModalOpen(false)}
                    />
                )}
            </Suspense>
        </div>
    );
};

export default AppPermissions;
