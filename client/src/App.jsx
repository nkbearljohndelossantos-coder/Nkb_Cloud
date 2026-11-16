import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import DashboardView from './pages/DashboardView';
import FileManagerView from './pages/FileManagerView';
import StorageManagementView from './pages/StorageManagementView';
import DriveBrowserView from './pages/DriveBrowserView';
import UsersView from './pages/UsersView';
import AuditLogsView from './pages/AuditLogsView';
import DeviceManagementView from './pages/DeviceManagementView';
import LoginView from './pages/LoginView';
import FilePreviewModal from './components/FilePreviewModal';
import ShareModal from './components/ShareModal';
import FileDetailsDrawer from './components/FileDetailsDrawer';
import AgentOnboardingModal from './components/AgentOnboardingModal';
import DownloadAppModal from './components/DownloadAppModal';
import api from './api/client';

export default function App() {
  const { user, isAuthenticated, loading } = useAuth();

  // Navigation states
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard', 'drive', 'shared-with-me', 'shared-drives', 'recent', 'starred', 'trash', 'category', 'storage', 'users', 'audit'
  const [currentCategory, setCurrentCategory] = useState(null);
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [selectedBrowserVolumeId, setSelectedBrowserVolumeId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Data states
  const [storageOverview, setStorageOverview] = useState(null);
  const [volumes, setVolumes] = useState([]);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);
  const [agentConnected, setAgentConnected] = useState(false);

  // Modal / Drawer states
  const [previewFile, setPreviewFile] = useState(null);
  const [shareItem, setShareItem] = useState(null);
  const [selectedFileDetails, setSelectedFileDetails] = useState(null);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState(null);

  // Check employee device agent status & trigger onboarding if uninstalled
  const checkDeviceStatus = async () => {
    try {
      const res = await api.get('/devices/my-device');
      setDeviceStatus(res.data);
      if (res.data.state === 'AGENT_NOT_INSTALLED') {
        const dismissed = localStorage.getItem('nkb_onboarding_dismissed');
        if (!dismissed) {
          setShowOnboardingModal(true);
        }
      }
    } catch (err) {
      console.warn('[APP] Could not fetch device status:', err.message);
    }
  };

  // Fetch storage overview & volumes
  const fetchStorageData = async () => {
    try {
      const [ovRes, volRes, actRes] = await Promise.all([
        api.get('/storage/overview'),
        api.get('/storage/volumes'),
        api.get('/admin/audit-logs').catch(() => ({ data: { logs: [] } }))
      ]);
      setStorageOverview(ovRes.data.overview);
      setVolumes(volRes.data.volumes);
      setRecentActivities(actRes.data.logs || []);
      setAgentConnected(ovRes.data.overview.agentsOnline > 0);
      await checkDeviceStatus();
    } catch (err) {
      console.error('[APP] Error loading storage data:', err);
    }
  };

  // Fetch file explorer items
  const fetchExplorerItems = async () => {
    try {
      const params = {};
      if (currentFolderId) params.folderId = currentFolderId;
      if (searchQuery) params.search = searchQuery;

      if (currentView === 'trash') params.view = 'trash';
      else if (currentView === 'starred') params.starred = 'true';
      else if (currentView === 'recent') params.recent = 'true';
      else if (currentView === 'shared-drives') params.view = 'shared-drives';
      else if (currentView === 'shared-with-me') params.view = 'shared-with-me';
      else if (currentView === 'category') params.category = currentCategory;

      const res = await api.get('/files', { params });
      const rawFiles = res.data.files || [];
      const cleanFiles = rawFiles.filter(f => {
        if (!f || !f.name) return false;
        const n = f.name.toLowerCase();
        return !n.includes('desktop.ini') && !n.includes('thumbs.db') && !n.includes('.ds_store') && !f.name.startsWith('.');
      });
      setFolders(res.data.folders || []);
      setFiles(cleanFiles);
      setBreadcrumbs(res.data.breadcrumbs || []);
    } catch (err) {
      console.error('[APP] Error loading explorer items:', err);
    }
  };

  // Initial & periodic refresh
  useEffect(() => {
    if (isAuthenticated) {
      fetchStorageData();
      const interval = setInterval(fetchStorageData, 15000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchExplorerItems();
    }
  }, [isAuthenticated, currentView, currentCategory, currentFolderId, searchQuery]);

  const handleRefresh = async () => {
    await Promise.all([fetchStorageData(), fetchExplorerItems()]);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white text-xs font-mono">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-nkb-gold-500 animate-ping" />
          <span>INITIALIZING NKB CLOUD...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginView />;
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans antialiased overflow-hidden select-none">
      {/* Responsive Sidebar with Mobile Drawer support */}
      <Sidebar
        currentView={currentView}
        setCurrentView={(view) => {
          setCurrentView(view);
          setCurrentFolderId(null);
          setMobileMenuOpen(false);
        }}
        currentCategory={currentCategory}
        setCurrentCategory={setCurrentCategory}
        storageOverview={storageOverview}
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        onOpenDownloadModal={() => setShowDownloadModal(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Topbar */}
        <Topbar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onRefresh={handleRefresh}
          agentConnected={agentConnected}
          storageOverview={storageOverview}
          onToggleMobileMenu={() => setMobileMenuOpen(prev => !prev)}
          onOpenDownloadModal={() => setShowDownloadModal(true)}
        />

        {/* Dynamic Main Workspace View */}
        <main className="flex-1 overflow-y-auto bg-slate-50">
          {currentView === 'dashboard' && (
            <DashboardView
              overview={storageOverview}
              volumes={volumes}
              recentActivities={recentActivities}
              onNavigateToStorage={() => setCurrentView('storage')}
              onNavigateToDrive={() => setCurrentView('drive')}
            />
          )}

          {['drive', 'shared-with-me', 'shared-drives', 'recent', 'starred', 'trash', 'category'].includes(currentView) && (
            <FileManagerView
              currentView={currentView}
              currentCategory={currentCategory}
              folders={folders}
              files={files}
              breadcrumbs={breadcrumbs}
              currentFolderId={currentFolderId}
              setCurrentFolderId={setCurrentFolderId}
              onRefresh={handleRefresh}
              onOpenFileDetails={(file) => setSelectedFileDetails(file)}
              onOpenPreview={(file) => setPreviewFile(file)}
              onOpenShare={(item) => setShareItem(item)}
              agentConnected={agentConnected}
            />
          )}

          {currentView === 'storage' && (
            <StorageManagementView
              volumes={volumes}
              onRefresh={handleRefresh}
              agentConnected={agentConnected}
              storageOverview={storageOverview}
              onNavigateToDriveBrowser={(volId) => {
                setSelectedBrowserVolumeId(volId);
                setCurrentView('drive-browser');
              }}
            />
          )}

          {currentView === 'drive-browser' && (
            <DriveBrowserView
              volumes={volumes}
              onRefreshVolumes={handleRefresh}
              initialVolumeId={selectedBrowserVolumeId}
            />
          )}

          {currentView === 'users' && <UsersView />}

          {currentView === 'devices' && <DeviceManagementView />}

          {currentView === 'audit' && <AuditLogsView />}
        </main>
      </div>

      {/* Modals & Slide-out Drawers */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}

      {shareItem && (
        <ShareModal
          file={shareItem}
          onClose={() => setShareItem(null)}
        />
      )}

      {selectedFileDetails && (
        <FileDetailsDrawer
          file={selectedFileDetails}
          onClose={() => setSelectedFileDetails(null)}
        />
      )}

      {/* Agent Onboarding Workflow Modal */}
      <AgentOnboardingModal
        isOpen={showOnboardingModal}
        onClose={() => setShowOnboardingModal(false)}
        deviceStatus={deviceStatus}
        onEnrollmentComplete={async () => {
          await checkDeviceStatus();
          await fetchStorageData();
        }}
      />

      {/* Desktop App Download Modal */}
      <DownloadAppModal
        isOpen={showDownloadModal}
        onClose={() => setShowDownloadModal(false)}
      />
    </div>
  );
}
