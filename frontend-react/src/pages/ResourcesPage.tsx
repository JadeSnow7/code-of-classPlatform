import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { FolderOpen, Plus, Video, FileText, Link as LinkIcon, ExternalLink, Trash2, Loader2, Upload, X } from 'lucide-react';
import { resourceApi, type Resource } from '@/api/resource';
import { uploadApi } from '@/api/upload';
import { authStore } from '@/lib/auth-store';
import { clsx } from 'clsx';

const RESOURCE_TYPES = [
    { key: '', label: '全部', icon: FolderOpen },
    { key: 'video', label: '视频', icon: Video },
    { key: 'paper', label: '论文', icon: FileText },
    { key: 'link', label: '链接', icon: LinkIcon },
] as const;

export function ResourcesPage() {
    const { courseId } = useParams<{ courseId: string }>();
    const [resources, setResources] = useState<Resource[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeType, setActiveType] = useState('');
    const [showCreate, setShowCreate] = useState(false);

    const user = authStore.getUser();
    const canCreate = user?.role === 'admin' || user?.role === 'teacher';

    useEffect(() => {
        if (!courseId) return;
        loadResources();
    }, [courseId, activeType]);

    const loadResources = async () => {
        if (!courseId) return;
        setIsLoading(true);
        setError(null);
        try {
            const data = await resourceApi.listByCourse(parseInt(courseId), activeType || undefined);
            setResources(data);
        } catch (err: any) {
            setError(err.message || 'Failed to load resources');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreate = async (title: string, type: 'video' | 'paper' | 'link', url: string, description: string) => {
        if (!courseId) return;
        try {
            await resourceApi.create({
                course_id: parseInt(courseId),
                title,
                type,
                url,
                description,
            });
            setShowCreate(false);
            loadResources();
        } catch (err: any) {
            alert('添加失败: ' + err.message);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('确定要删除这个资源吗？')) return;
        try {
            await resourceApi.delete(id);
            loadResources();
        } catch (err: any) {
            alert('删除失败: ' + err.message);
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'video': return Video;
            case 'paper': return FileText;
            default: return LinkIcon;
        }
    };

    return (
        <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white">课程资料</h1>
                    <p className="text-gray-400 text-sm mt-1">共 {resources.length} 个资源</p>
                </div>
                {canCreate && (
                    <button
                        onClick={() => setShowCreate(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        添加资源
                    </button>
                )}
            </div>

            {/* Type Tabs */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                {RESOURCE_TYPES.map((type) => (
                    <button
                        key={type.key}
                        onClick={() => setActiveType(type.key)}
                        className={clsx(
                            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
                            activeType === type.key
                                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                        )}
                    >
                        <type.icon className="w-4 h-4" />
                        {type.label}
                    </button>
                ))}
            </div>

            {/* Error */}
            {error && (
                <div className="bg-red-500/20 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-6">
                    {error}
                </div>
            )}

            {/* Loading */}
            {isLoading && (
                <div className="flex items-center justify-center h-32">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                </div>
            )}

            {/* Empty State */}
            {!isLoading && resources.length === 0 && !error && (
                <div className="text-center py-16 text-gray-500">
                    <FolderOpen className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <p className="text-lg">暂无资源</p>
                    {canCreate && <p className="text-sm mt-2">点击上方按钮添加第一个资源</p>}
                </div>
            )}

            {/* Resource Grid */}
            {!isLoading && resources.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {resources.map((resource) => {
                        const Icon = getTypeIcon(resource.type);
                        return (
                            <div
                                key={resource.ID}
                                className="bg-gray-800/50 border border-gray-700 rounded-xl p-5 hover:border-blue-500/30 transition-all group"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="p-2 bg-blue-600/20 rounded-lg">
                                        <Icon className="w-5 h-5 text-blue-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold text-white truncate">{resource.title}</h3>
                                        <p className="text-gray-400 text-sm mt-1 line-clamp-2">
                                            {resource.description || '暂无描述'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-700">
                                    <a
                                        href={resource.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-sm transition-colors"
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                        打开链接
                                    </a>
                                    {canCreate && (
                                        <button
                                            onClick={() => handleDelete(resource.ID)}
                                            className="p-1 text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                            title="删除"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Create Modal */}
            {showCreate && courseId && (
                <CreateResourceModal
                    onClose={() => setShowCreate(false)}
                    onCreate={handleCreate}
                    courseId={courseId}
                />
            )}
        </div>
    );
}

function CreateResourceModal({
    onClose,
    onCreate,
    courseId,
}: {
    onClose: () => void;
    onCreate: (title: string, type: 'video' | 'paper' | 'link', url: string, description: string) => void;
    courseId: string;
}) {
    const [title, setTitle] = useState('');
    const [type, setType] = useState<'video' | 'paper' | 'link'>('paper');
    const [url, setUrl] = useState('');
    const [description, setDescription] = useState('');

    // File upload mode
    const [uploadMode, setUploadMode] = useState<'url' | 'file'>('url');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;

        if (uploadMode === 'url') {
            if (!url.trim()) return;
            onCreate(title, type, url, description);
        } else {
            // File upload mode
            if (!selectedFile) return;

            setIsUploading(true);
            setUploadError(null);

            try {
                const result = await uploadApi.uploadResourceFile(
                    parseInt(courseId),
                    selectedFile,
                    (progress) => setUploadProgress(progress)
                );
                onCreate(title, type, result.signed_url, description);
            } catch (err: any) {
                setUploadError(err.message || '上传失败');
                setIsUploading(false);
            }
        }
    };

    const handleFileSelect = (file: File) => {
        // Validate file size (100MB max)
        if (file.size > 100 * 1024 * 1024) {
            setUploadError('文件大小不能超过 100MB');
            return;
        }
        setSelectedFile(file);
        setUploadError(null);

        // Auto-detect type based on extension
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext === 'mp4' || ext === 'webm' || ext === 'mov') {
            setType('video');
        } else if (ext === 'pdf' || ext === 'doc' || ext === 'docx' || ext === 'pptx') {
            setType('paper');
        }

        // Use filename as title if empty
        if (!title) {
            setTitle(file.name.replace(/\.[^/.]+$/, ''));
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) handleFileSelect(file);
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
                <h2 className="text-xl font-bold text-white mb-4">添加资源</h2>

                {/* Upload Mode Toggle */}
                <div className="flex gap-2 mb-4">
                    <button
                        type="button"
                        onClick={() => setUploadMode('url')}
                        className={clsx(
                            'flex-1 py-2 rounded-lg text-sm transition-colors',
                            uploadMode === 'url'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                        )}
                    >
                        输入链接
                    </button>
                    <button
                        type="button"
                        onClick={() => setUploadMode('file')}
                        className={clsx(
                            'flex-1 py-2 rounded-lg text-sm transition-colors',
                            uploadMode === 'file'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                        )}
                    >
                        上传文件
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">标题 *</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="输入资源标题"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-1">类型 *</label>
                        <div className="flex gap-2">
                            {(['video', 'paper', 'link'] as const).map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => setType(t)}
                                    className={clsx(
                                        'flex-1 py-2 rounded-lg text-sm transition-colors',
                                        type === t
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                    )}
                                >
                                    {t === 'video' ? '视频' : t === 'paper' ? '论文' : '链接'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {uploadMode === 'url' ? (
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">URL *</label>
                            <input
                                type="url"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="https://..."
                                required
                            />
                        </div>
                    ) : (
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">文件 *</label>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,.mp4,.pptx,.zip,.doc,.docx"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileSelect(file);
                                }}
                                className="hidden"
                            />

                            {!selectedFile ? (
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    onDrop={handleDrop}
                                    onDragOver={(e) => e.preventDefault()}
                                    className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-blue-500 transition-colors"
                                >
                                    <Upload className="w-8 h-8 text-gray-500 mx-auto mb-2" />
                                    <p className="text-gray-400 text-sm">点击或拖拽文件到此处</p>
                                    <p className="text-gray-500 text-xs mt-1">支持 PDF、MP4、PPTX、ZIP (最大 100MB)</p>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 p-3 bg-gray-700/50 border border-gray-600 rounded-lg">
                                    <FileText className="w-5 h-5 text-blue-400" />
                                    <span className="text-sm text-gray-300 flex-1 truncate">
                                        {selectedFile.name}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                        {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedFile(null);
                                            if (fileInputRef.current) fileInputRef.current.value = '';
                                        }}
                                        className="p-1 hover:bg-gray-600 rounded"
                                    >
                                        <X className="w-4 h-4 text-gray-400" />
                                    </button>
                                </div>
                            )}

                            {/* Upload Progress */}
                            {uploadProgress > 0 && uploadProgress < 100 && (
                                <div className="mt-2 space-y-1">
                                    <div className="flex justify-between text-xs text-gray-400">
                                        <span>上传中...</span>
                                        <span>{uploadProgress}%</span>
                                    </div>
                                    <div className="w-full bg-gray-700 rounded-full h-2">
                                        <div
                                            className="bg-blue-500 h-2 rounded-full transition-all"
                                            style={{ width: `${uploadProgress}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {uploadError && (
                                <p className="text-red-400 text-sm mt-2">{uploadError}</p>
                            )}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm text-gray-400 mb-1">描述</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 h-20 resize-none"
                            placeholder="输入资源描述"
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isUploading}
                            className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 rounded-lg transition-colors"
                        >
                            取消
                        </button>
                        <button
                            type="submit"
                            disabled={isUploading || !title.trim() || (uploadMode === 'url' ? !url.trim() : !selectedFile)}
                            className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                            {isUploading && <Loader2 className="w-4 h-4 animate-spin" />}
                            {isUploading ? '上传中...' : '添加'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
