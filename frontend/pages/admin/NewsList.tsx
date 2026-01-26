import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search, X, Image as ImageIcon } from 'lucide-react';
import { NewsItem } from '../../types';
import ApiClient from '../../services/api';

const NewsList: React.FC = () => {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingNews, setEditingNews] = useState<NewsItem | null>(null);
    const [search, setSearch] = useState('');

    // Form State
    const [formData, setFormData] = useState<Partial<NewsItem>>({});

    useEffect(() => {
        fetchNews();
    }, []);

    const fetchNews = async () => {
        try {
            const data = await ApiClient.getNews();
            setNews(data);
        } catch (error) {
            console.error(error);
        }
    };

    const handleDelete = async (id: any) => {
        if (confirm('Are you sure you want to delete this news?')) {
            await ApiClient.deleteNews(id);
            fetchNews();
        }
    };

    const handleEdit = (item: NewsItem) => {
        setEditingNews(item);
        setFormData(item);
        setIsEditorOpen(true);
    };

    const handleAddNew = () => {
        setEditingNews(null);
        setFormData({
            title: '',
            summary: '',
            category: '公告',
            date: new Date().toISOString().split('T')[0],
            author: 'Admin',
            image: 'https://picsum.photos/seed/new/400/200'
        });
        setIsEditorOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingNews) {
                await ApiClient.updateNews(Number(editingNews.id), formData);
            } else {
                await ApiClient.createNews(formData);
            }
            setIsEditorOpen(false);
            fetchNews();
        } catch (error) {
            alert('Failed to save');
        }
    };

    const filteredNews = news.filter(n =>
        n.title.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-black text-slate-900 dark:text-white">新闻资讯管理</h2>
                <button
                    onClick={handleAddNew}
                    className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition"
                >
                    <Plus size={18} className="mr-2" />
                    发布资讯
                </button>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-6 shadow-sm border border-slate-100 dark:border-slate-700/50">
                <div className="flex items-center space-x-3 mb-6 bg-slate-50 dark:bg-slate-900 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <Search size={18} className="text-slate-400" />
                    <input
                        type="text"
                        placeholder="搜索标题..."
                        className="bg-transparent outline-none flex-1 text-sm font-medium"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <div className="space-y-4">
                    {filteredNews.map(item => (
                        <div key={item.id} className="group flex items-center p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition shadow-sm hover:shadow-md">
                            <img src={item.image} className="w-20 h-14 rounded-lg object-cover mr-4" />
                            <div className="flex-1">
                                <h3 className="font-bold text-slate-800 dark:text-white line-clamp-1">{item.title}</h3>
                                <div className="flex items-center space-x-2 mt-1">
                                    <span className="text-xs font-bold text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded">{item.category}</span>
                                    <span className="text-xs text-slate-400">{item.date}</span>
                                </div>
                            </div>
                            <div className="flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleEdit(item)} className="p-2 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                                    <Edit size={16} />
                                </button>
                                <button onClick={() => handleDelete(item.id)} className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {isEditorOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-slate-900 dark:text-white">{editingNews ? '编辑资讯' : '发布资讯'}</h3>
                            <button onClick={() => setIsEditorOpen(false)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">标题</label>
                                <input required className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 ring-blue-500/50" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">分类</label>
                                    <select className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value as any })}>
                                        <option value="公告">公告</option>
                                        <option value="活动">活动</option>
                                        <option value="政策">政策</option>
                                        <option value="文化">文化</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">日期</label>
                                    <input type="date" required className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">摘要内容</label>
                                <textarea required rows={4} className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 ring-blue-500/50 resize-none" value={formData.summary} onChange={e => setFormData({ ...formData, summary: e.target.value })} />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">图片链接 (URL)</label>
                                <div className="relative">
                                    <ImageIcon size={18} className="absolute left-3 top-3.5 text-slate-400" />
                                    <input className="w-full pl-10 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 ring-blue-500/50" value={formData.image} onChange={e => setFormData({ ...formData, image: e.target.value })} />
                                </div>
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

export default NewsList;
