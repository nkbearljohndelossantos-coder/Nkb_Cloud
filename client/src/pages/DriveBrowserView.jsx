import React, { useState, useEffect, useCallback } from 'react';
import {
  Folder,
  File,
  HardDrive,
  Database,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  RefreshCw,
  Search,
  LayoutGrid,
  List,
  Download,
  Eye,
  Info,
  Calendar,
  Layers,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  ChevronRight,
  Usb,
  Cpu,
  FileText,
  Image,
  Video,
  Music,
  Archive,
  FileCode,
  FileSpreadsheet,
  Lock,
  X,
  Share2
} from 'lucide-react';
import api from '../api/client';
import { formatBytes, formatDate } from '../utils/formatters';
import DriveFilePreviewModal from '../components/DriveFilePreviewModal';
import ShareModal from '../components/ShareModal';

export default function DriveBrowserView({ volumes = [], onRefreshVolumes, initialVolumeId = null }) {
  // Volume selection
  const [selectedVolumeId, setSelectedVolumeId] = useState(initialVolumeId);

  // Share to My Drive state
  const [shareModalFolder, setShareModalFolder] = useState(null);
  const [linkingFolder, setLinkingFolder] = useState(false);

  // Directory browsing state
  const [currentPath, setCurrentPath] = useState('');
  const [breadcrumbs, setBreadcrumbs] = useState([{ name: 'Root', path: '' }]);
  const [items, setItems] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalFolders, setTotalFolders] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [totalPages, setTotalPages] = useState(1);

  // Search & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'

  // Navigation history
  const [history, setHistory] = useState(['']);
  const [historyIndex, setHistoryIndex] = useState(0);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);

  // Sync initialVolumeId when changed from parent
  useEffect(() => {
    if (initialVolumeId) {
      setSelectedVolumeId(initialVolumeId);
      setCurrentPath('');
      setHistory(['']);
      setHistoryIndex(0);
    }
  }, [initialVolumeId]);

  // Visible volumes: exclude hidden, system, recovery, or reserved partitions
  const visibleVolumes = (volumes || []).filter(vol => {
    const isHidden = !vol.currentDriveLetter && (!vol.mountPath || vol.mountPath.startsWith('Partition-') || vol.mountPath.startsWith('\\\\?\\Volume'));
    const isSystemFs = ['SYSTEM', 'RESERVED'].includes(vol.filesystem?.toUpperCase());
    return !isHidden && !isSystemFs;
  });

  // Auto-select first online volume with a drive letter
  useEffect(() => {
    if (!selectedVolumeId && visibleVolumes && visibleVolumes.length > 0) {
      const preferred = visibleVolumes.find(v => v.status === 'ONLINE' && v.currentDriveLetter) || visibleVolumes[0];
      if (preferred) {
        setSelectedVolumeId(preferred.id);
      }
    }
  }, [visibleVolumes, selectedVolumeId]);

  // Fetch directory contents from Storage Agent
  const fetchDirectory = useCallback(async (volumeId, pathStr = '', pageNum = 1, searchStr = '', sortField = sortBy, sortDir = sortOrder) => {
    if (!volumeId) return;
    setLoading(true);
    setError(null);
    setSelectedItem(null);

    try {
      const res = await api.get(`/storage/volumes/${volumeId}/browse`, {
        params: {
          path: pathStr,
          page: pageNum,
          limit,
          sort: sortField,
          order: sortDir,
          search: searchStr
        }
      });

      const data = res.data;
      if (data.success) {
        const cleanItems = (data.items || []).filter(item => {
          if (!item || !item.name) return false;
          const n = item.name.toLowerCase();
          return !n.includes('desktop.ini') && !n.includes('thumbs.db') && !n.includes('.ds_store') && !item.name.startsWith('.') && !item.name.startsWith('$');
        });
        setItems(cleanItems);
        setCurrentPath(data.currentPath || '');
        setBreadcrumbs(data.breadcrumbs || [{ name: 'Root', path: '' }]);
        setTotalCount(data.totalCount || 0);
        setTotalFolders(data.totalFolders || 0);
        setTotalFiles(data.totalFiles || 0);
        setPage(data.page || 1);
        setTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      console.error('[DriveBrowser] Browse directory error:', err);
      setError(err.response?.data?.error || err.message || 'Failed to browse directory contents');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [limit, sortBy, sortOrder]);

  // Navigate to path and update history
  const navigateTo = (newPath) => {
    if (newPath === currentPath) return;
    const cleanPath = newPath.replace(/^\/+|\/+$/g, '');
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(cleanPath);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setSearchQuery('');
    setPage(1);
    fetchDirectory(selectedVolumeId, cleanPath, 1, '');
  };

  // History Back
  const handleBack = () => {
    if (historyIndex > 0) {
      const prevPath = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      setSearchQuery('');
      setPage(1);
      fetchDirectory(selectedVolumeId, prevPath, 1, '');
    }
  };

  // History Forward
  const handleForward = () => {
    if (historyIndex < history.length - 1) {
      const nextPath = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      setSearchQuery('');
      setPage(1);
      fetchDirectory(selectedVolumeId, nextPath, 1, '');
    }
  };

  // Up one folder level
  const handleUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split('/');
    parts.pop();
    const parent = parts.join('/');
    navigateTo(parent);
  };

  // Reload current folder
  const handleRefresh = () => {
    fetchDirectory(selectedVolumeId, currentPath, page, searchQuery, sortBy, sortOrder);
  };

  // Triggered on volume change
  useEffect(() => {
    if (selectedVolumeId) {
      setCurrentPath('');
      setHistory(['']);
      setHistoryIndex(0);
      setSearchQuery('');
      setPage(1);
      fetchDirectory(selectedVolumeId, '', 1, '');
    }
  }, [selectedVolumeId, fetchDirectory]);

  // Search input handler (debounced)
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    setPage(1);
    fetchDirectory(selectedVolumeId, currentPath, 1, val, sortBy, sortOrder);
  };

  // Sort handler
  const handleSortChange = (field) => {
    let newOrder = 'asc';
    if (sortBy === field) {
      newOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    }
    setSortBy(field);
    setSortOrder(newOrder);
    fetchDirectory(selectedVolumeId, currentPath, page, searchQuery, field, newOrder);
  };

  // Active selected volume object
  const activeVolume = volumes.find(v => v.id === selectedVolumeId) || null;

  // Render representative icon based on file category
  const renderItemIcon = (item) => {
    if (item.isDirectory) {
      return <Folder className="w-5 h-5 text-amber-500 fill-amber-500/20" />;
    }
    const type = item.fileType || '';
    if (type === 'Image') return <Image className="w-5 h-5 text-emerald-600" />;
    if (type === 'PDF Document') return <FileText className="w-5 h-5 text-red-600" />;
    if (type === 'Spreadsheet') return <FileSpreadsheet className="w-5 h-5 text-emerald-700" />;
    if (type === 'Source Code') return <FileCode className="w-5 h-5 text-amber-700" />;
    if (type === 'Archive') return <Archive className="w-5 h-5 text-purple-600" />;
    if (type === 'Video') return <Video className="w-5 h-5 text-indigo-600" />;
    if (type === 'Audio') return <Music className="w-5 h-5 text-pink-600" />;
    return <File className="w-5 h-5 text-slate-500" />;
  };

  const handleShareFolderToMyDrive = async (item) => {
    if (!selectedVolumeId || !item.isDirectory) return;
    setLinkingFolder(true);
    try {
      const res = await api.post(`/storage/volumes/${selectedVolumeId}/link-folder`, {
        folderName: item.name,
        relativePath: item.relativePath
      });
      const folder = res.data.folder;
      setShareModalFolder(folder);
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setLinkingFolder(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden select-none bg-slate-50">
      {/* LEFT SIDEBAR: Registered Physical Drives & Volumes */}
      <div className="w-72 bg-white border-r border-slate-200 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <HardDrive className="w-4 h-4 text-nkb-gold-500" />
            <span className="font-bold text-xs text-nkb-navy-900 uppercase tracking-wider">
              Connected Storage
            </span>
          </div>
          <button
            onClick={() => onRefreshVolumes && onRefreshVolumes()}
            className="p-1 text-slate-400 hover:text-slate-700 rounded transition"
            title="Refresh connected drive list"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {visibleVolumes.map((vol) => {
            const isSelected = vol.id === selectedVolumeId;
            const isOnline = vol.status === 'ONLINE';
            const vTotal = BigInt(vol.totalBytes || '0');
            const vUsed = BigInt(vol.usedBytes || '0');
            const vPct = vTotal > 0n ? Math.round(Number((vUsed * 100n) / vTotal)) : 0;
            const hasLetter = vol.currentDriveLetter && vol.currentDriveLetter.trim() !== '';

            return (
              <button
                key={vol.id}
                onClick={() => setSelectedVolumeId(vol.id)}
                className={`w-full text-left p-3 rounded border transition-all ${
                  isSelected
                    ? 'bg-nkb-navy-900 text-white border-nkb-navy-900 shadow-sm'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {hasLetter ? (
                      <span className={`px-2 py-0.5 rounded font-mono font-bold text-xs ${
                        isSelected ? 'bg-nkb-gold-500 text-nkb-navy-950' : 'bg-nkb-navy-900 text-white'
                      }`}>
                        {vol.currentDriveLetter}
                      </span>
                    ) : (
                      <Database className={`w-4 h-4 ${isSelected ? 'text-nkb-gold-400' : 'text-slate-400'}`} />
                    )}
                    <span className="font-bold text-xs truncate max-w-[120px]">
                      {vol.assignedName || (hasLetter ? `Drive ${vol.currentDriveLetter}` : 'Volume')}
                    </span>
                  </div>

                  <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`} />
                </div>

                <div className="mt-2 space-y-1">
                  <div className={`flex justify-between text-[10px] ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                    <span>{vol.filesystem || 'NTFS'}</span>
                    <span className="font-mono">{formatBytes(vol.freeBytes)} free</span>
                  </div>

                  <div className={`w-full h-1 rounded-full overflow-hidden ${isSelected ? 'bg-nkb-navy-800' : 'bg-slate-100'}`}>
                    <div
                      className={`h-full ${vPct > 90 ? 'bg-red-500' : (isSelected ? 'bg-nkb-gold-400' : 'bg-nkb-gold-500')}`}
                      style={{ width: `${vPct}%` }}
                    />
                  </div>
                </div>

                {vol.device && (
                  <div className={`mt-2 text-[10px] font-mono truncate ${isSelected ? 'text-slate-300' : 'text-slate-400'}`}>
                    {vol.device.model} ({vol.device.busType})
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Read-Only Status Notice */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-[10px] text-slate-500 flex items-center space-x-2">
          <Lock className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
          <span>Strict Read-Only Mode &bull; Zero Disk Writes</span>
        </div>
      </div>

      {/* MAIN BROWSER AREA */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Top Action Bar */}
        <div className="p-3 border-b border-slate-200 bg-white flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Navigation Buttons & Breadcrumbs */}
          <div className="flex items-center space-x-2 flex-1 min-w-0">
            <div className="flex items-center space-x-1 border border-slate-200 rounded p-0.5 bg-slate-50">
              <button
                onClick={handleBack}
                disabled={historyIndex <= 0}
                className="p-1 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent"
                title="Back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleForward}
                disabled={historyIndex >= history.length - 1}
                className="p-1 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent"
                title="Forward"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={handleUp}
                disabled={!currentPath}
                className="p-1 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent"
                title="Up to Parent Directory"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
              <button
                onClick={handleRefresh}
                className="p-1 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-200"
                title="Refresh Directory"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Breadcrumb Trail */}
            <div className="flex items-center space-x-1 overflow-x-auto text-xs py-1 px-2 bg-slate-50 rounded border border-slate-200 flex-1 min-w-0">
              {activeVolume && (
                <span className="font-bold text-nkb-navy-900 flex items-center space-x-1">
                  <span>{activeVolume.currentDriveLetter || activeVolume.assignedName}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </span>
              )}

              {breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
                return (
                  <React.Fragment key={crumb.path || idx}>
                    <button
                      onClick={() => navigateTo(crumb.path)}
                      className={`truncate max-w-[140px] px-1 py-0.5 rounded transition ${
                        isLast
                          ? 'font-bold text-slate-900 bg-white shadow-2xs'
                          : 'text-slate-600 hover:text-nkb-navy-900 hover:bg-slate-200'
                      }`}
                    >
                      {crumb.name}
                    </button>
                    {!isLast && <ChevronRight className="w-3 h-3 text-slate-400 flex-shrink-0" />}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Search, Sort & View Mode */}
          <div className="flex items-center space-x-2 flex-shrink-0">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search this folder..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="pl-8 pr-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-nkb-gold-500 w-44 md:w-56"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    fetchDirectory(selectedVolumeId, currentPath, 1, '');
                  }}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center border border-slate-300 rounded p-0.5 bg-slate-50">
              <button
                onClick={() => setViewMode('list')}
                className={`p-1 rounded ${viewMode === 'list' ? 'bg-white shadow-2xs text-nkb-navy-900' : 'text-slate-500'}`}
                title="List View"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1 rounded ${viewMode === 'grid' ? 'bg-white shadow-2xs text-nkb-navy-900' : 'text-slate-500'}`}
                title="Grid View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Browser Content Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Main List / Grid */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Error Message */}
            {error && (
              <div className="m-4 p-4 bg-red-50 border border-red-200 text-red-800 rounded text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Loading State */}
            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center text-xs text-slate-500 space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin text-nkb-navy-900" />
                <span>Reading actual directory contents from storage agent...</span>
              </div>
            ) : items.length === 0 && !error ? (
              /* Empty Directory State */
              <div className="flex-1 flex flex-col items-center justify-center text-xs text-slate-400 space-y-2 p-8">
                <Folder className="w-12 h-12 text-slate-300 stroke-1" />
                <div className="font-semibold text-slate-600">This directory is empty</div>
                <p className="text-[11px] text-slate-400">No matching files or folders found at this location.</p>
              </div>
            ) : viewMode === 'list' ? (
              /* LIST VIEW (ERP Table) */
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50/80 sticky top-0 border-b border-slate-200 z-10 text-[11px] text-slate-500 font-semibold uppercase tracking-wider">
                    <tr>
                      <th
                        onClick={() => handleSortChange('name')}
                        className="py-2.5 px-4 cursor-pointer hover:bg-slate-100"
                      >
                        Name {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        onClick={() => handleSortChange('type')}
                        className="py-2.5 px-4 cursor-pointer hover:bg-slate-100 w-32"
                      >
                        Type {sortBy === 'type' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        onClick={() => handleSortChange('size')}
                        className="py-2.5 px-4 cursor-pointer hover:bg-slate-100 w-28 text-right"
                      >
                        Size {sortBy === 'size' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        onClick={() => handleSortChange('modifiedAt')}
                        className="py-2.5 px-4 cursor-pointer hover:bg-slate-100 w-44"
                      >
                        Date Modified {sortBy === 'modifiedAt' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="py-2.5 px-4 w-44 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item) => {
                      const isSelected = selectedItem?.relativePath === item.relativePath;

                      return (
                        <tr
                          key={item.relativePath}
                          onClick={() => setSelectedItem(item)}
                          onDoubleClick={() => {
                            if (item.isDirectory) {
                              navigateTo(item.relativePath);
                            } else {
                              setPreviewFile(item);
                            }
                          }}
                          className={`hover:bg-slate-50/80 cursor-pointer transition ${
                            isSelected ? 'bg-nkb-gold-50/70 border-l-2 border-nkb-gold-500' : ''
                          }`}
                        >
                          <td className="py-2.5 px-4 flex items-center space-x-3">
                            {item.isDirectory ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigateTo(item.relativePath);
                                }}
                                className="flex items-center space-x-3 text-left group hover:text-nkb-gold-600 transition"
                                title={`Open folder ${item.name}`}
                              >
                                {renderItemIcon(item)}
                                <span className="font-semibold text-nkb-navy-900 group-hover:text-nkb-gold-600 underline-offset-2 hover:underline truncate max-w-md">
                                  {item.name}
                                </span>
                              </button>
                            ) : (
                              <div className="flex items-center space-x-3">
                                {renderItemIcon(item)}
                                <span className="font-medium text-slate-800 truncate max-w-md">
                                  {item.name}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-slate-500">
                            {item.fileType}
                          </td>
                          <td className="py-2.5 px-4 text-slate-600 font-mono text-right">
                            {item.isDirectory ? '—' : formatBytes(item.size)}
                          </td>
                          <td className="py-2.5 px-4 text-slate-500 font-mono text-[11px]">
                            {item.modifiedAt ? formatDate(item.modifiedAt) : '—'}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            {item.isDirectory ? (
                              <div className="inline-flex items-center space-x-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigateTo(item.relativePath);
                                  }}
                                  className="inline-flex items-center space-x-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded text-[11px] shadow-sm transition"
                                  title="Open subfolder"
                                >
                                  <span>Open</span>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleShareFolderToMyDrive(item);
                                  }}
                                  disabled={linkingFolder}
                                  className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-nkb-gold-50 hover:bg-nkb-gold-100 text-nkb-navy-950 border border-nkb-gold-400 font-bold rounded text-[11px] shadow-sm transition disabled:opacity-50"
                                  title="Share folder to My Drive & Departments"
                                >
                                  <Share2 className="w-3 h-3 text-nkb-gold-600" />
                                  <span>Share to My Drive</span>
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end space-x-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPreviewFile(item);
                                  }}
                                  className="p-1 text-slate-400 hover:text-blue-600 rounded transition"
                                  title="Preview File"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <a
                                  href={`/api/storage/volumes/${selectedVolumeId}/download?path=${encodeURIComponent(item.relativePath)}`}
                                  download={item.name}
                                  onClick={(e) => e.stopPropagation()}
                                  className="p-1 text-slate-400 hover:text-nkb-navy-900 rounded transition"
                                  title="Download File"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </a>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              /* GRID VIEW */
              <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {items.map((item) => {
                  const isSelected = selectedItem?.relativePath === item.relativePath;

                  return (
                    <div
                      key={item.relativePath}
                      onClick={() => setSelectedItem(item)}
                      onDoubleClick={() => {
                        if (item.isDirectory) {
                          navigateTo(item.relativePath);
                        } else {
                          setPreviewFile(item);
                        }
                      }}
                      className={`p-3 rounded border text-center cursor-pointer transition-all flex flex-col items-center justify-between space-y-2 ${
                        isSelected
                          ? 'bg-nkb-gold-50 border-nkb-gold-500 shadow-sm'
                          : 'bg-white hover:bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div
                        onClick={(e) => {
                          if (item.isDirectory) {
                            e.stopPropagation();
                            navigateTo(item.relativePath);
                          }
                        }}
                        className={`w-12 h-12 rounded bg-slate-100/60 flex items-center justify-center ${
                          item.isDirectory ? 'hover:bg-nkb-gold-100 hover:scale-105 transition-all' : ''
                        }`}
                        title={item.isDirectory ? `Open ${item.name}` : undefined}
                      >
                        {renderItemIcon(item)}
                      </div>
                      <div className="w-full">
                        <div
                          onClick={(e) => {
                            if (item.isDirectory) {
                              e.stopPropagation();
                              navigateTo(item.relativePath);
                            }
                          }}
                          className={`text-xs font-semibold truncate ${
                            item.isDirectory
                              ? 'text-nkb-navy-900 hover:text-nkb-gold-600 hover:underline cursor-pointer'
                              : 'text-slate-800'
                          }`}
                          title={item.name}
                        >
                          {item.name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {item.isDirectory ? 'Folder' : formatBytes(item.size)}
                        </div>
                        {item.isDirectory && (
                          <div className="mt-2 space-y-1 w-full">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigateTo(item.relativePath);
                              }}
                              className="w-full py-1 px-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded text-[10px] flex items-center justify-center transition"
                            >
                              <span>Open Folder</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleShareFolderToMyDrive(item);
                              }}
                              disabled={linkingFolder}
                              className="w-full py-1 px-2 bg-nkb-gold-50 hover:bg-nkb-gold-100 text-nkb-navy-950 border border-nkb-gold-400 font-bold rounded text-[10px] flex items-center justify-center space-x-1 transition disabled:opacity-50"
                            >
                              <Share2 className="w-3 h-3 text-nkb-gold-600" />
                              <span>Share to My Drive</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination & Status Footer */}
            <div className="p-3 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 gap-2">
              <div>
                Showing <strong className="text-slate-800 font-mono">{items.length}</strong> of{' '}
                <strong className="text-slate-800 font-mono">{totalCount}</strong> items ({totalFolders} folders, {totalFiles} files)
              </div>

              {totalPages > 1 && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      const prev = Math.max(1, page - 1);
                      setPage(prev);
                      fetchDirectory(selectedVolumeId, currentPath, prev, searchQuery, sortBy, sortOrder);
                    }}
                    disabled={page <= 1}
                    className="px-2.5 py-1 border border-slate-300 rounded bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-semibold"
                  >
                    Previous
                  </button>

                  <span className="font-mono text-slate-600">
                    Page {page} of {totalPages}
                  </span>

                  <button
                    onClick={() => {
                      const next = Math.min(totalPages, page + 1);
                      setPage(next);
                      fetchDirectory(selectedVolumeId, currentPath, next, searchQuery, sortBy, sortOrder);
                    }}
                    disabled={page >= totalPages}
                    className="px-2.5 py-1 border border-slate-300 rounded bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-semibold"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT SIDEBAR: File Details Drawer */}
          {selectedItem && (
            <div className="w-80 bg-slate-50 border-l border-slate-200 flex flex-col flex-shrink-0 p-4 space-y-4 overflow-y-auto animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <span className="text-xs font-bold text-nkb-navy-900 uppercase tracking-wider">
                  Item Details
                </span>
                <button
                  onClick={() => setSelectedItem(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Icon & Name */}
              <div className="text-center space-y-2 py-2">
                <div className="w-16 h-16 mx-auto rounded-lg bg-white border border-slate-200 flex items-center justify-center shadow-2xs">
                  {renderItemIcon(selectedItem)}
                </div>
                <div className="font-bold text-xs text-slate-800 break-words px-2">
                  {selectedItem.name}
                </div>
                <div className="text-[11px] text-slate-500">
                  {selectedItem.fileType}
                </div>
              </div>

              {/* Action Buttons */}
              {!selectedItem.isDirectory && (
                <div className="flex items-center space-x-2 pt-2">
                  <button
                    onClick={() => setPreviewFile(selectedItem)}
                    className="flex-1 py-1.5 px-3 bg-white hover:bg-slate-100 border border-slate-300 rounded text-xs font-semibold text-slate-700 shadow-2xs transition flex items-center justify-center space-x-1.5"
                  >
                    <Eye className="w-3.5 h-3.5 text-blue-600" />
                    <span>Preview</span>
                  </button>

                  <a
                    href={`/api/storage/volumes/${selectedVolumeId}/download?path=${encodeURIComponent(selectedItem.relativePath)}`}
                    download={selectedItem.name}
                    className="flex-1 py-1.5 px-3 bg-nkb-navy-900 hover:bg-nkb-navy-800 text-white rounded text-xs font-semibold shadow-2xs transition flex items-center justify-center space-x-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-nkb-gold-400" />
                    <span>Download</span>
                  </a>
                </div>
              )}

              {/* Details List */}
              <div className="space-y-3 pt-2 text-xs border-t border-slate-200">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Relative Path</span>
                  <span className="font-mono text-slate-700 text-[11px] break-all select-all">
                    {selectedItem.relativePath || '/'}
                  </span>
                </div>

                {!selectedItem.isDirectory && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">File Size</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {formatBytes(selectedItem.size)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono block">
                      ({selectedItem.size.toLocaleString()} bytes)
                    </span>
                  </div>
                )}

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Modified</span>
                  <span className="text-slate-700 text-[11px]">
                    {selectedItem.modifiedAt ? formatDate(selectedItem.modifiedAt) : '—'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Created</span>
                  <span className="text-slate-700 text-[11px]">
                    {selectedItem.createdAt ? formatDate(selectedItem.createdAt) : '—'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Access Attributes</span>
                  <div className="flex items-center space-x-1.5 mt-1">
                    <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono">
                      {selectedItem.attributes?.isReadOnly ? 'Read-Only' : 'Read/Write (Restricted)'}
                    </span>
                    {selectedItem.attributes?.isHidden && (
                      <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-mono">
                        Hidden
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Preview Component */}
      {previewFile && (
        <DriveFilePreviewModal
          volumeId={selectedVolumeId}
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}

      {/* Share to My Drive & Departments Modal */}
      {shareModalFolder && (
        <ShareModal
          folder={shareModalFolder}
          onClose={() => setShareModalFolder(null)}
          onShareUpdated={() => {
            alert(`Folder "${shareModalFolder.name}" has been shared and is now live in My Drive!`);
          }}
        />
      )}
    </div>
  );
}
