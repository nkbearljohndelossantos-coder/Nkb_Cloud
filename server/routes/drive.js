import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import * as driveCtrl from '../controllers/driveController.js';

const router = express.Router();

// 1. Workstation Device Enrollment & Registration
router.post('/devices/register', authenticateToken, driveCtrl.registerDevice);
router.get('/devices/my-device', authenticateToken, driveCtrl.getMyDevice);

// 2. Workstation Device Revocation & Approval Lifecycle
router.post('/devices/:id/approve', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), driveCtrl.approveDevice);
router.post('/devices/:id/reject', authenticateToken, requireRole('SUPER ADMIN', 'ADMIN'), driveCtrl.rejectDevice);
router.post('/devices/:id/revoke', authenticateToken, driveCtrl.revokeDevice);

// 3. Cursor-Based Incremental Synchronization
router.get('/changes', authenticateToken, driveCtrl.validateDriveDevice, driveCtrl.getChanges);

// 4. Optimistic Version Validation & Conflict Copy Forking
router.post('/files/validate-version', authenticateToken, driveCtrl.validateDriveDevice, driveCtrl.validateVersion);
router.post('/files/conflict-copy', authenticateToken, driveCtrl.validateDriveDevice, driveCtrl.createConflictCopy);

// 5. Hierarchical Directory Hydration for Fast Client Mounting
router.get('/tree', authenticateToken, driveCtrl.validateDriveDevice, driveCtrl.getDriveTree);

export default router;
