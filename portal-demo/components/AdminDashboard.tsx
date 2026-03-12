
import React, { useState, useMemo } from 'react';
import { 
  Activity, Users, Database, ShieldAlert, TrendingUp, 
  CheckCircle2, AlertCircle, Zap, Download, LayoutGrid, 
  ChevronRight, UserPlus, Trash2, Settings, FileText, 
  Search, Filter, ShieldCheck, MonitorPlay, Save, 
  Power, Globe, BellRing, UserCheck, Plus, Image as ImageIcon,
  MoreVertical, ArrowUpRight, Eye, EyeOff, Edit3, X,
  History, Shield, BarChart3, Fingerprint, Lock, Layers,
  Server, Cpu, HardDrive, Mail, Briefcase, Building2, User as UserIcon, Loader2,
  Newspaper, RefreshCw, Link2, KeyRound, Network, Terminal, Clock, Calendar,
  Info, Camera, Eraser
} from 'lucide-react';
import { MOCK_EMPLOYEES, MOCK_ANNOUNCEMENTS, MOCK_NEWS } from '../constants';
import { NewsItem, Announcement, Employee } from '../types';

type AdminTab = 'overview' | 'users' | 'directory_sync' | 'content' | 'settings';
type LogFilter = 'all' | 'success' | 'info' | 'error';

interface FieldMapping {
  id: string;
  local: string;
  ldap: string;
}

interface SyncLog {
  id: string;
  event: string;
  time: string;
  status: 'success' | 'info' | 'error';
}

