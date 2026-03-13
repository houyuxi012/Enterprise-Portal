import React, { Suspense, lazy, useState, useEffect, useMemo, useCallback } from 'react';
import App from 'antd/es/app';
import Avatar from 'antd/es/avatar';
import Card from 'antd/es/card';
import Col from 'antd/es/grid/col';
import Form from 'antd/es/form';
import Popconfirm from 'antd/es/popconfirm';
import Row from 'antd/es/grid/row';
import Space from 'antd/es/space';
import Switch from 'antd/es/switch';
import Tooltip from 'antd/es/tooltip';
import Typography from 'antd/es/typography';
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined, KeyOutlined, FolderOutlined, DisconnectOutlined, SafetyOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { DataNode } from 'antd/es/tree';
import { useTranslation } from 'react-i18next';
import { Employee, Department } from '@/types';
import ApiClient from '@/services/api';
import {
    AppButton,
    AppTable,
    AppTag,
    AppPageHeader,
    AppFilterBar,
} from '@/modules/admin/components/ui';
const { Text } = Typography;
const GENDER_CODES = ['male', 'female'] as const;
type GenderCode = (typeof GENDER_CODES)[number];

const EmployeeEditorModal = lazy(() => import('@/modules/admin/components/users/EmployeeEditorModal'));
const DepartmentMoveModal = lazy(() => import('@/modules/admin/components/users/DepartmentMoveModal'));
const DepartmentTreeCard = lazy(() => import('@/modules/admin/components/tree/DepartmentTreeCard'));
const actionTooltipStyles = { body: { color: '#ffffff' } } as const;

