import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search, X, Shield, Lock } from 'lucide-react';
import { User } from '../../types';
import ApiClient from '../../services/api';

const UserList: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [search, setSearch] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    // Form State
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        role: 'user' as 'admin' | 'user'
    });

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const data = await ApiClient.getUsers();
            setUsers(data);
        } catch (error) {
            console.error(error);
        }
    };

    const handleDelete = async (id: number) => {
        if (confirm('Are you sure you want to delete this user?')) {
            try {
                await ApiClient.deleteUser(id);
                fetchUsers();
            } catch (e) {
                alert('Failed to delete user');
            }
        }
    };

    const handleAddNew = () => {
        setEditingUser(null);
        setFormData({
            username: '',
            email: '',
            password: '', // Required for new user
            role: 'user'
        });
        setErrorMessage('');
        setIsEditorOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage('');
        try {
            if (editingUser) {
                // Update logic (not fully implemented in backend yet for password reset, but placeholders here)
                alert("Edit user is not fully supported in this version (backend limitation). Delete and recreate to change details.");
            } else {
                await ApiClient.createUser(formData);
            }
            setIsEditorOpen(false);
            fetchUsers();
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
                            <th className="pb-4 text-xs font-black uppercase text-slate-400">角色权限</th>
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
                                    <span className={`px-2 py-1 rounded-md text-xs font-black uppercase tracking-widest ${user.role === 'admin'
                                            ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
                                            : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                                        }`}>
                                        {user.role === 'admin' ? <Shield size={12} className="inline mr-1" /> : null}
                                        {user.role}
                                    </span>
                                </td>
                                <td className="py-4 text-sm font-medium text-slate-500">{user.email}</td>
                                <td className="py-4 pr-4 text-right">
                                    <div className="flex justify-end space-x-2">
                                        <button onClick={() => handleDelete(user.id)} className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20">
                                            <Trash2 size={16} />
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
                            <h3 className="text-xl font-black text-slate-900 dark:text-white">新增账户</h3>
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
                                <input required className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 ring-indigo-500/50" value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">初始密码</label>
                                <input required type="password" className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 ring-indigo-500/50" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">角色权限</label>
                                    <select
                                        className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 ring-indigo-500/50"
                                        value={formData.role}
                                        onChange={e => setFormData({ ...formData, role: e.target.value as 'admin' | 'user' })}
                                    >
                                        <option value="user">普通用户 (User)</option>
                                        <option value="admin">管理员 (Admin)</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">邮箱</label>
                                    <input type="email" required className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 ring-indigo-500/50" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                                </div>
                            </div>

                            <div className="pt-4 flex justify-end space-x-3">
                                <button type="button" onClick={() => setIsEditorOpen(false)} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100">取消</button>
                                <button type="submit" className="px-6 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/30">创建账户</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserList;