const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [employees, setEmployees] = useState<Employee[]>(MOCK_EMPLOYEES);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [logFilter, setLogFilter] = useState<LogFilter>('all');

  // LDAP Configuration State
  const [ldapConfig, setLdapConfig] = useState({
    host: 'ldap.shiku.internal',
    port: '389',
    baseDn: 'dc=shiku,dc=com',
    bindDn: 'cn=admin,dc=shiku,dc=com',
    password: '••••••••••••',
    syncInterval: 'daily'
  });

  // Dynamic Field Mappings State
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([
    { id: '1', local: '姓名', ldap: 'cn / displayName' },
    { id: '2', local: '电子邮箱', ldap: 'mail / userPrincipalName' },
    { id: '3', local: '工号', ldap: 'employeeNumber / uid' },
    { id: '4', local: '部门', ldap: 'department / ou' },
    { id: '5', local: '头像', ldap: 'thumbnailPhoto / jpegPhoto' }
  ]);

  // Sync Logs State
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([
    { id: 'l1', event: '用户 musen.l 已更新', time: '10:12:45', status: 'success' },
    { id: 'l2', event: '连接 LDAP 成功', time: '10:10:02', status: 'success' },
    { id: 'l3', event: '尝试同步域控制器...', time: '10:09:55', status: 'info' },
    { id: 'l4', event: '无法解析主机 ldap.shiku.internal', time: '09:45:12', status: 'error' },
    { id: 'l5', event: '同步进程超时 (3000ms)', time: '09:44:01', status: 'error' },
    { id: 'l6', event: '正在重试连接 (1/3)...', time: '09:43:50', status: 'info' }
  ]);

  const [isLdapTesting, setIsLdapTesting] = useState(false);
  const [isLdapSyncing, setIsLdapSyncing] = useState(false);
  const [showLdapPass, setShowLdapPass] = useState(false);

  // Form State for New Employee
  const [newEmp, setNewEmp] = useState({
    name: '',
    email: '',
    role: '',
    department: '技术部',
    status: '在线' as Employee['status'],
    isAdmin: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredEmployees = useMemo(() => {
    return employees.filter(e => 
      e.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      e.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.department.includes(searchTerm)
    );
  }, [employees, searchTerm]);

  const filteredLogs = useMemo(() => {
    if (logFilter === 'all') return syncLogs;
    return syncLogs.filter(log => log.status === logFilter);
  }, [syncLogs, logFilter]);

  const logStats = useMemo(() => ({
    all: syncLogs.length,
    success: syncLogs.filter(l => l.status === 'success').length,
    info: syncLogs.filter(l => l.status === 'info').length,
    error: syncLogs.filter(l => l.status === 'error').length,
  }), [syncLogs]);

  const handleAddEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      const id = (employees.length + 1).toString();
      const employeeToAdd: Employee = {
        ...newEmp,
        id,
        avatar: `https://i.pravatar.cc/150?u=${newEmp.email}`,
      };
      setEmployees([employeeToAdd, ...employees]);
      setIsSubmitting(false);
      setIsAddModalOpen(false);
      setNewEmp({ name: '', email: '', role: '', department: '技术部', status: '在线', isAdmin: false });
    }, 1000);
  };

  const addLog = (event: string, status: SyncLog['status'] = 'info') => {
    const newLog: SyncLog = {
      id: Math.random().toString(36).substr(2, 9),
      event,
      time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      status
    };
    setSyncLogs(prev => [newLog, ...prev]);
  };

  const handleLdapSync = () => {
    setIsLdapSyncing(true);
    addLog('启动手动目录同步...', 'info');
    
    // Simulate sync process
    setTimeout(() => {
      const ldapUser: Employee = {
        id: (employees.length + 1).toString(),
        name: '林木森 (LDAP)',
        email: 'musen.l@shiku.com',
        role: '运维专家',
        department: '技术部',
        avatar: 'https://i.pravatar.cc/150?u=ldap-user',
        status: '在线'
      };
      setEmployees([ldapUser, ...employees]);
      addLog('发现新用户: 林木森', 'success');
      addLog('同步完成。', 'success');
      setIsLdapSyncing(false);
    }, 3000);
  };

  const getSyncTip = () => {
    switch(ldapConfig.syncInterval) {
      case 'daily': return '每日凌晨 02:00 自动执行全量同步，确保数据实时性。';
      case 'weekly': return '每周日凌晨 03:00 执行同步，适用于人员变动不频繁的阶段。';
      case 'monthly': return '每月 1 号执行同步，建议手动配合增量同步。';
      default: return '';
    }
  };

  const addMapping = () => {
    const newId = Math.random().toString(36).substr(2, 9);
    setFieldMappings([...fieldMappings, { id: newId, local: '', ldap: '' }]);
  };

  const removeMapping = (id: string) => {
    setFieldMappings(fieldMappings.filter(m => m.id !== id));
  };

  const updateMapping = (id: string, field: 'local' | 'ldap', value: string) => {
    setFieldMappings(fieldMappings.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const deleteLog = (id: string) => {
    setSyncLogs(syncLogs.filter(log => log.id !== id));
  };

  const clearAllLogs = () => {
    if (confirm('确定要清空所有同步日志吗？')) {
      setSyncLogs([]);
    }
  };

  const getLogStyle = (status: SyncLog['status']) => {
    switch (status) {
      case 'success':
        return {
          bg: 'bg-emerald-50 dark:bg-emerald-950/20',
          border: 'border-emerald-200 dark:border-emerald-800/40',
          text: 'text-emerald-700 dark:text-emerald-400',
          accent: 'bg-emerald-500',
          icon: <CheckCircle2 size={14} className="text-emerald-500" />
        };
      case 'error':
        return {
          bg: 'bg-rose-50 dark:bg-rose-950/20',
          border: 'border-rose-200 dark:border-rose-800/40',
          text: 'text-rose-700 dark:text-rose-400',
          accent: 'bg-rose-500',
          icon: <AlertCircle size={14} className="text-rose-500" />
        };
      case 'info':
      default:
        return {
          bg: 'bg-blue-50 dark:bg-blue-950/20',
          border: 'border-blue-200 dark:border-blue-800/40',
          text: 'text-blue-700 dark:text-blue-400',
          accent: 'bg-blue-500',
          icon: <Info size={14} className="text-blue-500" />
        };
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-700 slide-in-from-bottom-8 pb-32">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">管理中心</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm font-medium tracking-tight">监控核心指标、管理团队成员及内容分发</p>
        </div>
        <div className="flex items-center space-x-2 bg-white/40 dark:bg-white/5 p-1.5 rounded-2xl border border-white/50 shadow-sm shrink-0 overflow-x-auto no-scrollbar">
          {[
            { id: 'overview', label: '概览' },
            { id: 'users', label: '成员' },
            { id: 'directory_sync', label: '目录同步' },
            { id: 'content', label: '内容' },
            { id: 'settings', label: '设置' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as AdminTab)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: '系统 CPU 负载', val: '12%', icon: <Cpu />, color: 'blue' },
            { label: '存储占用', val: '72.4 GB', icon: <HardDrive />, color: 'indigo' },
            { label: '活跃用户', val: '842', icon: <Users />, color: 'emerald' },
            { label: '安全预警', val: '0', icon: <ShieldCheck />, color: 'rose' },
          ].map((stat, i) => (
            <div key={i} className="mica p-6 rounded-[2rem] border border-white/50 flex items-center space-x-5 group hover:-translate-y-1 transition-all duration-500">
              <div className={`w-14 h-14 bg-${stat.color}-500/10 text-${stat.color}-600 rounded-2xl flex items-center justify-center rim-glow`}>
                {React.cloneElement(stat.icon as React.ReactElement<any>, { size: 24 })}
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{stat.val}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'directory_sync' && (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
           <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-8 space-y-8">
                 <div className="mica p-10 rounded-organic border border-white/50 shadow-2xl relative overflow-hidden group">
                    <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-500/5 rounded-full group-hover:scale-110 transition-transform duration-1000"></div>
                    <div className="flex items-center space-x-4 mb-10">
                       <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-xl">
                          <Network size={24} />
                       </div>
                       <div>
                          <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight uppercase">LDAP 服务器配置</h3>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Enterprise Directory Integration</p>
                       </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">LDAP 地址</label>
                          <div className="relative">
                             <Globe size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                             <input 
                                type="text" 
                                value={ldapConfig.host}
                                onChange={(e) => setLdapConfig({...ldapConfig, host: e.target.value})}
                                className="w-full bg-slate-50 dark:bg-white/5 border-none rounded-2xl py-4 pl-12 pr-4 outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-bold transition-all" 
                             />
                          </div>
                       </div>
                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">端口</label>
                          <input 
                             type="text" 
                             value={ldapConfig.port}
                             onChange={(e) => setLdapConfig({...ldapConfig, port: e.target.value})}
                             className="w-full bg-slate-50 dark:bg-white/5 border-none rounded-2xl py-4 px-6 outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-bold transition-all" 
                          />
                       </div>
                    </div>

                    <div className="mt-8 space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Base DN (搜索基准)</label>
                       <div className="relative">
                          <Layers size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input 
                             type="text" 
                             value={ldapConfig.baseDn}
                             onChange={(e) => setLdapConfig({...ldapConfig, baseDn: e.target.value})}
                             className="w-full bg-slate-50 dark:bg-white/5 border-none rounded-2xl py-4 pl-12 pr-4 outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-bold transition-all" 
                          />
                       </div>
                    </div>

                    <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">管理员 DN (Bind DN)</label>
                          <div className="relative">
                             <UserCheck size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                             <input 
                                type="text" 
                                value={ldapConfig.bindDn}
                                onChange={(e) => setLdapConfig({...ldapConfig, bindDn: e.target.value})}
                                className="w-full bg-slate-50 dark:bg-white/5 border-none rounded-2xl py-4 pl-12 pr-4 outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-bold font-mono transition-all" 
                             />
                          </div>
                       </div>
                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">绑定密码</label>
                          <div className="relative">
                             <KeyRound size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                             <input 
                                type={showLdapPass ? "text" : "password"} 
                                value={ldapConfig.password}
                                onChange={(e) => setLdapConfig({...ldapConfig, password: e.target.value})}
                                className="w-full bg-slate-50 dark:bg-white/5 border-none rounded-2xl py-4 pl-12 pr-12 outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-bold transition-all" 
                             />
                             <button 
                                onClick={() => setShowLdapPass(!showLdapPass)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors"
                             >
                                {showLdapPass ? <EyeOff size={16} /> : <Eye size={16} />}
                             </button>
                          </div>
                       </div>
                    </div>

                    {/* Sync Frequency Dropdown */}
                    <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8 items-end">
                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">同步频率 (Sync Interval)</label>
                          <div className="relative">
                             <Clock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                             <select 
                                value={ldapConfig.syncInterval}
                                onChange={(e) => setLdapConfig({...ldapConfig, syncInterval: e.target.value})}
                                className="w-full bg-slate-50 dark:bg-white/5 border-none rounded-2xl py-4 pl-12 pr-10 outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-bold appearance-none transition-all cursor-pointer"
                             >
                                <option value="daily">每日 (Daily)</option>
                                <option value="weekly">每周 (Weekly)</option>
                                <option value="monthly">每月 (Monthly)</option>
                             </select>
                             <ChevronRight size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 rotate-90 pointer-events-none" />
                          </div>
                       </div>
                       <div className="pb-1 px-2">
                          <div className="flex items-start space-x-3 p-3 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-2xl border border-indigo-100 dark:border-indigo-800/20 animate-in fade-in zoom-in-95">
                             <Info size={14} className="text-indigo-600 mt-0.5 shrink-0" />
                             <p className="text-[9px] font-bold text-indigo-700 dark:text-indigo-300 leading-relaxed italic">
                                {getSyncTip()}
                             </p>
                          </div>
                       </div>
                    </div>

                    <div className="mt-10 pt-8 border-t border-slate-100 dark:border-white/5 flex flex-col sm:flex-row gap-4">
                       <button 
                          onClick={() => { setIsLdapTesting(true); setTimeout(() => { setIsLdapTesting(false); alert('连接测试成功！已成功连接到 ldap.shiku.internal:389'); }, 1500); }}
                          className="flex-1 mica py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition-all flex items-center justify-center space-x-2"
                       >
                          {isLdapTesting ? <Loader2 size={16} className="animate-spin" /> : <Terminal size={16} />}
                          <span>测试 LDAP 连接</span>
                       </button>
                       <button className="flex-1 bg-slate-900 text-white py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-slate-900/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center space-x-2">
                          <Save size={16} />
                          <span>保存配置项</span>
                       </button>
                    </div>
                 </div>

                 <div className="mica p-10 rounded-organic border border-white/50 shadow-xl">
                    <div className="flex items-center justify-between mb-8">
                       <h4 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">属性映射 (Field Mapping)</h4>
                       <button 
                          onClick={addMapping}
                          className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-100 transition-all flex items-center space-x-2"
                       >
                          <Plus size={14} />
                          <span>添加映射项</span>
                       </button>
                    </div>
                    <div className="space-y-4">
                       {fieldMappings.map((map) => (
                          <div key={map.id} className="flex items-center space-x-3 group animate-in slide-in-from-left-2 duration-300">
                             <div className="flex-1 relative">
                                <input 
                                   type="text" 
                                   value={map.local}
                                   placeholder="本地字段 (如: 姓名)"
                                   onChange={(e) => updateMapping(map.id, 'local', e.target.value)}
                                   className="w-full p-4 bg-slate-50 dark:bg-white/5 rounded-2xl text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest border border-dashed border-slate-200 dark:border-white/10 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                />
                             </div>
                             <Link2 size={16} className="text-indigo-500 shrink-0 opacity-40" />
                             <div className="flex-1 relative">
                                <input 
                                   type="text" 
                                   value={map.ldap}
                                   placeholder="LDAP 字段 (如: cn)"
                                   onChange={(e) => updateMapping(map.id, 'ldap', e.target.value)}
                                   className="w-full p-4 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-2xl text-[11px] font-black text-indigo-600 uppercase tracking-widest border border-indigo-100 dark:border-indigo-900/20 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                />
                             </div>
                             <button 
                               onClick={() => removeMapping(map.id)}
                               className="p-3 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                               title="删除映射"
                             >
                                <Trash2 size={16} />
                             </button>
                          </div>
                       ))}
                    </div>
                    {fieldMappings.length === 0 && (
                      <div className="py-12 text-center border-2 border-dashed border-slate-100 dark:border-white/5 rounded-[2.5rem]">
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">暂无属性映射，请点击上方按钮手动配置</p>
                      </div>
                    )}
                 </div>
              </div>

              <div className="lg:col-span-4 space-y-8">
                 <div className="mica p-8 rounded-organic border border-indigo-600/20 bg-gradient-to-br from-indigo-600 to-indigo-900 text-white shadow-2xl relative overflow-hidden group">
                    <div className="absolute inset-0 bg-cubes opacity-10"></div>
                    <div className="relative z-10">
                       <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-200 mb-6">目录状态</h3>
                       <div className="flex items-center space-x-4 mb-10">
                          <div className={`w-16 h-16 rounded-[2rem] bg-white/10 flex items-center justify-center ${isLdapSyncing ? 'animate-spin' : ''}`}>
                             <RefreshCw size={32} className="text-white" />
                          </div>
                          <div>
                             <p className="text-2xl font-black tracking-tighter">就绪</p>
                             <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">上次同步: 2小时前</p>
                          </div>
                       </div>
                       
                       <div className="space-y-4 mb-8">
                          <div className="flex justify-between text-[10px] font-black uppercase">
                             <span>同步进度</span>
                             <span>{isLdapSyncing ? '正在拉取...' : '100%'}</span>
                          </div>
                          <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                             <div 
                                className={`h-full bg-white transition-all duration-1000 ${isLdapSyncing ? 'w-[65%] animate-pulse' : 'w-full'}`}
                             ></div>
                          </div>
                       </div>

                       <button 
                          onClick={handleLdapSync}
                          disabled={isLdapSyncing}
                          className="w-full bg-white text-indigo-600 py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-indigo-50 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
                       >
                          {isLdapSyncing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                          <span>立即同步目录</span>
                       </button>
                    </div>
                 </div>

                 <div className="mica p-8 rounded-organic border border-white/50 shadow-xl space-y-6">
                    <div className="flex items-center justify-between">
                       <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-800 dark:text-white">同步日志</h4>
                       {syncLogs.length > 0 && (
                         <button 
                           onClick={clearAllLogs}
                           className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                           title="清空日志"
                         >
                            <Eraser size={14} />
                         </button>
                       )}
                    </div>

                    {/* Log Filter Pills */}
                    <div className="flex items-center p-1 bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10">
                       {[
                         { id: 'all', label: '全部', count: logStats.all },
                         { id: 'success', label: '成功', count: logStats.success },
                         { id: 'info', label: '信息', count: logStats.info },
                         { id: 'error', label: '错误', count: logStats.error },
                       ].map(filter => (
                         <button
                           key={filter.id}
                           onClick={() => setLogFilter(filter.id as LogFilter)}
                           className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-tight transition-all flex items-center justify-center space-x-1.5 ${
                             logFilter === filter.id 
                               ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm' 
                               : 'text-slate-400 hover:text-slate-600'
                           }`}
                         >
                           <span>{filter.label}</span>
                           <span className={`px-1 rounded-md text-[8px] ${logFilter === filter.id ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'bg-slate-200 dark:bg-white/10 text-slate-500'}`}>
                             {filter.count}
                           </span>
                         </button>
                       ))}
                    </div>

                    <div className="space-y-2.5 max-h-[400px] overflow-y-auto no-scrollbar pr-1">
                       {filteredLogs.length > 0 ? (
                         filteredLogs.map((log) => {
                           const style = getLogStyle(log.status);
                           return (
                             <div 
                               key={log.id} 
                               className={`p-3 rounded-2xl border ${style.bg} ${style.border} group transition-all hover:scale-[1.01] flex items-start justify-between relative overflow-hidden`}
                             >
                                <div className={`absolute top-0 left-0 bottom-0 w-1 ${style.accent}`} />
                                <div className="flex items-start space-x-3 relative z-10 pl-1">
                                   <div className="mt-0.5 shrink-0 p-1 rounded-lg bg-white/60 dark:bg-black/20">
                                      {style.icon}
                                   </div>
                                   <div>
                                      <p className={`text-[10px] font-bold leading-tight ${style.text}`}>
                                         {log.event}
                                      </p>
                                      <div className="flex items-center space-x-2 mt-1">
                                         <Clock size={8} className="text-slate-400" />
                                         <span className="text-[8px] font-mono text-slate-400/80 uppercase">{log.time}</span>
                                      </div>
                                   </div>
                                </div>
                                <button 
                                  onClick={() => deleteLog(log.id)}
                                  className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 transition-all p-1 shrink-0"
                                >
                                   <Trash2 size={12} />
                                </button>
                             </div>
                           );
                         })
                       ) : (
                         <div className="text-center py-10 border-2 border-dashed border-slate-50 dark:border-white/5 rounded-3xl">
                            <p className="text-[10px] font-black text-slate-300 uppercase italic">暂无符合条件的记录</p>
                         </div>
                       )}
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
             <div className="relative flex-1 max-w-md w-full">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="搜索姓名、邮箱或部门..."
                  className="w-full bg-white/50 dark:bg-white/5 border border-white/50 rounded-2xl py-3 pl-12 pr-4 outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs font-bold"
                />
             </div>
             <button 
               onClick={() => setIsAddModalOpen(true)}
               className="flex items-center space-x-3 px-8 py-3 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-500/20 hover:scale-105 active:scale-95 transition-all"
             >
                <Plus size={16} />
                <span>新增员工</span>
             </button>
          </div>

          <div className="mica rounded-[2.5rem] overflow-hidden border border-white/50 shadow-2xl">
            <table className="w-full text-left">
              <thead className="bg-slate-50/50 dark:bg-white/5 border-b border-slate-100 dark:border-white/5">
                <tr>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">成员信息</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">职位/部门</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">状态</th>
                  <th className="px-8 py-5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="group hover:bg-white/40 dark:hover:bg-white/5 transition-colors">
                    <td className="px-8 py-4">
                      <div className="flex items-center space-x-4">
                        <img src={emp.avatar} className="w-10 h-10 rounded-xl object-cover shadow-sm border border-white dark:border-slate-800" />
                        <div>
                          <p className="text-sm font-black text-slate-900 dark:text-white tracking-tight">{emp.name}</p>
                          <p className="text-[10px] text-slate-400 font-bold">{emp.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-4">
                      <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-0.5">{emp.role}</p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase">{emp.department}</p>
                    </td>
                    <td className="px-8 py-4">
                      <div className="flex items-center space-x-2">
                         <span className={`w-1.5 h-1.5 rounded-full ${emp.status === '在线' ? 'bg-emerald-500' : emp.status === '会议中' ? 'bg-amber-500' : 'bg-slate-300'}`}></span>
                         <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">{emp.status}</span>
                      </div>
                    </td>
                    <td className="px-8 py-4 text-right">
                       <button className="p-2 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100">
                          <Trash2 size={16} />
                       </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Employee Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setIsAddModalOpen(false)}></div>
          <div className="relative w-full max-w-xl mica p-10 rounded-organic border border-white/50 shadow-2xl animate-in zoom-in-95 duration-500">
            <button 
              onClick={() => setIsAddModalOpen(false)}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
            
            <div className="flex items-center space-x-4 mb-10">
               <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/30">
                  <UserPlus size={24} />
               </div>
               <div>
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">新增团队成员</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ShiKu Home 成员入职向导</p>
               </div>
            </div>

            <form onSubmit={handleAddEmployee} className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">真实姓名</label>
                  <input 
                    type="text" 
                    required
                    value={newEmp.name}
                    onChange={(e) => setNewEmp({...newEmp, name: e.target.value})}
                    placeholder="例如：王小明"
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">企业邮箱</label>
                  <input 
                    type="email" 
                    required
                    value={newEmp.email}
                    onChange={(e) => setNewEmp({...newEmp, email: e.target.value})}
                    placeholder="name@shiku.com"
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">部门归属</label>
                  <select 
                    value={newEmp.department}
                    onChange={(e) => setNewEmp({...newEmp, department: e.target.value})}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-bold appearance-none"
                  >
                    {['设计部', '技术部', '增长部', '人事部', '行政部'].map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">职位名称</label>
                  <input 
                    type="text" 
                    required
                    value={newEmp.role}
                    onChange={(e) => setNewEmp({...newEmp, role: e.target.value})}
                    placeholder="例如：前端开发工程师"
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-bold"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-6 bg-slate-50 dark:bg-white/5 rounded-3xl border border-white dark:border-white/5">
                 <div>
                    <p className="text-[11px] font-black text-slate-800 dark:text-white uppercase tracking-tight">赋予管理员权限</p>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">开启后可访问此管理后台</p>
                 </div>
                 <button 
                   type="button"
                   onClick={() => setNewEmp({...newEmp, isAdmin: !newEmp.isAdmin})}
                   className={`w-12 h-6 rounded-full transition-all relative ${newEmp.isAdmin ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`}
                 >
                   <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-all ${newEmp.isAdmin ? 'left-7' : 'left-1'}`} />
                 </button>
              </div>

              <div className="pt-6">
                 <button 
                   disabled={isSubmitting}
                   className="w-full bg-indigo-600 text-white py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl shadow-indigo-500/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center space-x-3 disabled:opacity-50"
                 >
                   {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <><CheckCircle2 size={18} /><span>确认新增成员</span></>}
                 </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'content' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
           <div className="mica p-8 rounded-[2.5rem] border border-white/50 shadow-xl space-y-6">
              <div className="flex items-center justify-between mb-4">
                 <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white flex items-center">
                    <Newspaper size={18} className="mr-2 text-blue-500" />
                    新闻资讯管理
                 </h3>
                 <button className="text-[9px] font-black uppercase tracking-widest text-indigo-600">发布新文</button>
              </div>
              <div className="space-y-4">
                 {MOCK_NEWS.map(n => (
                   <div key={n.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-white dark:border-white/5 group">
                      <div className="flex items-center space-x-3">
                         <img src={n.image} className="w-12 h-12 rounded-xl object-cover" />
                         <div>
                            <p className="text-xs font-bold text-slate-800 dark:text-white line-clamp-1">{n.title}</p>
                            <p className="text-[8px] text-slate-400 uppercase font-bold">{n.date} · {n.author}</p>
                         </div>
                      </div>
                      <button className="p-2 text-slate-300 hover:text-indigo-600 transition-colors">
                         <MoreVertical size={14} />
                      </button>
                   </div>
                 ))}
              </div>
           </div>

           <div className="mica p-8 rounded-[2.5rem] border border-white/50 shadow-xl space-y-6">
              <div className="flex items-center justify-between mb-4">
                 <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white flex items-center">
                    <BellRing size={18} className="mr-2 text-amber-500" />
                    公告板管理
                 </h3>
                 <button className="text-[9px] font-black uppercase tracking-widest text-indigo-600">发布公告</button>
              </div>
              <div className="space-y-4">
                 {MOCK_ANNOUNCEMENTS.map(a => (
                   <div key={a.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-white dark:border-white/5 group">
                      <div className="flex items-center space-x-3">
                         <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                            <Megaphone size={16} />
                         </div>
                         <div>
                            <p className="text-xs font-bold text-slate-800 dark:text-white line-clamp-1">{a.title}</p>
                            <p className="text-[8px] text-slate-400 uppercase font-bold">{a.time}</p>
                         </div>
                      </div>
                      <button className="p-2 text-slate-300 hover:text-indigo-600 transition-colors">
                         <Edit3 size={14} />
                      </button>
                   </div>
                 ))}
              </div>
           </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="mica p-10 rounded-organic border border-white/50 shadow-2xl space-y-12">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <section className="space-y-6">
                 <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight flex items-center">
                    <Shield size={20} className="mr-3 text-indigo-600" />
                    安全与准入
                 </h3>
                 <div className="space-y-4">
                    {[
                      { label: '多重身份验证 (MFA)', desc: '要求所有管理员登录时进行指纹或验证码二次确认', enabled: true },
                      { label: '地理围墙登录', desc: '限制仅在公司办公区范围内可登录内网后台', enabled: false },
                      { label: '员工自动同步', desc: '与飞书/钉钉组织架构保持实时自动同步', enabled: true },
                    ].map((set, i) => (
                      <div key={i} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-white dark:border-white/5">
                        <div className="max-w-[80%]">
                           <p className="text-[11px] font-black text-slate-800 dark:text-white uppercase tracking-tight">{set.label}</p>
                           <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{set.desc}</p>
                        </div>
                        <button className={`w-10 h-5 rounded-full transition-all relative ${set.enabled ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`}>
                           <div className={`absolute top-1 w-3 h-3 rounded-full bg-white shadow-sm transition-all ${set.enabled ? 'left-6' : 'left-1'}`} />
                        </button>
                      </div>
                    ))}
                 </div>
              </section>

              <section className="space-y-6">
                 <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight flex items-center">
                    <Zap size={20} className="mr-3 text-amber-500" />
                    性能与 AI
                 </h3>
                 <div className="space-y-4">
                    <div className="p-6 bg-slate-900 text-white rounded-[2rem] border border-white/10 shadow-xl relative overflow-hidden group">
                       <div className="absolute inset-0 mesh-gradient opacity-20 group-hover:opacity-40 transition-opacity"></div>
                       <div className="relative z-10">
                          <p className="text-[9px] font-black text-blue-400 uppercase tracking-[0.2em] mb-2">Gemini Pro API Status</p>
                          <div className="flex items-center space-x-2 mb-4">
                             <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                             <p className="text-xl font-black tracking-tighter">Healthy & Connected</p>
                          </div>
                          <button className="px-4 py-2 bg-white/10 backdrop-blur-md rounded-xl text-[8px] font-black uppercase tracking-widest border border-white/20 hover:bg-white/20 transition-all">测试 API 延迟</button>
                       </div>
                    </div>
                 </div>
              </section>
           </div>
        </div>
      )}
    </div>
  );
};

const Megaphone: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>
  </svg>
);

export default AdminDashboard;