const UserList: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { message, modal } = App.useApp();
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [userAccounts, setUserAccounts] = useState<Set<string>>(new Set());
    const [userIdByAccount, setUserIdByAccount] = useState<Map<string, number>>(new Map());
    const [deptTreeData, setDeptTreeData] = useState<DataNode[]>([]);
    const [selectedDeptName, setSelectedDeptName] = useState<string | null>(null);
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
    const [targetDepartment, setTargetDepartment] = useState<string>();
    const [moving, setMoving] = useState(false);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
    const [searchText, setSearchText] = useState('');
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const genderAliases = useMemo(() => {
        const aliases: Record<string, GenderCode> = {
            male: 'male',
            female: 'female',
        };
        GENDER_CODES.forEach((code) => {
            const key = code === 'male' ? 'userList.form.genderMale' : 'userList.form.genderFemale';
            const zhLabel = String(i18n.t(key, { lng: 'zh-CN' })).trim().toLowerCase();
            const enLabel = String(i18n.t(key, { lng: 'en-US' })).trim().toLowerCase();
            if (zhLabel) aliases[zhLabel] = code;
            if (enLabel) aliases[enLabel] = code;
        });
        return aliases;
    }, [i18n.resolvedLanguage, i18n]);

    const normalizeGenderInput = useCallback((value?: string): GenderCode => {
        const raw = String(value || '').trim().toLowerCase();
        return genderAliases[raw] || 'male';
    }, [genderAliases]);

    const encodeGenderForApi = useCallback((value?: string): string => {
        const normalized = normalizeGenderInput(value);
        const key = normalized === 'male' ? 'userList.form.genderMale' : 'userList.form.genderFemale';
        return String(i18n.t(key, { lng: 'zh-CN' }));
    }, [normalizeGenderInput, i18n]);

    const hasEmployeeMfaBinding = useCallback((employee: Employee): boolean => {
        return Boolean(
            employee.mfa_enabled
            || employee.totp_enabled
            || employee.email_mfa_enabled
            || employee.webauthn_enabled
        );
    }, []);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [empData, deptData, userOptions] = await Promise.all([
                ApiClient.getEmployees(),
                ApiClient.getDepartments(),
                ApiClient.getUserOptions().catch(() => []),
            ]);
            setEmployees(empData);
            setDepartments(deptData);
            const accountMap = new Map<string, number>();
            (userOptions || []).forEach((u) => {
                const key = String(u.username || '').trim().toLowerCase();
                if (key && Number.isFinite(Number(u.id))) {
                    accountMap.set(key, Number(u.id));
                }
            });
            setUserIdByAccount(accountMap);
            setUserAccounts(new Set(accountMap.keys()));
            setDeptTreeData(buildTreeData(deptData));
        } catch (error) {
            console.error(error);
            message.error(t('userList.messages.loadFailed'));
        } finally {
            setLoading(false);
        }
    };

    const buildTreeData = (depts: Department[]): DataNode[] => {
        return depts.map(dept => ({
            title: (
                <Space size={8}>
                    <Text strong>{dept.name}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        ({countEmployeesInDept(dept, employees)})
                    </Text>
                </Space>
            ),
            key: dept.name, // Use name as key for easier filtering since Employee has dept name
            children: dept.children && dept.children.length > 0 ? buildTreeData(dept.children) : undefined,
        }));
    };

    const flattenDepartments = (depts: Department[], parentPath = ''): Array<{ name: string; label: string }> => {
        const list: Array<{ name: string; label: string }> = [];
        depts.forEach((dept) => {
            const label = parentPath ? `${parentPath} / ${dept.name}` : dept.name;
            list.push({ name: dept.name, label });
            if (dept.children && dept.children.length > 0) {
                list.push(...flattenDepartments(dept.children, label));
            }
        });
        return list;
    };

    const departmentOptions = useMemo(
        () => flattenDepartments(departments),
        [departments]
    );

    const buildEmployeeUpdatePayload = (emp: Employee, overrides: Partial<Employee> = {}) => ({
        account: emp.account,
        job_number: emp.job_number || '',
        name: emp.name,
        gender: emp.gender,
        department: emp.department,
        role: emp.role || '',
        email: emp.email,
        phone: emp.phone,
        location: emp.location || '',
        avatar: emp.avatar || '',
        status: emp.status || 'Active',
        ...overrides,
    });

    // Helper to get all descendant department names including self
    const getAllSubDeptNames = (dept: Department): string[] => {
        let names = [dept.name];
        if (dept.children && dept.children.length > 0) {
            dept.children.forEach(child => {
                names = names.concat(getAllSubDeptNames(child));
            });
        }
        return names;
    };

    // Helper to count employees in a department recursively (includes all children)
    const countEmployeesInDept = (dept: Department, allEmps: Employee[]) => {
        const targetNames = new Set(getAllSubDeptNames(dept));
        return allEmps.filter(e => targetNames.has(e.department)).length;
    };

    // Refresh tree counts when employees change
    useEffect(() => {
        if (departments.length > 0) {
            setDeptTreeData(buildTreeData(departments));
        }
    }, [employees, departments]);


    const handleDelete = async (id: any) => {
        try {
            await ApiClient.deleteEmployee(id);
            message.success(t('userList.messages.deleteSuccess'));
            fetchData();
        } catch (error) {
            message.error(t('userList.messages.deleteFailed'));
        }
    };

    const handleBatchDelete = () => {
        if (selectedRowKeys.length === 0) return;

        modal.confirm({
            title: t('userList.batch.deleteTitle', { count: selectedRowKeys.length }),
            content: t('userList.batch.deleteContent'),
            okText: t('userList.batch.confirmDelete'),
            okButtonProps: { danger: true },
            cancelText: t('common.buttons.cancel'),
            onOk: async () => {
                const hide = message.loading(t('userList.batch.deleting'), 0);
                try {
                    await Promise.all(selectedRowKeys.map(id => ApiClient.deleteEmployee(id as number)));
                    hide();
                    message.success(t('userList.batch.deleteSuccess'));
                    setSelectedRowKeys([]);
                    fetchData();
                } catch (e) {
                    hide();
                    message.error(t('userList.batch.deletePartialFailed'));
                }
            }
        });
    };

    const handleBatchResetPassword = () => {
        if (selectedRowKeys.length === 0) return;

        modal.confirm({
            title: t('userList.batch.resetPwdTitle', { count: selectedRowKeys.length }),
            content: t('userList.batch.resetPwdContent'),
            okText: t('userList.batch.confirmResetPwd'),
            cancelText: t('common.buttons.cancel'),
            onOk: async () => {
                const hide = message.loading(t('userList.batch.resetting'), 0);
                try {
                    const selectedEmps = employees.filter(e => selectedRowKeys.includes(e.id));
                    const resettable = selectedEmps.filter(e => (e.auth_source || 'local') === 'local' && userAccounts.has(String(e.account || '').toLowerCase()));
                    const skipped = selectedEmps.length - resettable.length;

                    if (resettable.length === 0) {
                        hide();
                        message.warning(t('userList.batch.noResettableAccount'));
                        return;
                    }

                    const settled = await Promise.allSettled(
                        resettable.map(e => ApiClient.resetPassword(e.account))
                    );
                    const success = settled.filter(item => item.status === 'fulfilled').map((item: any) => item.value);
                    const failedCount = settled.length - success.length;
                    hide();
                    const generated = success.map((r) => r?.new_password).filter(Boolean);
                    if (failedCount === 0 && skipped === 0 && generated.length === 1) {
                        message.success(t('userList.batch.resetSingleSuccess', { password: generated[0] }));
                    } else if (failedCount === 0) {
                        message.success(t('userList.batch.resetDone', { success: success.length, skipped }));
                    } else {
                        message.warning(t('userList.batch.resetDoneWithFail', { success: success.length, failed: failedCount, skipped }));
                    }
                    setSelectedRowKeys([]);
                } catch (e) {
                    hide();
                    message.error(t('userList.batch.resetFailed'));
                }
            }
        });
    };

    const handleBatchResetMfa = () => {
        if (selectedRowKeys.length === 0) return;
        const selectedEmps = employees.filter(e => selectedRowKeys.includes(e.id));
        const mfaUsers = selectedEmps.filter(hasEmployeeMfaBinding);

        modal.confirm({
            title: t('userList.batch.resetMfaTitle', { count: selectedRowKeys.length }),
            content: mfaUsers.length > 0
                ? t('userList.batch.resetMfaContent', { bound: mfaUsers.length })
                : t('userList.batch.resetMfaNone', '所选用户均未绑定 MFA'),
            okText: t('userList.batch.confirmResetMfa', '确认重置'),
            cancelText: t('common.buttons.cancel'),
            okButtonProps: { danger: true, disabled: mfaUsers.length === 0 },
            onOk: async () => {
                if (mfaUsers.length === 0) return;
                const hide = message.loading(t('userList.batch.resettingMfa', '正在重置 MFA...'), 0);
                try {
                    const usernames = mfaUsers.map(e => e.account);
                    const result = await ApiClient.batchResetMfa(usernames);
                    hide();
                    message.success(t('userList.batch.resetMfaDone', { count: result.reset_count }));
                    setSelectedRowKeys([]);
                    fetchData();
                } catch (e) {
                    hide();
                    message.error(t('userList.batch.resetMfaFailed', '重置 MFA 失败'));
                }
            }
        });
    };

    const handleBatchKickOffline = () => {
        if (selectedRowKeys.length === 0) return;

        modal.confirm({
            title: t('userList.batch.kickTitle', { count: selectedRowKeys.length }),
            content: t('userList.batch.kickContent'),
            okText: t('userList.batch.confirmKick'),
            cancelText: t('common.buttons.cancel'),
            onOk: async () => {
                const hide = message.loading(t('userList.batch.kicking'), 0);
                try {
                    const selectedEmps = employees.filter((e) => selectedRowKeys.includes(e.id));
                    const kickTargets = selectedEmps
                        .map((emp) => ({
                            account: emp.account,
                            userId: userIdByAccount.get(String(emp.account || '').toLowerCase()),
                        }))
                        .filter((item): item is { account: string; userId: number } => Number.isFinite(item.userId as number));
                    const skipped = selectedEmps.length - kickTargets.length;

                    if (kickTargets.length === 0) {
                        hide();
                        message.warning(t('userList.batch.noSystemAccountForKick'));
                        return;
                    }

                    const settled = await Promise.allSettled(
                        kickTargets.map((item) => ApiClient.kickUserSessions(item.userId, 'all'))
                    );
                    const success = settled.filter((item) => item.status === 'fulfilled') as PromiseFulfilledResult<any>[];
                    const failedCount = settled.length - success.length;
                    const revokedTotal = success.reduce(
                        (sum, item) => sum + Number(item.value?.revoked_sessions || 0),
                        0
                    );
                    hide();

                    if (failedCount === 0) {
                        message.success(t('userList.batch.kickDone', { success: success.length, revoked: revokedTotal, skipped }));
                    } else {
                        message.warning(t('userList.batch.kickDoneWithFail', { success: success.length, failed: failedCount, skipped }));
                    }
                    setSelectedRowKeys([]);
                } catch (e) {
                    hide();
                    message.error(t('userList.batch.kickFailed'));
                }
            }
        });
    };

    const handleOpenBatchMoveModal = () => {
        if (selectedRowKeys.length === 0) return;
        setTargetDepartment(undefined);
        setIsMoveModalOpen(true);
    };

    const handleBatchMoveDepartment = async () => {
        if (!targetDepartment) {
            message.warning(t('userList.batch.selectTargetDept'));
            return;
        }

        const selectedEmployees = employees.filter((e) => selectedRowKeys.includes(e.id));
        if (selectedEmployees.length === 0) {
            message.warning(t('userList.batch.noMovableUsers'));
            return;
        }

        setMoving(true);
        const hide = message.loading(t('userList.batch.movingUsers'), 0);
        try {
            const settled = await Promise.allSettled(
                selectedEmployees.map((emp) =>
                    ApiClient.updateEmployee(
                        Number(emp.id),
                        buildEmployeeUpdatePayload(emp, { department: targetDepartment })
                    )
                )
            );

            const successCount = settled.filter((item) => item.status === 'fulfilled').length;
            const failedCount = settled.length - successCount;

            if (failedCount === 0) {
                message.success(t('userList.batch.moveDone', { success: successCount, department: targetDepartment }));
                setIsMoveModalOpen(false);
                setSelectedRowKeys([]);
                setSelectedDeptName(targetDepartment);
            } else {
                message.warning(t('userList.batch.moveDoneWithFail', { success: successCount, failed: failedCount }));
            }

            await fetchData();
        } catch (error) {
            message.error(t('userList.batch.moveFailed'));
        } finally {
            hide();
            setMoving(false);
        }
    };


    const handleStatusChange = async (emp: Employee, checked: boolean) => {
        const newStatus = checked ? 'Active' : 'Inactive';
        try {
            // Optimistic update (optional, but good UX)
            const updatedEmp = { ...emp, status: newStatus };
            setEmployees(prev => prev.map(e => e.id === emp.id ? updatedEmp : e));

            await ApiClient.updateEmployee(Number(emp.id), buildEmployeeUpdatePayload(emp, { status: newStatus }));
            message.success(t('userList.messages.statusChanged', { name: emp.name, status: checked ? t('userList.status.active') : t('userList.status.inactive') }));
            fetchData(); // Refresh to ensure sync
        } catch (error) {
            message.error(t('userList.messages.statusUpdateFailed'));
            fetchData(); // Revert on error
        }
    };

    const handleEdit = (emp: Employee) => {
        setEditingEmployee(emp);
        form.setFieldsValue({
            ...emp,
            gender: normalizeGenderInput(emp.gender),
        });
        setIsModalOpen(true);
    };

    const handleAddNew = () => {
        setEditingEmployee(null);
        form.resetFields();
        form.setFieldsValue({
            gender: 'male',
            department: selectedDeptName || '' // Pre-fill department if selected
        });
        setIsModalOpen(true);
    };

    const handleSubmit = async (values: any) => {
        setSubmitting(true);
        try {
            const payload = {
                ...values,
                gender: encodeGenderForApi(values.gender),
            };
            if (editingEmployee) {
                await ApiClient.updateEmployee(Number(editingEmployee.id), payload);
                message.success(t('userList.messages.updateSuccess'));
            } else {
                const createdEmployee = await ApiClient.createEmployee(payload);
                message.success(t('userList.messages.createSuccess'));
                if (createdEmployee.portal_initial_password) {
                    modal.success({
                        title: t('userList.createResult.title'),
                        content: (
                            <Space direction="vertical" size={8}>
                                <Text>
                                    {t('userList.createResult.account')}：
                                    <Text strong>{createdEmployee.account}</Text>
                                </Text>
                                <Text>
                                    {t('userList.createResult.initialPassword')}：
                                    <Text code strong>{createdEmployee.portal_initial_password}</Text>
                                </Text>
                                <Text type="secondary">{t('userList.createResult.hint')}</Text>
                            </Space>
                        ),
                        okText: t('userList.createResult.okText'),
                    });
                }
            }
            setIsModalOpen(false);
            fetchData();
        } catch (error) {
            message.error(t('userList.messages.saveFailed'));
        } finally {
            setSubmitting(false);
        }
    };

    const columns: ColumnsType<Employee> = [
        {
            title: t('userList.table.avatar'),
            dataIndex: 'avatar',
            key: 'avatar',
            width: 90,
            render: (avatar: string, record: Employee) => (
                <Avatar
                    src={avatar}
                    size={40}
                    icon={<UserOutlined />}
                >
                    {!avatar ? record.name?.[0] : null}
                </Avatar>
            ),
        },
        {
            title: t('userList.table.name'),
            dataIndex: 'name',
            key: 'name',
            render: (text: string) => <Text strong>{text}</Text>,
        },
        {
            title: t('userList.table.account'),
            dataIndex: 'account',
            key: 'account',
            render: (text: string) => <Text>{text}</Text>,
        },
        {
            title: t('userList.table.email'),
            dataIndex: 'email',
            key: 'email',
            render: (text: string) => (
                text ? (
                    <Text
                        type="secondary"
                        ellipsis={{ tooltip: text }}
                        className="!inline-block max-w-[220px] align-middle"
                    >
                        {text}
                    </Text>
                ) : (
                    <Text type="secondary">-</Text>
                )
            ),
        },
        {
            title: t('userList.table.mfa', 'MFA'),
            key: 'mfa_enabled',
            width: 90,
            render: (_: unknown, record: Employee) => {
                const enabled = hasEmployeeMfaBinding(record);
                return (
                    <AppTag status={enabled ? 'success' : 'default'}>
                        {enabled ? t('userList.mfa.bound', '已绑定') : t('userList.mfa.unbound', '未绑定')}
                    </AppTag>
                );
            },
        },
        {
            title: t('userList.table.status'),
            dataIndex: 'status',
            key: 'status',
            width: 100,
            render: (status: string, record: Employee) => (
                <Space size={8}>
                    <Switch
                        checked={status === 'Active'}
                        onChange={(checked) => handleStatusChange(record, checked)}
                        size="small"
                    />
                    <AppTag status={status === 'Active' ? 'success' : 'default'}>
                        {status === 'Active' ? t('userList.status.active') : t('userList.status.inactive')}
                    </AppTag>
                </Space>
            ),
        },
        {
            title: t('userList.table.source'),
            dataIndex: 'auth_source',
            key: 'auth_source',
            width: 110,
            render: (auth_source: 'local' | 'ldap' | 'ad' | 'oidc') => {
                const sourceKey = auth_source || 'local';
                const sourceLabel =
                    sourceKey === 'local'
                        ? t('userList.source.local')
                        : t(`userList.source.${sourceKey}`, { defaultValue: sourceKey.toUpperCase() });
                return <AppTag status="processing">{sourceLabel}</AppTag>;
            },
        },
        {
            title: t('userList.table.actions'),
            key: 'action',
            width: 140,
            align: 'right',
            render: (_: any, record: Employee) => (
                <div className="flex justify-end gap-1">
                    <Tooltip title={t('common.buttons.edit')} color="#1f1f1f" styles={actionTooltipStyles}>
                        <AppButton
                            intent="tertiary"
                            iconOnly
                            size="sm"
                            icon={<EditOutlined />}
                            onClick={() => handleEdit(record)}
                            aria-label={t('common.buttons.edit')}
                        />
                    </Tooltip>
                </div>
            ),
        },
    ];

    const filteredData = useMemo(() => {
        const keyword = String(searchText || '').toLowerCase();
        const normalize = (value: unknown) => String(value ?? '').toLowerCase();
        return employees.filter(e => {
            const matchesSearch =
                normalize(e?.name).includes(keyword) ||
                normalize(e?.department).includes(keyword) ||
                normalize(e?.account).includes(keyword);

            const matchesDept = selectedDeptName ? String(e?.department ?? '') === selectedDeptName : true;

            return matchesSearch && matchesDept;
        });
    }, [employees, searchText, selectedDeptName]);

    const rowSelection = {
        selectedRowKeys,
        onChange: (newSelectedRowKeys: React.Key[]) => {
            setSelectedRowKeys(newSelectedRowKeys);
        }
    };

    return (
        <div className="admin-page admin-page-spaced">
            {/* Page Header */}
            <AppPageHeader
                title={t('userList.page.title')}
                subtitle={t('userList.page.subtitle')}
                action={
                    <AppButton intent="primary" icon={<PlusOutlined />} onClick={handleAddNew}>
                        {t('userList.page.create')}
                    </AppButton>
                }
            />

            <Row gutter={[20, 20]}>
                {/* Left Sidebar: Department Tree */}
                <Col xs={24} lg={6}>
                    <Suspense fallback={null}>
                        <DepartmentTreeCard
                            title={<Text strong>{t('userList.deptTree.title')}</Text>}
                            className="admin-card h-full mb-6 lg:mb-0"
                            bodyStyle={{ padding: '10px 8px 12px 8px' }}
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
                            emptyDescription={t('userList.deptTree.empty')}
                            scrollClassName="max-h-[560px] overflow-y-auto pr-1"
                        />
                    </Suspense>
                </Col>

                {/* Right Content: Filter & Table */}
                <Col xs={24} lg={18}>
                    <div className="space-y-4">
                        {/* Filter Bar */}
                        <AppFilterBar className="justify-between gap-3">
                            <AppFilterBar.Search
                                placeholder={t('userList.filters.searchPlaceholder')}
                                style={{ maxWidth: 360 }}
                                value={searchText}
                                onChange={e => setSearchText(e.target.value)}
                            />

                            {selectedRowKeys.length > 0 && (
                                <AppFilterBar.Action>
                                    <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                                        <Text className="!mb-0 text-xs !text-slate-900">
                                            {t('userList.batch.selected', { count: selectedRowKeys.length })}
                                        </Text>
                                        <div className="flex items-center gap-1">
                                            <Tooltip title={t('userList.batch.moveOrg')} color="#1f1f1f" styles={actionTooltipStyles}>
                                                <AppButton
                                                    intent="tertiary"
                                                    size="sm"
                                                    icon={<FolderOutlined />}
                                                    iconOnly
                                                    aria-label={t('userList.batch.moveOrg')}
                                                    onClick={handleOpenBatchMoveModal}
                                                />
                                            </Tooltip>
                                            <Tooltip title={t('userList.batch.resetPwdButton')} color="#1f1f1f" styles={actionTooltipStyles}>
                                                <AppButton
                                                    intent="tertiary"
                                                    size="sm"
                                                    icon={<KeyOutlined />}
                                                    iconOnly
                                                    aria-label={t('userList.batch.resetPwdButton')}
                                                    onClick={handleBatchResetPassword}
                                                />
                                            </Tooltip>
                                            <Tooltip title={t('userList.batch.resetMfaButton', '重置 MFA')} color="#1f1f1f" styles={actionTooltipStyles}>
                                                <AppButton
                                                    intent="tertiary"
                                                    size="sm"
                                                    icon={<SafetyOutlined />}
                                                    iconOnly
                                                    aria-label={t('userList.batch.resetMfaButton', '重置 MFA')}
                                                    onClick={handleBatchResetMfa}
                                                />
                                            </Tooltip>
                                            <Tooltip title={t('common.buttons.delete')} color="#1f1f1f" styles={actionTooltipStyles}>
                                                <AppButton
                                                    intent="danger"
                                                    size="sm"
                                                    icon={<DeleteOutlined />}
                                                    iconOnly
                                                    aria-label={t('common.buttons.delete')}
                                                    onClick={handleBatchDelete}
                                                />
                                            </Tooltip>
                                        </div>
                                    </div>
                                </AppFilterBar.Action>
                            )}
                        </AppFilterBar>

                        {/* Data Table */}
                        <Card className="admin-card overflow-hidden">
                            <AppTable
                                rowSelection={rowSelection}
                                columns={columns}
                                dataSource={filteredData}
                                rowKey="id" // Employee ID is string in types, but number in backend? Need to be careful. Types say string.
                                loading={loading}
                                emptyText={t('userList.table.empty')}
                                pageSize={10}
                            />
                        </Card>
                    </div>
                </Col>
            </Row>

            {isModalOpen ? (
                <Suspense fallback={null}>
                    <EmployeeEditorModal
                        open={isModalOpen}
                        submitting={submitting}
                        editingEmployee={editingEmployee}
                        form={form}
                        departmentOptions={departmentOptions}
                        onCancel={() => setIsModalOpen(false)}
                        onSubmit={handleSubmit}
                    />
                </Suspense>
            ) : null}

            {isMoveModalOpen ? (
                <Suspense fallback={null}>
                    <DepartmentMoveModal
                        open={isMoveModalOpen}
                        moving={moving}
                        selectedCount={selectedRowKeys.length}
                        targetDepartment={targetDepartment}
                        departmentOptions={departmentOptions}
                        onCancel={() => setIsMoveModalOpen(false)}
                        onConfirm={handleBatchMoveDepartment}
                        onTargetDepartmentChange={setTargetDepartment}
                    />
                </Suspense>
            ) : null}
        </div>
    );
};

export default UserList;
