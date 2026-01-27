import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search, X, Shield, Star } from 'lucide-react';
import { Role, Permission } from '../../types';
import ApiClient from '../../services/api';
import { message, Tag, Checkbox, Card, Empty, Tooltip } from 'antd';

const RoleList: React.FC = () => {
    const [roles, setRoles] = useState<Role[]>([]);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);
    const [search, setSearch] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [loading, setLoading] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        code: '',
        name: '',
        description: '',
        permission_ids: [] as number[],
    });

    useEffect(() => {
        fetchData();
        fetchPermissions();
    }, []);

    const fetchData = async () => {
        try {
            const data = await ApiClient.getRoles();
            setRoles(data);
        } catch (error) {
            message.error("Failed to load roles");
        }
    };

    const fetchPermissions = async () => {
        try {
            const data = await ApiClient.getPermissions();
            setPermissions(data);
        } catch (error) {
            console.error("Failed to load permissions", error);
        }
    };

    const handleDelete = async (id: number) => {
        if (confirm('Are you sure you want to delete this role? This might affect users assigned to it.')) {
            try {
                await ApiClient.deleteRole(id);
                fetchData();
                message.success('Role deleted');
            } catch (e: any) {
                message.error(e.response?.data?.detail || 'Failed to delete role');
            }
        }
    };

    const handleEdit = (role: Role) => {
        setEditingRole(role);
        setFormData({
            code: role.code,
            name: role.name,
            description: role.description || '',
            permission_ids: role.permissions ? role.permissions.map(p => p.id) : []
        });
        setErrorMessage('');
        setIsEditorOpen(true);
    };

    const handleAddNew = () => {
        setEditingRole(null);
        setFormData({
            code: '',
            name: '',
            description: '',
            permission_ids: []
        });
        setErrorMessage('');
        setIsEditorOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage('');
        setLoading(true);
        try {
            if (editingRole) {
                const updatePayload = {
                    name: formData.name,
                    description: formData.description,
                    permission_ids: formData.permission_ids
                };
                await ApiClient.updateRole(editingRole.id, updatePayload);
                message.success('Role updated successfully');
            } else {
                await ApiClient.createRole(formData);
                message.success('Role created successfully');
            }
            setIsEditorOpen(false);
            fetchData();
        } catch (error: any) {
            setErrorMessage(error.response?.data?.detail || 'Failed to save');
        } finally {
            setLoading(false);
        }
    };

    const filteredRoles = roles.filter(r =>
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.code.toLowerCase().includes(search.toLowerCase())
    );

    // Group permissions for better UI (Optional, if we had groups. For now list all)
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-black text-slate-900 dark:text-white">角色定义与权限</h2>
                <button
                    onClick={handleAddNew}
                    className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition"
                >
                    <Plus size={18} className="mr-2" />
                    新增角色
                </button>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-6 shadow-sm border border-slate-100 dark:border-slate-700/50">
                <div className="flex items-center space-x-3 mb-6 bg-slate-50 dark:bg-slate-900 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <Search size={18} className="text-slate-400" />
                    <input
                        type="text"
                        placeholder="搜索角色名称或代码..."
                        className="bg-transparent outline-none flex-1 text-sm font-medium"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredRoles.map(role => (
                        <div key={role.id} className="mica rounded-3xl p-6 border border-slate-100 dark:border-slate-700 hover:shadow-lg transition-all group relative">
                            <div className="absolute top-4 right-4 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleEdit(role)} className="p-2 rounded-full bg-blue-50 text-blue-500 hover:bg-blue-100 dark:bg-slate-700 dark:text-blue-400">
                                    <Edit size={14} />
                                </button>
                                {role.code !== 'admin' && (
                                    <button onClick={() => handleDelete(role.id)} className="p-2 rounded-full bg-rose-50 text-rose-500 hover:bg-rose-100 dark:bg-slate-700 dark:text-rose-400">
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center space-x-3 mb-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${role.code === 'admin' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-600'}`}>
                                    <Shield size={20} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 dark:text-white">{role.name}</h3>
                                    <p className="text-xs font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded inline-block">{role.code}</p>
                                </div>
                            </div>

                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 h-5 line-clamp-1">{role.description || "无描述"}</p>

                            <div className="space-y-2">
                                <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">权限列表 ({role.permissions?.length || 0})</p>
                                <div className="flex flex-wrap gap-1">
                                    {role.permissions?.slice(0, 5).map(p => (
                                        <Tooltip key={p.id} title={p.description}>
                                            <span className="text-[10px] px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-slate-500">
                                                {p.code}
                                            </span>
                                        </Tooltip>
                                    ))}
                                    {(role.permissions?.length || 0) > 5 && (
                                        <span className="text-[10px] px-2 py-1 text-slate-400">+{role.permissions!.length - 5} more</span>
                                    )}
                                    {(!role.permissions || role.permissions.length === 0) && (
                                        <span className="text-[10px] text-slate-300 italic">暂无权限</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {filteredRoles.length === 0 && <Empty description="暂无角色数据" />}
            </div>

            {isEditorOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-800 w-full max-w-2xl rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-slate-900 dark:text-white">
                                {editingRole ? '编辑角色' : '创建新角色'}
                            </h3>
                            <button onClick={() => setIsEditorOpen(false)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700">
                                <X size={20} />
                            </button>
                        </div>

                        {errorMessage && (
                            <div className="mb-4 p-3 bg-rose-50 text-rose-600 rounded-xl text-sm font-bold">
                                {errorMessage}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">角色名称</label>
                                    <input
                                        required
                                        className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 ring-indigo-500/50"
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="例如：内容审核员"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">角色代码 (唯一)</label>
                                    <input
                                        required
                                        disabled={!!editingRole}
                                        className={`w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 ring-indigo-500/50 ${editingRole ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        value={formData.code}
                                        onChange={e => setFormData({ ...formData, code: e.target.value })}
                                        placeholder="例如：content_auditor"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">描述 (可选)</label>
                                <input
                                    className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 ring-indigo-500/50"
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase">权限分配</label>
                                <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 max-h-60 overflow-y-auto">
                                    <Checkbox.Group
                                        style={{ width: '100%' }}
                                        value={formData.permission_ids}
                                        onChange={(checkedValues) => setFormData({ ...formData, permission_ids: checkedValues as number[] })}
                                    >
                                        <div className="grid grid-cols-2 gap-3">
                                            {permissions.map(perm => (
                                                <div key={perm.id} className="flex items-start space-x-2">
                                                    <Checkbox value={perm.id} className="mt-0.5" />
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{perm.code}</p>
                                                        <p className="text-xs text-slate-400">{perm.description}</p>
                                                    </div>
                                                </div>
                                            ))}
                                            {permissions.length === 0 && <p className="text-sm text-slate-400 col-span-2">暂无可用权限，请联系开发人员添加权限定义。</p>}
                                        </div>
                                    </Checkbox.Group>
                                </div>
                            </div>

                            <div className="pt-4 flex justify-end space-x-3">
                                <button type="button" onClick={() => setIsEditorOpen(false)} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100">取消</button>
                                <button type="submit" disabled={loading} className="px-6 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/30 disabled:opacity-50">
                                    {loading ? '保存中...' : (editingRole ? '保存修改' : '创建角色')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RoleList;
