import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search, X } from 'lucide-react';
import { Employee } from '../../types';
import ApiClient from '../../services/api';

const EmployeeList: React.FC = () => {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
    const [search, setSearch] = useState('');

    // Form State
    const [formData, setFormData] = useState<Partial<Employee>>({});

    useEffect(() => {
        fetchEmployees();
    }, []);

    const fetchEmployees = async () => {
        try {
            const data = await ApiClient.getEmployees();
            setEmployees(data);
        } catch (error) {
            console.error(error);
        }
    };

    const handleDelete = async (id: any) => {
        if (confirm('Are you sure you want to delete this employee?')) {
            await ApiClient.deleteEmployee(id);
            fetchEmployees();
        }
    };

    const handleEdit = (emp: Employee) => {
        setEditingEmployee(emp);
        setFormData(emp);
        setIsEditorOpen(true);
    };

    const handleAddNew = () => {
        setEditingEmployee(null);
        setFormData({
            name: '',
            role: '',
            department: '',
            email: '',
            avatar: 'https://i.pravatar.cc/150',
            status: '在线'
        });
        setIsEditorOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingEmployee) {
                await ApiClient.updateEmployee(Number(editingEmployee.id), formData);
            } else {
                await ApiClient.createEmployee(formData);
            }
            setIsEditorOpen(false);
            fetchEmployees();
        } catch (error) {
            alert('Failed to save');
        }
    };

    const filteredEmployees = employees.filter(e =>
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.department.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-black text-slate-900 dark:text-white">员工档案管理</h2>
                <button
                    onClick={handleAddNew}
                    className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition"
                >
                    <Plus size={18} className="mr-2" />
                    新增员工
                </button>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-6 shadow-sm border border-slate-100 dark:border-slate-700/50">
                <div className="flex items-center space-x-3 mb-6 bg-slate-50 dark:bg-slate-900 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <Search size={18} className="text-slate-400" />
                    <input
                        type="text"
                        placeholder="搜索姓名或部门..."
                        className="bg-transparent outline-none flex-1 text-sm font-medium"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <table className="w-full text-left">
                    <thead className="border-b border-slate-100 dark:border-slate-700">
                        <tr>
                            <th className="pb-4 pl-4 text-xs font-black uppercase text-slate-400">姓名</th>
                            <th className="pb-4 text-xs font-black uppercase text-slate-400">职位</th>
                            <th className="pb-4 text-xs font-black uppercase text-slate-400">部门</th>
                            <th className="pb-4 text-right pr-4 text-xs font-black uppercase text-slate-400">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                        {filteredEmployees.map(emp => (
                            <tr key={emp.id} className="group hover:bg-slate-50 dark:hover:bg-slate-700/30 transition">
                                <td className="py-4 pl-4">
                                    <div className="flex items-center space-x-3">
                                        <img src={emp.avatar} className="w-8 h-8 rounded-full" />
                                        <span className="font-bold text-slate-800 dark:text-slate-200">{emp.name}</span>
                                    </div>
                                </td>
                                <td className="py-4 text-sm font-medium text-slate-500">{emp.role}</td>
                                <td className="py-4 text-sm font-medium text-slate-500">
                                    <span className="px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300">
                                        {emp.department}
                                    </span>
                                </td>
                                <td className="py-4 pr-4 text-right">
                                    <div className="flex justify-end space-x-2">
                                        <button onClick={() => handleEdit(emp)} className="p-2 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                                            <Edit size={16} />
                                        </button>
                                        <button onClick={() => handleDelete(emp.id)} className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20">
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
                            <h3 className="text-xl font-black text-slate-900 dark:text-white">{editingEmployee ? '编辑员工' : '新增员工'}</h3>
                            <button onClick={() => setIsEditorOpen(false)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">姓名</label>
                                    <input required className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 ring-blue-500/50" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">部门</label>
                                    <input required className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 ring-blue-500/50" value={formData.department} onChange={e => setFormData({ ...formData, department: e.target.value })} />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">职位</label>
                                <input required className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 ring-blue-500/50" value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">邮箱</label>
                                <input type="email" required className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 ring-blue-500/50" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                            </div>

                            <div className="pt-4 flex justify-end space-x-3">
                                <button type="button" onClick={() => setIsEditorOpen(false)} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100">取消</button>
                                <button type="submit" className="px-6 py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/30">保存</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EmployeeList;
