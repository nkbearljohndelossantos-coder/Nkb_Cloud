import express from 'express';
import multer from 'multer';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import * as authCtrl from '../controllers/authController.js';
import * as fileCtrl from '../controllers/fileController.js';
import * as storageCtrl from '../controllers/storageController.js';
import * as shareCtrl from '../controllers/shareController.js';
import * as adminCtrl from '../controllers/adminController.js';
import * as deviceCtrl from '../controllers/deviceController.js';

const router = express.Router();
const upload = multer({
  limits: { fileSize: 50 * 1024 * 1024 * 1024 }, // 50 GB
  storage: multer.memoryStorage()
});

// Authentication Routes
router.post('/auth/login', authCtrl.login);
router.get('/auth/me', authenticateToken, authCtrl.getCurrentUser);
router.put('/auth/change-password', authenticateToken, authCtrl.changePassword);
router.get('/auth/invite/:token', authCtrl.getInviteDetails);
router.post('/auth/register', authCtrl.registerWithInvite);

// File Explorer & Storage Operations
router.get('/files', authenticateToken, fileCtrl.getExplorerItems);
router.post('/files/folder', authenticateToken, fileCtrl.createFolder);

// Resumable Chunked Uploads
router.post('/files/upload/initiate', authenticateToken, fileCtrl.initiateUploadSession);
router.get('/files/upload/:sessionId/status', authenticateToken, fileCtrl.getUploadSessionStatus);
router.post('/files/upload/:sessionId/chunk', authenticateToken, upload.single('chunk'), fileCtrl.uploadChunk);
router.post('/files/upload/:sessionId/finalize', authenticateToken, fileCtrl.finalizeUpload);

// Direct Upload
router.post('/files/upload/direct', authenticateToken, upload.single('file'), fileCtrl.directUpload);

// File Download & Preview (Offline check enforced)
router.get('/files/:id/download', authenticateToken, fileCtrl.downloadFile);
router.get('/files/:id/preview', authenticateToken, (req, res, next) => {
  req.query.inline = 'true';
  fileCtrl.downloadFile(req, res, next);
});

// Item Management
router.put('/files/:id/rename', authenticateToken, fileCtrl.renameItem);
router.put('/files/:id/move', authenticateToken, fileCtrl.moveItem);
router.put('/files/:id/star', authenticateToken, fileCtrl.toggleStar);
router.post('/files/:id/trash', authenticateToken, fileCtrl.trashItem);
router.post('/files/:id/restore', authenticateToken, fileCtrl.restoreItem);
router.delete('/files/:id/permanent', authenticateToken, requireRole('SUPER ADMIN'), fileCtrl.deletePermanently);

// Storage Management & Placement Policies
router.get('/storage/overview', authenticateToken, storageCtrl.getStorageOverview);
router.get('/storage/volumes', authenticateToken, storageCtrl.getStorageVolumes);
router.get('/storage/hardware', authenticateToken, storageCtrl.getHardwareInventory);
router.get('/storage/volumes/:volumeId/browse', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), storageCtrl.browseDriveDirectory);
router.get('/storage/volumes/:volumeId/file-info', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), storageCtrl.getDriveFileInfo);
router.get('/storage/volumes/:volumeId/preview', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), storageCtrl.previewDriveFile);
router.get('/storage/volumes/:volumeId/download', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), storageCtrl.downloadDriveFile);
router.put('/storage/volumes/:id', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), storageCtrl.updateVolumeConfig);
router.post('/storage/volumes/:id/connect', authenticateToken, requireRole('SUPER ADMIN'), storageCtrl.connectVolume);
router.post('/storage/volumes/:id/disconnect', authenticateToken, requireRole('SUPER ADMIN'), storageCtrl.disconnectVolume);
router.post('/storage/volumes/:volumeId/link-folder', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), storageCtrl.linkVolumeFolderToCloud);
router.post('/storage/policies', authenticateToken, requireRole('SUPER ADMIN'), storageCtrl.setPlacementPolicy);
router.post('/storage/scan', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), storageCtrl.triggerDriveScan);

// Phase 5.2 Manual Storage Administration & Controlled Removal
router.post('/storage/locations/validate', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), storageCtrl.validateStoragePath);
router.post('/storage/locations/add', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), storageCtrl.addStorageLocation);
router.post('/storage/locations/:id/activate', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), storageCtrl.activateStorageLocation);
router.post('/storage/locations/:id/deactivate', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), storageCtrl.deactivateStorageLocation);
router.get('/storage/locations/:id/removal-impact', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), storageCtrl.getRemovalImpact);
router.post('/storage/locations/:id/remove', authenticateToken, requireRole('SUPER ADMIN'), storageCtrl.removeStorageLocation);
router.get('/storage/department-mapping', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), storageCtrl.getDepartmentStorageMapping);
router.put('/storage/department-mapping/:folderId', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), storageCtrl.updateDepartmentStorageMapping);

