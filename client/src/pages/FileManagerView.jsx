import React, { useState, useRef } from 'react';
import {
  Folder,
  Plus,
  Upload,
  FolderPlus,
  Grid,
  List,
  MoreVertical,
  Star,
  Download,
  Share2,
  Trash2,
  RotateCcw,
  Eye,
  Info,
  ChevronRight,
  HardDrive,
  AlertCircle,
  FileText,
  Search,
  Check,
  X,
  FileCheck,
  Pause,
  Play
} from 'lucide-react';
import api from '../api/client';
import { formatBytes, formatDate, getFileIcon } from '../utils/formatters';

export default function FileManagerView({
  currentView,
  currentCategory,
  folders,
  files,
  breadcrumbs,
  currentFolderId,
  setCurrentFolderId,
  onRefresh,
  onOpenFileDetails,
  onOpenPreview,
  onOpenShare,
  agentConnected
}) {
  const [viewMode, setViewMode] = useState('grid');
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadSpeed, setUploadSpeed] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef(null);

  const getViewTitle = () => {
    if (currentView === 'trash') return 'Trash / Recycle Bin';
    if (currentView === 'starred') return 'Starred Files';
    if (currentView === 'recent') return 'Recent Files';
    if (currentView === 'shared-with-me') return 'Shared With Me';
    if (currentView === 'shared-drives') return 'Shared Team Drives';
    if (currentView === 'category') return `${currentCategory} Files`;
    return 'My Drive';
  };

  // 1. Create New Folder
  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      await api.post('/files/folder', {
        name: newFolderName.trim(),
        parentId: currentFolderId,
        isSharedDrive: currentView === 'shared-drives'
      });
      setNewFolderName('');
      setNewFolderOpen(false);
      onRefresh();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  // 2. Resumable & Idempotent Multi-Part Chunk Upload (Requirement 5)
  const handleFileUpload = async (file) => {
    if (!file) return;

    setUploading(true);
    setUploadFileName(file.name);
    setUploadProgress(1);

    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB standard chunks
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const startTime = Date.now();

    try {
      // Step A: Initiate session or check existing
      const initRes = await api.post('/files/upload/initiate', {
        fileName: file.name,
        totalSizeBytes: file.size,
        totalChunks,
        folderId: currentFolderId
      });

      const { sessionId } = initRes.data;

      // Step B: Query status to recover missing chunks if resumed
      const statusRes = await api.get(`/files/upload/${sessionId}/status`);
      const completedIndices = new Set(statusRes.data.uploadedChunkIndices || []);

      // Step C: Send missing chunks idempotently
      for (let i = 0; i < totalChunks; i++) {
        if (completedIndices.has(i)) {
          const pct = Math.round(((i + 1) / totalChunks) * 100);
          setUploadProgress(pct);
          continue;
        }

        const start = i * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const chunkBlob = file.slice(start, end);

        const arrayBuffer = await chunkBlob.arrayBuffer();
        const base64Chunk = btoa(
          new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );

        await api.post(`/files/upload/${sessionId}/chunk`, {
          chunkIndex: i,
          chunkBase64: base64Chunk,
          isLastChunk: i === totalChunks - 1
        });

        const elapsedSec = (Date.now() - startTime) / 1000;
        const speedMBs = elapsedSec > 0 ? (end / (1024 * 1024 * elapsedSec)).toFixed(1) : '—';
        setUploadSpeed(`${speedMBs} MB/s`);

        const pct = Math.round(((i + 1) / totalChunks) * 100);
        setUploadProgress(pct);
      }

      // Step D: Finalize and verify full SHA-256
      await api.post(`/files/upload/${sessionId}/finalize`);

      setUploadProgress(100);
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
        setUploadSpeed('');
        onRefresh();
      }, 500);
    } catch (err) {
      alert(`Upload failed: ${err.response?.data?.error || err.message}`);
      setUploading(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleStar = async (item, type) => {
    try {
      await api.put(`/files/${item.id}/star`, { itemType: type });
      onRefresh();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleTrash = async (item, type) => {
    try {
      await api.post(`/files/${item.id}/trash`, { itemType: type });
      onRefresh();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRestore = async (item, type) => {
    try {
      await api.post(`/files/${item.id}/restore`, { itemType: type });
      onRefresh();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeletePermanently = async (item, type) => {
    if (!confirm(`Are you sure you want to permanently delete "${item.name}"? Requires Super Admin approval.`)) return;
    try {
      await api.delete(`/files/${item.id}/permanent`, { data: { itemType: type } });
      onRefresh();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  const handleDownload = (file) => {
    const isOffline = file.status === 'UNAVAILABLE_DRIVE_OFFLINE';
    if (isOffline) {
      alert(`Cannot download "${file.name}": Physical storage volume "${file.volume_assigned_name}" is currently OFFLINE. Reconnect the storage drive to resume access.`);
      return;
    }
    const token = localStorage.getItem('nkb_token');
    const url = `/api/files/${file.id}/download?token=${encodeURIComponent(token)}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="p-8 max-w-7xl mx-auto space-y-6 select-none relative min-h-[calc(100vh-4rem)] flex flex-col"
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
        }}
      />

      {/* Drag & Drop Overlay */}
      {isDragOver && (
        <div className="absolute inset-0 bg-nkb-gold-50/90 border-2 border-dashed border-nkb-gold-500 rounded z-30 flex flex-col items-center justify-center pointer-events-none">
          <Upload className="w-12 h-12 text-nkb-gold-600 animate-bounce mb-3" />
          <h2 className="text-base font-bold text-nkb-navy-900">Drop files to upload to NKB Cloud</h2>
          <p className="text-xs text-slate-500 mt-1">Chunked multi-part streaming to physical storage devices</p>
        </div>
      )}

      {/* Active Upload Dialog */}
      {uploading && (
        <div className="fixed bottom-6 right-6 bg-white border border-slate-200 rounded p-4 shadow-xl z-50 w-84 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
            <span className="truncate pr-2">{uploadFileName}</span>
            <span className="font-mono text-nkb-gold-600">{uploadProgress}%</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-nkb-gold-500 rounded-full transition-all duration-200"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-500 flex items-center justify-between">
            <span>Streaming to physical storage &bull; {uploadSpeed}</span>
            <span className="font-mono text-slate-700">SHA-256</span>
          </div>
        </div>
      )}

      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Breadcrumbs */}
        <div className="flex items-center space-x-1.5 text-xs font-medium text-slate-600 overflow-x-auto py-1">
          <button
            onClick={() => setCurrentFolderId(null)}
            className={`hover:text-nkb-gold-600 transition flex items-center space-x-1 ${
              !currentFolderId ? 'font-bold text-nkb-navy-900 text-sm' : ''
            }`}
          >
            <span>{getViewTitle()}</span>
          </button>

          {breadcrumbs && breadcrumbs.map((crumb) => (
            <React.Fragment key={crumb.id}>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <button
                onClick={() => setCurrentFolderId(crumb.id)}
                className={`hover:text-nkb-gold-600 transition truncate max-w-[150px] ${
                  currentFolderId === crumb.id ? 'font-bold text-nkb-navy-900 text-sm' : ''
                }`}
              >
                {crumb.name}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-3">
          {currentView !== 'trash' && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center space-x-1.5 px-3 py-2 bg-nkb-gold-500 hover:bg-nkb-gold-600 text-nkb-navy-950 font-bold rounded text-xs shadow-sm transition"
              >
                <Upload className="w-4 h-4 text-nkb-navy-950" />
                <span>Upload File</span>
              </button>

              <button
                onClick={() => setNewFolderOpen(true)}
                className="flex items-center space-x-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold rounded text-xs transition"
              >
                <FolderPlus className="w-4 h-4 text-slate-600" />
                <span>New Folder</span>
              </button>
            </>
          )}

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded border border-slate-200">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded transition ${
                viewMode === 'grid' ? 'bg-white text-nkb-navy-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded transition ${
                viewMode === 'list' ? 'bg-white text-nkb-navy-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 space-y-6">
        {/* Folders Section */}
        {folders && folders.length > 0 && (
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Directories ({folders.length})
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  onDoubleClick={() => setCurrentFolderId(folder.id)}
                  className="p-3 bg-white border border-slate-200 hover:border-nkb-gold-500 rounded cursor-pointer transition group flex items-center justify-between"
                >
                  <div className="flex items-center space-x-2.5 truncate">
                    <Folder className="w-5 h-5 text-nkb-gold-500 flex-shrink-0" />
                    <span className="text-xs font-semibold text-slate-800 truncate">
                      {folder.name}
                    </span>
                  </div>

                  <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1">
                    {currentView === 'trash' ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRestore(folder, 'folder'); }}
                        title="Restore folder"
                        className="p-1 hover:bg-slate-100 rounded text-slate-600"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleTrash(folder, 'folder'); }}
                        title="Move to trash"
                        className="p-1 hover:bg-slate-100 rounded text-slate-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Files Section */}
        <div className="space-y-3">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
            <span>Files ({files.length})</span>
            <span className="text-[11px] text-slate-400 font-normal">
              Direct Physical Storage &bull; SHA-256 Verified
            </span>
          </div>

          {files.length === 0 && folders.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded p-12 text-center space-y-3">
              <HardDrive className="w-12 h-12 text-slate-300 mx-auto" />
              <div className="font-semibold text-slate-700 text-sm">This folder is empty</div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Drag and drop files here, or use the "Upload File" button above to upload files.
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            /* Grid View */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {files.map((file) => {
                const isOffline = file.status === 'UNAVAILABLE_DRIVE_OFFLINE';

                return (
                  <div
                    key={file.id}
                    className={`bg-white border rounded p-4 flex flex-col justify-between transition group relative ${
                      isOffline ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {/* Star & Offline indicator */}
                    <div className="flex items-center justify-between mb-3">
                      <button
                        onClick={() => handleStar(file, 'file')}
                        className={`p-1 rounded ${file.is_starred ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'}`}
                      >
                        <Star className="w-4 h-4 fill-current" />
                      </button>

                      {isOffline ? (
                        <span
                          title={`Physical drive ${file.volume_assigned_name} is currently disconnected. Data is strictly preserved.`}
                          className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 font-semibold px-2 py-0.5 rounded flex items-center space-x-1"
                        >
                          <AlertCircle className="w-3 h-3 text-amber-600" />
                          <span>UNAVAILABLE</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-mono">
                          {formatBytes(file.size_bytes)}
                        </span>
                      )}
                    </div>

                    {/* Thumbnail / Icon & File Name */}
                    <div
                      onClick={() => !isOffline && onOpenPreview(file)}
                      className={`cursor-pointer text-center py-4 flex flex-col items-center space-y-3 ${
                        isOffline ? 'opacity-60 cursor-not-allowed' : ''
                      }`}
                    >
                      <div className="p-3 bg-slate-50 rounded">
                        {getFileIcon(file.category, file.extension, "w-8 h-8")}
                      </div>
                      <div className="font-semibold text-xs text-slate-800 truncate w-full" title={file.name}>
                        {file.name}
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-slate-400">
                      <span className="text-[10px] font-mono truncate max-w-[80px]" title={file.volume_assigned_name}>
                        {file.volume_assigned_name || 'Storage Drive'}
                      </span>

                      <div className="flex items-center space-x-1">
                        {!isOffline && (
                          <>
                            <button
                              onClick={() => onOpenPreview(file)}
                              title="Preview"
                              className="p-1 hover:text-slate-700 hover:bg-slate-100 rounded"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDownload(file)}
                              title="Download"
                              className="p-1 hover:text-slate-700 hover:bg-slate-100 rounded"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onOpenShare(file)}
                              title="Share"
                              className="p-1 hover:text-slate-700 hover:bg-slate-100 rounded"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => onOpenFileDetails(file)}
                          title="Details"
                          className="p-1 hover:text-slate-700 hover:bg-slate-100 rounded"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* List View */
            <div className="bg-white rounded border border-slate-200 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Name</th>
                    <th className="py-2.5 px-4 font-semibold">Storage Drive</th>
                    <th className="py-2.5 px-4 font-semibold">Size</th>
                    <th className="py-2.5 px-4 font-semibold">Modified</th>
                    <th className="py-2.5 px-4 font-semibold">Status</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {files.map((file) => {
                    const isOffline = file.status === 'UNAVAILABLE_DRIVE_OFFLINE';

                    return (
                      <tr key={file.id} className="hover:bg-slate-50/60 transition group">
                        <td className="py-3 px-4">
                          <div className="flex items-center space-x-3">
                            <button
                              onClick={() => handleStar(file, 'file')}
                              className={`${file.is_starred ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'}`}
                            >
                              <Star className="w-3.5 h-3.5 fill-current" />
                            </button>
                            {getFileIcon(file.category, file.extension, "w-4 h-4 flex-shrink-0")}
                            <span
                              onClick={() => !isOffline && onOpenPreview(file)}
                              className={`font-semibold truncate max-w-md ${
                                isOffline ? 'text-slate-400 cursor-not-allowed' : 'cursor-pointer text-slate-800 hover:text-nkb-gold-600'
                              }`}
                            >
                              {file.name}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-4 font-mono text-slate-600">
                          {file.volume_assigned_name || 'NKB-STORAGE-01'}
                        </td>

                        <td className="py-3 px-4 font-mono text-slate-600">
                          {formatBytes(file.size_bytes)}
                        </td>

                        <td className="py-3 px-4 text-slate-500">
                          {formatDate(file.updated_at)}
                        </td>

                        <td className="py-3 px-4">
                          {isOffline ? (
                            <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-300 px-2 py-0.5 rounded font-bold">
                              UNAVAILABLE (DRIVE OFFLINE)
                            </span>
                          ) : (
                            <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-semibold">
                              Available
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end space-x-2 text-slate-400">
                            {!isOffline && (
                              <>
                                <button
                                  onClick={() => onOpenPreview(file)}
                                  title="Preview"
                                  className="p-1 hover:text-slate-700 hover:bg-slate-100 rounded"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDownload(file)}
                                  title="Download"
                                  className="p-1 hover:text-slate-700 hover:bg-slate-100 rounded"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => onOpenShare(file)}
                                  title="Share"
                                  className="p-1 hover:text-slate-700 hover:bg-slate-100 rounded"
                                >
                                  <Share2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => onOpenFileDetails(file)}
                              title="Details"
                              className="p-1 hover:text-slate-700 hover:bg-slate-100 rounded"
                            >
                              <Info className="w-3.5 h-3.5" />
                            </button>
                            {currentView === 'trash' ? (
                              <button
                                onClick={() => handleRestore(file, 'file')}
                                title="Restore"
                                className="p-1 hover:text-emerald-700 hover:bg-emerald-50 rounded"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleTrash(file, 'file')}
                                title="Move to Trash"
                                className="p-1 hover:text-red-700 hover:bg-red-50 rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* New Folder Modal */}
      {newFolderOpen && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded border border-slate-200 max-w-sm w-full p-6 space-y-4 shadow-xl">
            <h3 className="font-bold text-sm text-nkb-navy-900">Create New Directory</h3>
            <form onSubmit={handleCreateFolder} className="space-y-4">
              <input
                type="text"
                autoFocus
                placeholder="Folder name..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="w-full border border-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-nkb-gold-500 focus:outline-none"
                required
              />
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setNewFolderOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-nkb-navy-900 hover:bg-nkb-navy-800 text-white rounded text-xs font-semibold shadow-sm"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
