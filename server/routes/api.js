import express from 'express';
import multer from 'multer';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import * as authCtrl from '../controllers/authController.js';
import * as fileCtrl from '../controllers/fileController.js';
import * as storageCtrl from '../controllers/storageController.js';
import * as shareCtrl from '../controllers/shareController.js';
import * as adminCtrl from '../controllers/adminController.js';

const router = express.Router();
const upload = multer({
  limits: { fileSize: 50 * 1024 * 1024 * 1024 }, // 50 GB
  storage: multer.memoryStorage()
});

// Authentication Routes
router.post('/auth/login', authCtrl.login);
router.get('/auth/me', authenticateToken, authCtrl.getCurrentUser);
router.put('/auth/change-password', authenticateToken, authCtrl.changePassword);

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
router.put('/storage/volumes/:id', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), storageCtrl.updateVolumeConfig);
router.post('/storage/policies', authenticateToken, requireRole('SUPER ADMIN'), storageCtrl.setPlacementPolicy);
router.post('/storage/scan', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), storageCtrl.triggerDriveScan);

// Safe Drive Replacement & Migration Lifecycle
router.post('/storage/migrations/initiate', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), storageCtrl.initiateDriveMigration);
router.post('/storage/migrations/:id/approve', authenticateToken, requireRole('SUPER ADMIN'), storageCtrl.approveAndExecuteMigration);
router.post('/storage/migrations/:id/retire', authenticateToken, requireRole('SUPER ADMIN'), storageCtrl.retireSourceDrive);
router.post('/storage/volumes/:id/verify', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), storageCtrl.verifyVolumeIntegrity);

// Sharing Routes
router.post('/shares', authenticateToken, shareCtrl.createShare);
router.get('/shares/with-me', authenticateToken, shareCtrl.getSharedWithMe);
router.delete('/shares/:id', authenticateToken, shareCtrl.revokeShare);
router.get('/shares/public/:token', shareCtrl.getPublicShareInfo);

// Administration & Audit Routes
router.get('/admin/users', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), adminCtrl.getUsers);
router.post('/admin/users', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), adminCtrl.createUser);
router.put('/admin/users/:id', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), adminCtrl.updateUser);
router.get('/admin/audit-logs', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), adminCtrl.getAuditLogs);
router.get('/admin/settings', authenticateToken, requireRole('SUPER ADMIN'), adminCtrl.getSystemSettings);
router.put('/admin/settings/:key', authenticateToken, requireRole('SUPER ADMIN'), adminCtrl.updateSystemSetting);
router.post('/admin/agent-token', authenticateToken, requireRole('SUPER ADMIN'), adminCtrl.generateAgentPairingToken);
router.post('/admin/agents/:agentId/revoke', authenticateToken, requireRole('SUPER ADMIN'), adminCtrl.revokeAgentCredential);
router.post('/admin/agents/:agentId/rotate-key', authenticateToken, requireRole('SUPER ADMIN'), adminCtrl.rotateAgentKey);

export default router;
