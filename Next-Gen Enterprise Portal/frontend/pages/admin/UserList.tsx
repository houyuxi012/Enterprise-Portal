import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Input, Select, Avatar, Popconfirm, Upload, Card, Row, Col, Tree, Empty, App, Space, Switch } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined, UserOutlined, KeyOutlined, FolderOutlined, TeamOutlined, DisconnectOutlined, SafetyOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { DataNode } from 'antd/es/tree';
import { useTranslation } from 'react-i18next';
import { Employee, Department } from '../../types';
import ApiClient from '../../services/api';
import {
    AppButton,
    AppTable,
    AppModal,
    AppForm,
    AppTag,
    AppPageHeader,
    AppFilterBar,
} from '../../components/admin';

const { Option } = Select;
const GENDER_CODES = ['male', 'female'] as const;
type GenderCode = (typeof GENDER_CODES)[number];

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
    const [form] = AppForm.useForm();
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
                <div className="flex items-center gap-2 py-1">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{dept.name}</span>
                    <span className="text-xs text-slate-400">
                        ({countEmployeesInDept(dept, employees)})
                    </span>
                </div>
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
        const mfaUsers = selectedEmps.filter(e => e.totp_enabled);

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
                            <div className="space-y-2">
                                <div>{t('userList.createResult.account')}：<span className="font-mono">{createdEmployee.account}</span></div>
                                <div>{t('userList.createResult.initialPassword')}：<span className="font-mono font-semibold">{createdEmployee.portal_initial_password}</span></div>
                                <div className="text-xs text-slate-500">{t('userList.createResult.hint')}</div>
                            </div>
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
                    className="border border-slate-200"
                >
                    {!avatar ? record.name?.[0] : null}
                </Avatar>
            ),
        },
        {
            title: t('userList.table.name'),
            dataIndex: 'name',
            key: 'name',
            render: (text: string) => (
                <span className="font-medium text-slate-800 dark:text-slate-200">{text}</span>
            ),
        },
        {
            title: t('userList.table.account'),
            dataIndex: 'account',
            key: 'account',
            render: (text: string) => (
                <span className="font-mono text-slate-600 dark:text-slate-300">{text}</span>
            ),
        },
        {
            title: t('userList.table.email'),
            dataIndex: 'email',
            key: 'email',
            render: (text: string) => (
                <span className="text-sm text-slate-600 dark:text-slate-400">{text || '-'}</span>
            ),
        },
        {
            title: 'MFA',
            dataIndex: 'totp_enabled',
            key: 'totp_enabled',
            width: 90,
            render: (enabled: boolean) => (
                <AppTag status={enabled ? 'success' : 'default'}>
                    {enabled ? t('userList.mfa.bound', '已绑定') : t('userList.mfa.unbound', '未绑定')}
                </AppTag>
            ),
        },
        {
            title: t('userList.table.status'),
            dataIndex: 'status',
            key: 'status',
            width: 100,
            render: (status: string, record: Employee) => (
                <div className="flex items-center gap-2">
                    <Switch
                        checked={status === 'Active'}
                        onChange={(checked) => handleStatusChange(record, checked)}
                        size="small"
                    />
                    <AppTag status={status === 'Active' ? 'success' : 'default'}>
                        {status === 'Active' ? t('userList.status.active') : t('userList.status.inactive')}
                    </AppTag>
                </div>
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
                    <AppButton
                        intent="tertiary"
                        iconOnly
                        size="sm"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                        title={t('common.buttons.edit')}
                    />
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
        <div className="admin-page p-6 bg-slate-50/50 dark:bg-slate-900/50 min-h-full -m-6">
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

            <Row gutter={24}>
                {/* Left Sidebar: Department Tree */}
                <Col xs={24} lg={6}>
                    <Card
                        title={
                            <div className="flex items-center gap-2">
                                <TeamOutlined className="text-blue-500" />
                                <span>{t('userList.deptTree.title')}</span>
                            </div>
                        }
                        className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] h-full mb-6 lg:mb-0"
                        styles={{ body: { padding: '12px 0 12px 12px' } }}
                    >
                        <div className="max-h-[600px] overflow-y-auto pr-2">
                            {/* Global Filter Option */}


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
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('userList.deptTree.empty')} />
                            )}
                        </div>
                    </Card>
                </Col>

                {/* Right Content: Filter & Table */}
                <Col xs={24} lg={18}>
                    {/* Filter Bar */}
                    <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] mb-4 p-1" styles={{ body: { padding: '12px 16px' } }}>
                        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                            <Input.Search
                                placeholder={t('userList.filters.searchPlaceholder')}
                                allowClear
                                style={{ maxWidth: 320 }}
                                value={searchText}
                                onChange={e => setSearchText(e.target.value)}
                            />

                            {/* Batch Actions */}
                            {selectedRowKeys.length > 0 && (
                                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
                                    <span className="text-sm text-slate-500 font-medium mr-2">
                                        {t('userList.batch.selected', { count: selectedRowKeys.length })}
                                    </span>
                                    <AppButton
                                        intent="secondary"
                                        size="sm"
                                        icon={<FolderOutlined />}
                                        onClick={handleOpenBatchMoveModal}
                                    >
                                        {t('userList.batch.moveOrg')}
                                    </AppButton>
                                    <AppButton
                                        intent="secondary"
                                        size="sm"
                                        icon={<KeyOutlined />}
                                        onClick={handleBatchResetPassword}
                                    >
                                        {t('userList.batch.resetPwdButton')}
                                    </AppButton>
                                    <AppButton
                                        intent="secondary"
                                        size="sm"
                                        icon={<SafetyOutlined />}
                                        onClick={handleBatchResetMfa}
                                    >
                                        {t('userList.batch.resetMfaButton', '重置 MFA')}
                                    </AppButton>
                                    <AppButton
                                        intent="danger"
                                        size="sm"
                                        icon={<DeleteOutlined />}
                                        onClick={handleBatchDelete}
                                    >
                                        {t('common.buttons.delete')}
                                    </AppButton>
                                </div>
                            )}
                        </div>
                    </Card>

                    {/* Data Table */}
                    <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
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
                </Col>
            </Row>

            {/* Edit/Create Modal */}
            <AppModal
                title={editingEmployee ? t('userList.modal.editTitle') : t('userList.modal.createTitle')}
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                onOk={() => form.submit()}
                confirmLoading={submitting}
                okText={editingEmployee ? t('userList.modal.saveEdit') : t('userList.modal.create')}
                width={700}
            >
                <AppForm form={form} onFinish={handleSubmit} initialValues={{ gender: 'male' }}>
                    {/* Avatar Upload */}
                    <AppForm.Item label={t('userList.form.avatar')}>
                        <div className="flex items-center gap-4">
                            <AppForm.Item name="avatar" noStyle>
                                <Input hidden />
                            </AppForm.Item>
                            <AppForm.Item shouldUpdate={(prev, curr) => prev.avatar !== curr.avatar} noStyle>
                                {() => (
                                    <Avatar
                                        size={64}
                                        src={form.getFieldValue('avatar')}
                                        icon={<UserOutlined />}
                                        style={{ backgroundColor: form.getFieldValue('avatar') ? 'transparent' : '#bfbfbf' }}
                                    />
                                )}
                            </AppForm.Item>
                            <Upload
                                customRequest={async ({ file, onSuccess, onError }) => {
                                    try {
                                        const url = await ApiClient.uploadImage(file as File);
                                        form.setFieldsValue({ avatar: url });
                                        message.success(t('userList.messages.avatarUploadSuccess'));
                                        onSuccess?.(url);
                                    } catch (err) {
                                        message.error(t('userList.messages.avatarUploadFailed'));
                                        onError?.(err as Error);
                                    }
                                }}
                                showUploadList={false}
                            >
                                <AppButton intent="secondary" icon={<UploadOutlined />}>{t('userList.form.changeAvatar')}</AppButton>
                            </Upload>
                        </div>
                    </AppForm.Item>

                    <div className="grid grid-cols-2 gap-4">
                        <AppForm.Item
                            name="job_number"
                            label={t('userList.form.jobNumber')}
                        >
                            <Input placeholder={t('userList.form.jobNumberPlaceholder')} />
                        </AppForm.Item>
                        <AppForm.Item
                            name="account"
                            label={t('userList.form.account')}
                            rules={[{ required: true, message: t('userList.form.accountRequired') }]}
                        >
                            <Input placeholder={t('userList.form.accountPlaceholder')} />
                        </AppForm.Item>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <AppForm.Item
                            name="name"
                            label={t('userList.form.name')}
                            rules={[{ required: true, message: t('userList.form.nameRequired') }]}
                        >
                            <Input />
                        </AppForm.Item>
                        <AppForm.Item
                            name="gender"
                            label={t('userList.form.gender')}
                            rules={[{ required: true }]}
                        >
                            <Select>
                                <Option value="male">{t('userList.form.genderMale')}</Option>
                                <Option value="female">{t('userList.form.genderFemale')}</Option>
                            </Select>
                        </AppForm.Item>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <AppForm.Item
                            name="department"
                            label={t('userList.form.department')}
                            rules={[{ required: true, message: t('userList.form.departmentRequired') }]}
                        >
                            <Select
                                showSearch
                                placeholder={t('userList.form.departmentPlaceholder')}
                                optionFilterProp="children"
                            >
                                {/* Flatten departments to options or just use TreeSelect? Simple Select for now, mapping keys */}
                                {/* Assuming dept names are unique enough for simplified view, or just free text */}
                                {/* For simplicity, allowing free text input is good if dept not in tree. But let's provide options if possible. */}
                                {departments.map(d => (
                                    <Option key={d.id} value={d.name}>{d.name}</Option>
                                ))}
                                {/* Recursive flattening would be better but simple map works for 1-level, deep level not shown here */}
                            </Select>
                        </AppForm.Item>
                        <AppForm.Item
                            name="role"
                            label={t('userList.form.role')}
                        >
                            <Input placeholder={t('userList.form.rolePlaceholder')} />
                        </AppForm.Item>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <AppForm.Item
                            name="email"
                            label={t('userList.form.email')}
                            rules={[{ required: true, type: 'email', message: t('userList.form.emailRequired') }]}
                        >
                            <Input />
                        </AppForm.Item>
                        <AppForm.Item
                            name="phone"
                            label={t('userList.form.phone')}
                            rules={[{ required: true, message: t('userList.form.phoneRequired') }]}
                        >
                            <Input />
                        </AppForm.Item>
                    </div>

                    <AppForm.Item name="location" label={t('userList.form.location')}>
                        <Input placeholder={t('userList.form.locationPlaceholder')} />
                    </AppForm.Item>
                </AppForm>
            </AppModal>

            <AppModal
                title={t('userList.moveModal.title')}
                open={isMoveModalOpen}
                onCancel={() => setIsMoveModalOpen(false)}
                onOk={handleBatchMoveDepartment}
                confirmLoading={moving}
                okText={t('userList.moveModal.confirm')}
                width={560}
            >
                <div className="space-y-4">
                    <div className="text-sm text-slate-500">
                        {t('userList.moveModal.descPrefix')} <span className="font-semibold text-slate-700">{selectedRowKeys.length}</span> {t('userList.moveModal.descSuffix')}
                    </div>
                    <Select
                        showSearch
                        allowClear
                        placeholder={t('userList.moveModal.placeholder')}
                        value={targetDepartment}
                        onChange={(value) => setTargetDepartment(value)}
                        optionFilterProp="label"
                        options={departmentOptions.map((dept) => ({
                            value: dept.name,
                            label: dept.label,
                        }))}
                    />
                </div>
            </AppModal>
        </div>
    );
};

export default UserList;
