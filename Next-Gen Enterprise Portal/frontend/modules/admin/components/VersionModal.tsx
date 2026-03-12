import React, { useEffect, useState } from 'react';
import App from 'antd/es/app';
import Button from 'antd/es/button';
import Modal from 'antd/es/modal';
import Tag from 'antd/es/tag';
import { Copy, Check, Server, GitBranch, Clock, Package } from 'lucide-react';
import { SystemVersion } from '@/types';
import ApiClient from '@/shared/services/api';
import { useTranslation } from 'react-i18next';
import { buildVersionModalCopyText, getVersionModalBuildReference } from './versionModalContract';

interface VersionModalProps {
    open: boolean;
    onClose: () => void;
}

const VersionModal: React.FC<VersionModalProps> = ({ open, onClose }) => {
    const { t, i18n } = useTranslation();
    const { message } = App.useApp();
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
            message.error(t('versionModal.messages.loadFailed'));
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = () => {
        if (!versionInfo) return;
        const text = buildVersionModalCopyText(versionInfo, {
            product: t('versionModal.copy.product'),
            version: t('versionModal.copy.version'),
            gitSha: t('versionModal.copy.gitSha'),
            gitRef: t('versionModal.copy.gitRef'),
            buildTime: t('versionModal.copy.buildTime'),
            buildRef: t('versionModal.copy.buildRef'),
            apiVersion: t('versionModal.copy.apiVersion'),
            schema: t('versionModal.copy.schema'),
        });
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        message.success(t('versionModal.messages.copySuccess'));
    };

    return (
        <Modal
            title={
                <div className="flex items-center gap-2">
                    <Server size={18} className="text-blue-500" />
                    <span>{t('versionModal.title')}</span>
                </div>
            }
            open={open}
            onCancel={onClose}
            footer={[
                <Button key="copy" onClick={handleCopy} icon={copied ? <Check size={14} /> : <Copy size={14} />}>
                    {copied ? t('versionModal.actions.copied') : t('versionModal.actions.copy')}
                </Button>,
                <Button key="ok" type="primary" onClick={onClose}>
                    {t('common.buttons.confirm')}
                </Button>
            ]}
            width={500}
        >
            <div className="pt-2">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
                        <p className="text-slate-400">{t('versionModal.states.loading')}</p>
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
                                {versionInfo.release_id || t('versionModal.fields.buildFallback', {
                                    value: getVersionModalBuildReference(versionInfo)
                                })}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg flex items-start gap-3">
                                <GitBranch size={16} className="text-slate-400 mt-1 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <div className="text-xs text-slate-500 mb-0.5">{t('versionModal.fields.gitCommit')}</div>
                                        {versionInfo.dirty && (
                                            <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded border border-amber-200">{t('versionModal.fields.dirty')}</span>
                                        )}
                                    </div>
                                    <div className="font-mono text-slate-800 dark:text-slate-200 text-sm truncate select-all">
                                        {versionInfo.git_sha}
                                    </div>
                                    <div className="text-[11px] text-slate-400 font-mono truncate">
                                        {versionInfo.git_ref || 'unknown'}
                                    </div>
                                </div>
                            </div>

                            <div className="col-span-2 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg flex items-start gap-3">
                                <Clock size={16} className="text-slate-400 mt-1 shrink-0" />
                                <div>
                                    <div className="text-xs text-slate-500 mb-0.5">{t('versionModal.fields.buildTime')}</div>
                                    <div className="text-sm text-slate-800 dark:text-slate-200">
                                        {new Date(versionInfo.build_time).toLocaleString(i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US')}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg flex items-center gap-2">
                                <Server size={14} className="text-slate-400" />
                                <div>
                                    <div className="text-[10px] text-slate-500">{t('versionModal.fields.apiVersion')}</div>
                                    <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                        {versionInfo.api_version || 'v1'}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg flex items-center gap-2">
                                <Package size={14} className="text-slate-400" />
                                <div>
                                    <div className="text-[10px] text-slate-500">{t('versionModal.fields.schema')}</div>
                                    <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                        {versionInfo.db_schema_version || '1.0.0'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="text-center text-xs text-slate-400 pt-2">
                            ©{' '}
                            <a
                                href="https://ngep.houyuxi.com"
                                target="_blank"
                                rel="noreferrer"
                                className="text-slate-500 hover:text-blue-600 no-underline"
                            >
                                {t('versionModal.footer.author')}
                            </a>{' '}
                            {t('versionModal.footer.rights')}
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-6 text-red-500">
                        {t('versionModal.states.loadError')}
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default VersionModal;
