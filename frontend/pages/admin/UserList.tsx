import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search, X, Shield, Lock, Key } from 'lucide-react';
import { User, Role } from '../../types';
import ApiClient from '../../services/api';
import { message, Select, Tag } from 'antd'; // Importing Select for multi-choice

const UserList: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [search, setSearch] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    // Form State
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        role_ids: [] as number[],
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [usersData, rolesData] = await Promise.all([
                ApiClient.getUsers(),
                ApiClient.getRoles()
            ]);
            setUsers(usersData);
            setRoles(rolesData);
        } catch (error) {
            console.error(error);
            message.error("Failed to load users or roles");
        }
    };

    const handleDelete = async (id: number) => {
        if (confirm('Are you sure you want to delete this user?')) {
            try {
                await ApiClient.deleteUser(id);
                fetchData();
                message.success('User deleted');
            } catch (e) {
                message.error('Failed to delete user');
            }
        }
    };

    const handleResetPassword = async (username: string) => {
        if (confirm(`Are you sure you want to reset password for ${username} to '123456'?`)) {
            try {
                await ApiClient.resetPassword(username);
                message.success(`Password for ${username} reset successfully`);
            } catch (error) {
                message.error('Failed to reset password');
            }
        }
    };

    const handleEdit = (user: User) => {
        setEditingUser(user);
        setFormData({
            username: user.username,
            email: user.email,
            password: '',
            role_ids: user.roles?.map(r => r.id) || []
        });
        setErrorMessage('');
        setIsEditorOpen(true);
    };

    const handleAddNew = () => {
        setEditingUser(null);
        setFormData({
            username: '',
            email: '',
            password: '',
            role_ids: [] // Default empty? Or default to user role if known
        });
        setErrorMessage('');
        setIsEditorOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage('');
        try {
            if (editingUser) {
                const updatePayload: any = {
                    email: formData.email,
                    role_ids: formData.role_ids
                };
                await ApiClient.updateUser(editingUser.id, updatePayload);
                message.success('User updated successfully');
            } else {
                await ApiClient.createUser(formData);
                message.success('User created successfully');
            }
            setIsEditorOpen(false);
            fetchData();
        } catch (error: any) {
            setErrorMessage(error.response?.data?.detail || 'Failed to save');
        }
    };

    const filteredUsers = users.filter(u =>
        u.username.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-black text-slate-900 dark:text-white">用户权限管理</h2>
                <button
                    onClick={handleAddNew}
                    className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition"
                >
                    <Plus size={18} className="mr-2" />
                    新增账户
                </button>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-6 shadow-sm border border-slate-100 dark:border-slate-700/50">
                <div className="flex items-center space-x-3 mb-6 bg-slate-50 dark:bg-slate-900 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <Search size={18} className="text-slate-400" />
                    <input
                        type="text"
                        placeholder="搜索用户名或邮箱..."
                        className="bg-transparent outline-none flex-1 text-sm font-medium"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <table className="w-full text-left">
                    <thead className="border-b border-slate-100 dark:border-slate-700">
                        <tr>
                            <th className="pb-4 pl-4 text-xs font-black uppercase text-slate-400">用户名</th>
                            <th className="pb-4 text-xs font-black uppercase text-slate-400">角色 (Roles)</th>
                            <th className="pb-4 text-xs font-black uppercase text-slate-400">邮箱</th>
                            <th className="pb-4 text-right pr-4 text-xs font-black uppercase text-slate-400">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                        {filteredUsers.map(user => (
                            <tr key={user.id} className="group hover:bg-slate-50 dark:hover:bg-slate-700/30 transition">
                                <td className="py-4 pl-4">
                                    <div className="flex items-center space-x-3">
                                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-500">
                                            {user.username[0].toUpperCase()}
                                        </div>
                                        <span className="font-bold text-slate-800 dark:text-slate-200">{user.username}</span>
                                    </div>
                                </td>
                                <td className="py-4">
                                    <div className="flex flex-wrap gap-2">
                                        {user.roles && user.roles.length > 0 ? user.roles.map(role => (
                                            <Tag key={role.id} color={role.code === 'admin' ? 'red' : 'blue'}>
                                                {role.name}
                                            </Tag>
                                        )) : (
                                            <Tag>No Roles</Tag>
                                        )}
                                    </div>
                                </td>
                                <td className="py-4 text-sm font-medium text-slate-500">{user.email}</td>
                                <td className="py-4 pr-4 text-right">
                                    <div className="flex justify-end space-x-2">
                                        <button onClick={() => handleEdit(user)} className="p-2 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                                            <Edit size={16} />
                                        </button>
                                        <button onClick={() => handleDelete(user.id)} className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20">
                                            <Trash2 size={16} />
                                        </button>
                                        <button onClick={() => handleResetPassword(user.username)} className="p-2 rounded-lg text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20" title="Reset Password">
                                            <Key size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {isEditorOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-slate-900 dark:text-white">
                                {editingUser ? '编辑用户' : '新增账户'}
                            </h3>
                            <button onClick={() => setIsEditorOpen(false)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700">
                                <X size={20} />
                            </button>
                        </div>

                        {errorMessage && (
                            <div className="mb-4 p-3 bg-rose-50 text-rose-600 rounded-xl text-sm font-bold flex items-center">
                                <Lock size={16} className="mr-2" /> {errorMessage}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">用户名</label>
                                <input
                                    required
                                    disabled={!!editingUser}
                                    className={`w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 ring-indigo-500/50 ${editingUser ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    value={formData.username}
                                    onChange={e => setFormData({ ...formData, username: e.target.value })}
                                />
                            </div>
                            {!editingUser && (
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">初始密码</label>
                                    <input required type="password" className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 ring-indigo-500/50" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
                                </div>
                            )}
                            <div className="grid grid-cols-1 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">分配角色</label>
                                    <Select
                                        mode="multiple"
                                        style={{ width: '100%' }}
                                        placeholder="选择角色"
                                        value={formData.role_ids}
                                        onChange={(values) => setFormData({ ...formData, role_ids: values })}
                                        optionLabelProp="label"
                                        className="h-10"
                                    >
                                        {roles.map(role => (
                                            <Select.Option key={role.id} value={role.id} label={role.name}>
                                                <div className="flex justify-between items-center">
                                                    <span>{role.name}</span>
                                                    <span className="text-slate-400 text-xs">{role.code}</span>
                                                </div>
                                            </Select.Option>
                                        ))}
                                    </Select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">邮箱</label>
                                    <input type="email" required className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 ring-indigo-500/50" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                                </div>
                            </div>

                            <div className="pt-4 flex justify-end space-x-3">
                                <button type="button" onClick={() => setIsEditorOpen(false)} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100">取消</button>
                                <button type="submit" className="px-6 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/30">
                                    {editingUser ? '保存修改' : '创建账户'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserList;
