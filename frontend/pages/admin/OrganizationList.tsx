import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search, X, ChevronRight, ChevronDown, Folder, FolderOpen, Users } from 'lucide-react';
import { Department } from '../../types';
import ApiClient from '../../services/api';
import { message, Tree, Empty, Card, Button } from 'antd';
import type { DataNode } from 'antd/es/tree';

const OrganizationList: React.FC = () => {
    const [departments, setDepartments] = useState<Department[]>([]);
    const [treeData, setTreeData] = useState<DataNode[]>([]);
    const [selectedDept, setSelectedDept] = useState<Department | null>(null);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        parent_id: null as number | null,
        description: '',
        manager: ''
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const data = await ApiClient.getDepartments();
            setDepartments(data);
            setTreeData(buildTreeData(data));
        } catch (error) {
            message.error("Failed to load departments");
        }
    };

    const buildTreeData = (depts: Department[]): DataNode[] => {
        return depts.map(dept => ({
            title: (
                <div className="flex items-center space-x-2 py-1">
                    <span className="font-bold text-slate-700 dark:text-slate-200">{dept.name}</span>
                    {dept.manager && <span className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-700 px-1 rounded">Mgr: {dept.manager}</span>}
                </div>
            ),
            key: dept.id,
            children: dept.children && dept.children.length > 0 ? buildTreeData(dept.children) : undefined,
            icon: ({ expanded }: any) => expanded ? <FolderOpen size={16} className="text-blue-500" /> : <Folder size={16} className="text-blue-500" />
        }));
    };

    const handleSelect = (selectedKeys: React.Key[]) => {
        if (selectedKeys.length > 0) {
            const id = Number(selectedKeys[0]);
            // Find deep
            const findDept = (list: Department[]): Department | null => {
                for (const d of list) {
                    if (d.id === id) return d;
                    if (d.children) {
                        const found = findDept(d.children);
                        if (found) return found;
                    }
                }
                return null;
            };
            const dept = findDept(departments);
            setSelectedDept(dept);
        } else {
            setSelectedDept(null);
        }
    };

    const handleAddNew = (parentId: number | null = null) => {
        setFormData({
            name: '',
            parent_id: parentId,
            description: '',
            manager: ''
        });
        setSelectedDept(null); // Clear selection or keep? If adding child, keeping selection helps context, but form is modal.
        // Actually, if adding child to selected, verify parentId
        setIsEditorOpen(true);
        setErrorMessage('');
    };

    const handleEdit = (dept: Department) => {
        setFormData({
            name: dept.name,
            parent_id: dept.parent_id,
            description: dept.description || '',
            manager: dept.manager || ''
        });
        setIsEditorOpen(true);
        setErrorMessage('');
    };

    const handleDelete = async (id: number) => {
        if (confirm('Are you sure you want to delete this department?')) {
            try {
                await ApiClient.deleteDepartment(id);
                message.success('Department deleted');
                fetchData();
                setSelectedDept(null);
            } catch (e: any) {
                message.error(e.response?.data?.detail || 'Failed to delete');
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (selectedDept && isEditorOpen && formData.name === selectedDept.name && formData.description === selectedDept.description) {
                // This logic is flawed because I reuse one form for create/edit.
                // Let's track if we are editing via a separate state 'editingTarget'
            }

            // Simplified: If selectedDept is set AND we clicked "Edit", strict check needed?
            // Better: use a separate 'editingId' state.
            // For now, I'll assume if I called handleEdit, 'selectedDept' is the target? 
            // BUT handleAddNew(child) also might have selectedDept. 
            // Let's refactor to explicit 'editingId'.

            // Re-implementing correctly below in render
        } catch (error) {
            // ...
        }
    };

    // Better Form Handling
    const [editingId, setEditingId] = useState<number | null>(null);

    const openCreateModal = (parentId: number | null) => {
        setEditingId(null);
        setFormData({ name: '', parent_id: parentId, description: '', manager: '' });
        setIsEditorOpen(true);
    }

    const openEditModal = (dept: Department) => {
        setEditingId(dept.id);
        setFormData({ name: dept.name, parent_id: dept.parent_id, description: dept.description || '', manager: dept.manager || '' });
        setIsEditorOpen(true);
    }

    const submitForm = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (editingId) {
                await ApiClient.updateDepartment(editingId, formData);
                message.success('Updated successfully');
            } else {
                await ApiClient.createDepartment(formData);
                message.success('Created successfully');
            }
            setIsEditorOpen(false);
            fetchData();
        } catch (e: any) {
            setErrorMessage(e.response?.data?.detail || 'Operation failed');
        } finally {
            setLoading(false);
        }
    }

    // Flatten for Parent Select
    const flattenDepts = (list: Department[], res: Department[] = []) => {
        list.forEach(d => {
            res.push(d);
            if (d.children) flattenDepts(d.children, res);
        });
        return res;
    }
    const allDepts = flattenDepts(departments);

    return (
        <div className="space-y-6 animate-in fade-in duration-700 bg-slate-50/50 dark:bg-slate-900/50 -m-6 p-6 min-h-full flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center shrink-0">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">组织架构管理</h2>
                    <p className="text-xs text-slate-400 font-bold mt-1">管理企业部门层级与结构</p>
                </div>
                <Button
                    type="primary"
                    icon={<Plus size={18} />}
                    onClick={() => openCreateModal(null)}
                    size="large"
                    className="rounded-xl px-6 bg-slate-900 hover:bg-slate-800 shadow-lg shadow-slate-900/20 border-0 h-10 font-bold transition-all hover:scale-105 active:scale-95"
                >
                    新增根部门
                </Button>
            </div>

            <div className="flex flex-1 min-h-0 gap-6">
                {/* Left: Tree */}
                <div className="w-1/3 min-w-[300px] flex flex-col bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700/50">
                    <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-50 dark:border-slate-700/50">
                        <h3 className="text-lg font-black text-slate-900 dark:text-white">部门层级</h3>
                        <span className="text-xs font-bold text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-lg">{departments.length} Nodes</span>
                    </div>
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        {departments.length > 0 ? (
                            <Tree
                                treeData={treeData}
                                onSelect={handleSelect}
                                showIcon
                                blockNode
                                className="bg-transparent dark:text-slate-200"
                            />
                        ) : (
                            <Empty description="暂无组织架构" className="mt-10" />
                        )}
                    </div>
                </div>

                {/* Right: Details */}
                <div className="flex-1 bg-white dark:bg-slate-800 rounded-[1.5rem] p-8 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-700/50 flex flex-col">
                    {selectedDept ? (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="flex justify-between items-start mb-8">
                                <div>
                                    <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-2">{selectedDept.name}</h1>
                                    <div className="flex items-center space-x-2 text-slate-500">
                                        <span className="bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-xs font-mono">ID: {selectedDept.id}</span>
                                        {selectedDept.manager && <span className="flex items-center"><Users size={14} className="mr-1" /> {selectedDept.manager}</span>}
                                    </div>
                                </div>
                                <div className="flex space-x-3">
                                    <button onClick={() => openEditModal(selectedDept)} className="px-4 py-2 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-bold text-sm transition flex items-center">
                                        <Edit size={16} className="mr-2" /> 编辑
                                    </button>
                                    <button onClick={() => handleDelete(selectedDept.id)} className="px-4 py-2 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 font-bold text-sm transition flex items-center">
                                        <Trash2 size={16} className="mr-2" /> 删除
                                    </button>
                                </div>
                            </div>

                            <div className="prose dark:prose-invert mb-8">
                                <h4 className="text-sm font-bold uppercase text-slate-400 tracking-widest mb-2">描述</h4>
                                <p className="text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                                    {selectedDept.description || "暂无描述"}
                                </p>
                            </div>

                            <div className="bg-blue-50 dark:bg-blue-900/10 rounded-2xl p-6 border border-blue-100 dark:border-blue-900/50">
                                <div className="flex justify-between items-center mb-4">
                                    <h4 className="font-bold text-blue-900 dark:text-blue-300">下级部门 ({selectedDept.children?.length || 0})</h4>
                                    <button onClick={() => openCreateModal(selectedDept.id)} className="text-xs bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 text-blue-600 hover:shadow-sm transition font-bold">
                                        + 添加子部门
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    {selectedDept.children?.map(child => (
                                        <div key={child.id} onClick={() => {
                                            // Auto select child strictly in tree? Or just visually here?
                                            // Let's just create a quick link or non-interactive for MVP
                                        }} className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-blue-100 dark:border-slate-700 flex justify-between items-center">
                                            <span className="font-bold text-slate-700 dark:text-slate-200">{child.name}</span>
                                            <ChevronRight size={14} className="text-slate-400" />
                                        </div>
                                    ))}
                                    {(!selectedDept.children || selectedDept.children.length === 0) && (
                                        <p className="text-sm text-slate-400 col-span-2 italic">无子部门</p>
                                    )}
                                </div>
                            </div>

                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400">
                            <div className="w-20 h-20 bg-slate-50 dark:bg-slate-900 rounded-full flex items-center justify-center mb-4">
                                <Folder size={32} className="text-slate-300" />
                            </div>
                            <p className="font-bold">请选择左侧部门查看详情</p>
                            <button onClick={() => openCreateModal(null)} className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition">
                                创建根部门
                            </button>
                        </div>
                    )}
                </div>

                {/* Modal */}
                {isEditorOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                        <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-black text-slate-900 dark:text-white">
                                    {editingId ? '编辑部门' : '新增部门'}
                                </h3>
                                <button onClick={() => setIsEditorOpen(false)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700">
                                    <X size={20} />
                                </button>
                            </div>
                            {errorMessage && <div className="mb-4 text-rose-500 font-bold bg-rose-50 p-2 rounded">{errorMessage}</div>}

                            <form onSubmit={submitForm} className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">部门名称</label>
                                    <input required className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 ring-indigo-500/50"
                                        value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">上级部门</label>
                                    <select
                                        className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 ring-indigo-500/50"
                                        value={formData.parent_id || ''}
                                        onChange={e => setFormData({ ...formData, parent_id: e.target.value ? Number(e.target.value) : null })}
                                    >
                                        <option value="">(根部门)</option>
                                        {allDepts.filter(d => d.id !== editingId).map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">负责人 (Manager)</label>
                                    <input className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 ring-indigo-500/50"
                                        value={formData.manager} onChange={e => setFormData({ ...formData, manager: e.target.value })} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">描述</label>
                                    <textarea className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 ring-indigo-500/50 h-24 resize-none"
                                        value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
                                </div>
                                <div className="pt-4 flex justify-end space-x-3">
                                    <button type="button" onClick={() => setIsEditorOpen(false)} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100">取消</button>
                                    <button type="submit" disabled={loading} className="px-6 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/30 disabled:opacity-50">
                                        {loading ? '保存' : '确定'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default OrganizationList;
