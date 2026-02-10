import React, { useEffect, useState } from 'react';
import { Modal, Descriptions, Tag, Button, message } from 'antd';
import { Copy, Check, Server, GitBranch, Clock, Package } from 'lucide-react';
import { SystemVersion } from '../types';
import ApiClient from '../services/api';

interface VersionModalProps {
    open: boolean;
    onClose: () => void;
}

const VersionModal: React.FC<VersionModalProps> = ({ open, onClose }) => {
    const [versionInfo, setVersionInfo] = useState<SystemVersion | null>(null);
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (open) {
            fetchVersion();
        }
    }, [open]);

    const fetchVersion = async () => {
        setLoading(true);
        try {
            const data = await ApiClient.getSystemVersion();
            setVersionInfo(data);
        } catch (error) {
            message.error('获取版本信息失败');
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = () => {
        if (!versionInfo) return;
        const text = `Product: ${versionInfo.product}\nVersion: ${versionInfo.version}\nGit SHA: ${versionInfo.git_sha}\nBuild Time: ${versionInfo.build_time}`;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        message.success('版本信息已复制');
    };

    return (
        <Modal
            title={
                <div className="flex items-center gap-2">
                    <Server size={18} className="text-blue-500" />
                    <span>系统版本信息</span>
                </div>
            }
            open={open}
            onCancel={onClose}
            footer={[
                <Button key="copy" onClick={handleCopy} icon={copied ? <Check size={14} /> : <Copy size={14} />}>
                    {copied ? '已复制' : '复制信息'}
                </Button>,
                <Button key="ok" type="primary" onClick={onClose}>
                    确定
                </Button>
            ]}
            width={500}
        >
            <div className="pt-2">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
                        <p className="text-slate-400">正在获取系统版本信息...</p>
                    </div>
                ) : versionInfo ? (
                    <div className="space-y-6">
                        <div className="text-center border-b border-slate-100 dark:border-slate-700 pb-5">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-1">{versionInfo.product}</h3>
                            <div className="flex items-center justify-center gap-2 mt-2">
                                <Tag color="blue" className="px-3 py-1 rounded-full text-sm font-medium m-0">
                                    v{versionInfo.semver}
                                </Tag>
                                <Tag
                                    color={versionInfo.channel === 'stable' ? 'green' : versionInfo.channel === 'beta' ? 'orange' : 'purple'}
                                    className="px-2 py-1 rounded-full text-xs font-mono m-0 uppercase"
                                >
                                    {versionInfo.channel}
                                </Tag>
                            </div>
                            <div className="text-xs text-slate-400 mt-2 font-mono">
                                {versionInfo.release_id || `Build ${versionInfo.build_id || versionInfo.build_number || 'N/A'}`}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg flex items-start gap-3">
                                <GitBranch size={16} className="text-slate-400 mt-1 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <div className="text-xs text-slate-500 mb-0.5">Git Commit</div>
                                        {versionInfo.dirty && (
                                            <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded border border-amber-200">DIRTY</span>
                                        )}
                                    </div>
                                    <div className="font-mono text-slate-800 dark:text-slate-200 text-sm truncate select-all">
                                        {versionInfo.git_sha}
                                    </div>
                                </div>
                            </div>

                            <div className="col-span-2 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg flex items-start gap-3">
                                <Clock size={16} className="text-slate-400 mt-1 shrink-0" />
                                <div>
                                    <div className="text-xs text-slate-500 mb-0.5">构建时间</div>
                                    <div className="text-sm text-slate-800 dark:text-slate-200">
                                        {new Date(versionInfo.build_time).toLocaleString('zh-CN')}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg flex items-center gap-2">
                                <Server size={14} className="text-slate-400" />
                                <div>
                                    <div className="text-[10px] text-slate-500">API Version</div>
                                    <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                        {versionInfo.api_version || 'v1'}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg flex items-center gap-2">
                                <Package size={14} className="text-slate-400" />
                                <div>
                                    <div className="text-[10px] text-slate-500">Schema</div>
                                    <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                        {versionInfo.db_schema_version || '1.0.0'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="text-center text-xs text-slate-400 pt-2">
                            {versionInfo.version}
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-6 text-red-500">
                        版本信息加载失败，请检查网络连接
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default VersionModal;