// Safe Drive Replacement & Migration Lifecycle
router.post('/storage/migrations/initiate', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), storageCtrl.initiateDriveMigration);
router.post('/storage/migrations/:id/approve', authenticateToken, requireRole('SUPER ADMIN'), storageCtrl.approveAndExecuteMigration);
router.post('/storage/migrations/:id/retire', authenticateToken, requireRole('SUPER ADMIN'), storageCtrl.retireSourceDrive);
router.post('/storage/volumes/:id/verify', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), storageCtrl.verifyVolumeIntegrity);

// Sharing Routes
router.post('/shares', authenticateToken, shareCtrl.createShare);
router.get('/shares/with-me', authenticateToken, shareCtrl.getSharedWithMe);
router.get('/shares/item', authenticateToken, shareCtrl.getItemShares);
router.delete('/shares/:id', authenticateToken, shareCtrl.revokeShare);
router.get('/shares/public/:token', shareCtrl.getPublicShareInfo);

// Department & User directory for Sharing
router.get('/departments', authenticateToken, adminCtrl.getDepartments);
router.get('/users/shareable', authenticateToken, adminCtrl.getShareableUsers);

// Administration & Audit Routes
router.get('/admin/users', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), adminCtrl.getUsers);
router.post('/admin/users', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), adminCtrl.createUser);
router.put('/admin/users/:id', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), adminCtrl.updateUser);
router.get('/admin/invites', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), adminCtrl.getInvites);
router.post('/admin/invites', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), adminCtrl.createInvite);
router.put('/admin/invites/:id/revoke', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), adminCtrl.revokeInvite);
router.delete('/admin/invites/:id', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), adminCtrl.deleteInvite);
router.get('/admin/audit-logs', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), adminCtrl.getAuditLogs);
router.get('/admin/settings', authenticateToken, requireRole('SUPER ADMIN'), adminCtrl.getSystemSettings);
router.put('/admin/settings/:key', authenticateToken, requireRole('SUPER ADMIN'), adminCtrl.updateSystemSetting);
router.post('/admin/agent-token', authenticateToken, requireRole('SUPER ADMIN'), adminCtrl.generateAgentPairingToken);
router.post('/admin/agents/:agentId/revoke', authenticateToken, requireRole('SUPER ADMIN'), adminCtrl.revokeAgentCredential);
router.post('/admin/agents/:agentId/rotate-key', authenticateToken, requireRole('SUPER ADMIN'), adminCtrl.rotateAgentKey);

// Enterprise Device Enrollment & Lifecycle Management
router.get('/devices/my-device', authenticateToken, deviceCtrl.getMyDevice);
router.post('/devices/generate-enrollment-token', authenticateToken, deviceCtrl.generateEnrollmentToken);
router.post('/devices/enrollment-token', authenticateToken, deviceCtrl.generateEnrollmentToken);
router.post('/devices/enroll', deviceCtrl.enrollDevice);
router.get('/devices/installer-script', authenticateToken, deviceCtrl.getInstallerScript);
router.get('/devices/installers/:platform', deviceCtrl.getInstallerScript);
router.get('/devices/mobile-config', authenticateToken, deviceCtrl.getMobileEnrollmentConfig);
router.post('/devices/:agentId/rotate-key', authenticateToken, deviceCtrl.rotateDeviceKey);

// Administrative Device Management
router.get('/admin/devices', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), adminCtrl.getDevices);
router.post('/admin/devices/:agentId/approve', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), adminCtrl.approveDevice);
router.post('/admin/devices/:agentId/revoke', authenticateToken, requireRole('SUPER ADMIN'), adminCtrl.revokeDevice);
router.post('/admin/devices/:agentId/suspend', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), adminCtrl.suspendDevice);
router.post('/admin/devices/:agentId/reactivate', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), adminCtrl.reactivateDevice);
router.post('/admin/devices/:agentId/request-update', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), adminCtrl.requestAgentUpdate);
router.get('/admin/devices/:agentId/audit', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), adminCtrl.getDeviceAuditHistory);

// Desktop Client Application Downloads
router.get('/downloads/windows', (req, res) => res.redirect('/downloads/NKBDriveSetup.exe'));
router.get('/downloads/macos', (req, res) => res.redirect('/downloads/NKBDrive-macOS.zip'));

export default router;
