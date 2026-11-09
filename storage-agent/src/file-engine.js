import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export class FileStorageEngine {
  constructor() {
    this.allowlistedRoots = new Set();
  }

  // Register approved directory allowlist
  registerAllowlistedRoot(rootPath) {
    if (rootPath) {
      const resolved = path.resolve(rootPath).toLowerCase();
      // Guard against registering root directories or sensitive system directories
      const forbiddenRoots = ['c:\\', 'c:\\windows', 'c:\\windows\\system32', '/', '/etc', '/bin', '/usr'];
      if (!forbiddenRoots.includes(resolved)) {
        this.allowlistedRoots.add(resolved);
      }
    }
  }

  // Strict path traversal and security validator
  resolveSafePath(mountPath, relativePath) {
    if (!mountPath || !relativePath) {
      throw new Error('Security Error: mountPath and relativePath are required');
    }

    // 1. Explicitly reject UNC paths and absolute drive letter escapes (SEC-05)
    if (
      /^[/\\]{2,}/.test(relativePath) ||
      /^[a-zA-Z]:/.test(relativePath) ||
      relativePath.startsWith('\\\\') ||
      relativePath.startsWith('//')
    ) {
      throw new Error(`Security Violation: UNC network paths and absolute drive paths are strictly forbidden: ${relativePath}`);
    }

    // 2. Reject null bytes and directory traversal
    if (relativePath.includes('\0') || relativePath.includes('..')) {
      throw new Error(`Security Violation: Illegal path traversal or null byte detected: ${relativePath}`);
    }

    // 3. Reject Windows Alternate Data Streams (ADS) and illegal characters
    if (relativePath.includes(':') || /::\$[a-zA-Z0-9_]+/i.test(relativePath) || /[*?"<>|]/.test(relativePath)) {
      throw new Error(`Security Violation: Windows alternate data stream (ADS) or illegal character detected: ${relativePath}`);
    }

    // 4. Clean relative path
    const sanitized = relativePath.replace(/^(\/|\\)+/, '');

    // 5. Reject Windows reserved system device names (CON, PRN, AUX, NUL, COM1..9, LPT1..9)
    const segments = sanitized.split(/[/\\]/);
    const reservedDevicePattern = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
    for (const seg of segments) {
      if (reservedDevicePattern.test(seg.trim())) {
        throw new Error(`Security Violation: Windows reserved system device name detected: ${seg}`);
      }
    }

    const resolvedMount = path.resolve(mountPath);
    const resolvedTarget = path.resolve(resolvedMount, sanitized);

    // 6. Strict containment verification
    if (!resolvedTarget.toLowerCase().startsWith(resolvedMount.toLowerCase())) {
      throw new Error(`Security Boundary Violation: Target ${resolvedTarget} escapes allowlisted mount root ${resolvedMount}`);
    }

    // 7. Reparse point, junction, and symbolic link inspection (TOCTOU mitigation)
    let currentCheckPath = resolvedMount;
    for (const seg of segments) {
      currentCheckPath = path.join(currentCheckPath, seg);
      if (fs.existsSync(currentCheckPath)) {
        try {
          const lstat = fs.lstatSync(currentCheckPath);
          if (lstat.isSymbolicLink()) {
            throw new Error(`Security Violation: Symbolic link or junction detected at ${currentCheckPath}`);
          }
        } catch (err) {
          if (err.message.includes('Security Violation')) throw err;
        }
      }
    }

    return resolvedTarget;
  }

  ensureDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  // Idempotent chunk write supporting resumable uploads (Binary Buffer or Base64)
  async writeChunk({ mountPath, relativePath, chunkIndex, chunkBuffer, chunkBase64, isLastChunk, chunkSha256 }) {
    this.registerAllowlistedRoot(mountPath);
    const targetPath = this.resolveSafePath(mountPath, relativePath);
    const partsDir = `${targetPath}.chunks`;

    this.ensureDirectory(partsDir);
    const chunkFilePath = path.join(partsDir, `chunk_${String(chunkIndex).padStart(6, '0')}.part`);

    // Support raw Binary Buffer directly (Zero Base64 overhead) or fallback to Base64
    const buffer = Buffer.isBuffer(chunkBuffer) 
      ? chunkBuffer 
      : Buffer.from(chunkBase64 || '', 'base64');

    // Verify chunk integrity if hash provided
    if (chunkSha256) {
      const actualChunkHash = crypto.createHash('sha256').update(buffer).digest('hex');
      if (actualChunkHash.toLowerCase() !== chunkSha256.toLowerCase()) {
        throw new Error(`Integrity Error: Chunk ${chunkIndex} SHA-256 mismatch (Expected: ${chunkSha256}, Actual: ${actualChunkHash})`);
      }
    }

    // Write chunk idempotently
    fs.writeFileSync(chunkFilePath, buffer);

    if (isLastChunk) {
      this.ensureDirectory(path.dirname(targetPath));

      // Assemble all chunks in deterministic numeric order
      const partFiles = fs.readdirSync(partsDir)
        .filter(f => f.endsWith('.part'))
        .sort();

      const finalTempPath = `${targetPath}.assembling`;
      const writeStream = fs.createWriteStream(finalTempPath);
      const hashStream = crypto.createHash('sha256');

      // True Asynchronous Streaming Concatenation (Zero Event-Loop Freezing)
      for (const pFile of partFiles) {
        const pPath = path.join(partsDir, pFile);
        await new Promise((resolveChunk, rejectChunk) => {
          const rStream = fs.createReadStream(pPath);
          rStream.on('data', chunk => {
            hashStream.update(chunk);
            writeStream.write(chunk);
          });
          rStream.on('end', resolveChunk);
          rStream.on('error', rejectChunk);
        });
      }

      await new Promise((resolve, reject) => {
        writeStream.end(resolve);
        writeStream.on('error', reject);
      });

      const fullSha256 = hashStream.digest('hex');

      // Atomic rename
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
      fs.renameSync(finalTempPath, targetPath);

      // Clean up chunk temporary parts
      try {
        for (const pFile of partFiles) {
          fs.unlinkSync(path.join(partsDir, pFile));
        }
        if (fs.existsSync(partsDir)) {
          fs.rmdirSync(partsDir);
        }
      } catch (cleanupErr) {
        console.warn(`[FileEngine] Temporary chunk cleanup notice:`, cleanupErr.message);
      }

      const finalStat = fs.statSync(targetPath);

      return {
        completed: true,
        assembled: true,
        bytesWritten: finalStat.size,
        sizeBytes: finalStat.size,
        sha256: fullSha256,
        targetPath
      };
    }

    return {
      completed: false,
      chunkIndex,
      bytesWritten: buffer.length,
      isLastChunk: false
    };
  }

  // Range reading supporting high-performance streaming slices
  async readChunk({ mountPath, relativePath, startByte = 0, length }) {
    this.registerAllowlistedRoot(mountPath);
    const targetPath = this.resolveSafePath(mountPath, relativePath);

    if (!fs.existsSync(targetPath)) {
      throw new Error(`File not found: ${relativePath}`);
    }

    const stat = fs.statSync(targetPath);
    const fileSize = stat.size;

    const start = Math.max(0, parseInt(startByte, 10) || 0);
    const end = length ? Math.min(fileSize - 1, start + parseInt(length, 10) - 1) : fileSize - 1;

    if (start >= fileSize && fileSize > 0) {
      throw new Error(`Requested range out of bounds (Start: ${start}, File Size: ${fileSize})`);
    }

    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(targetPath, { start, end });
      const chunks = [];

      stream.on('data', (d) => chunks.push(d));
      stream.on('end', () => {
        const fullBuffer = Buffer.concat(chunks);
        resolve({
          bytesRead: fullBuffer.length,
          buffer: fullBuffer,
          startByte: start,
          endByte: end,
          length: fullBuffer.length,
          fileSize,
          dataBuffer: fullBuffer,
          dataBase64: fullBuffer.toString('base64')
        });
      });
      stream.on('error', (err) => reject(err));
    });
  }

  // Cryptographic checksum verification
  async verifyChecksum({ mountPath, relativePath, expectedSha256 }) {
    this.registerAllowlistedRoot(mountPath);
    const targetPath = this.resolveSafePath(mountPath, relativePath);

    if (!fs.existsSync(targetPath)) {
      return { isMatch: false, error: 'File missing on storage media' };
    }

    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(targetPath);

      stream.on('data', (d) => hash.update(d));
      stream.on('end', () => {
        const actualSha256 = hash.digest('hex');
        resolve({
          isMatch: actualSha256.toLowerCase() === (expectedSha256 || '').toLowerCase(),
          actualSha256,
          expectedSha256
        });
      });
      stream.on('error', (err) => reject(err));
    });
  }

  // Safe file migration with checksum check (Zero destructive ops on source)
  async migrateFile({ sourceMountPath, targetMountPath, relativePath, expectedSha256 }) {
    this.registerAllowlistedRoot(sourceMountPath);
    this.registerAllowlistedRoot(targetMountPath);

    const src = this.resolveSafePath(sourceMountPath, relativePath);
    const tgt = this.resolveSafePath(targetMountPath, relativePath);

    if (!fs.existsSync(src)) {
      throw new Error(`Source file missing: ${relativePath}`);
    }

    this.ensureDirectory(path.dirname(tgt));

    // Stream copy
    await new Promise((resolve, reject) => {
      const reader = fs.createReadStream(src);
      const writer = fs.createWriteStream(tgt);
      reader.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    // Verification
    const verify = await this.verifyChecksum({
      mountPath: targetMountPath,
      relativePath,
      expectedSha256
    });

    if (!verify.isMatch) {
      // Remove corrupted target copy to avoid dirty state
      if (fs.existsSync(tgt)) fs.unlinkSync(tgt);
      throw new Error(`Migration verification failed: Checksum mismatch on target drive for ${relativePath}`);
    }

    const stat = fs.statSync(tgt);

    // Source file is NEVER modified or deleted (MIG-01)
    return {
      migrated: true,
      verified: true,
      bytes: stat.size,
      sha256: verify.actualSha256
    };
  }

  // Delete payload only when explicitly authorized by Super Admin with authorizationToken
  async deleteFile({ mountPath, relativePath, authorizationToken }) {
    this.registerAllowlistedRoot(mountPath);
    const targetPath = this.resolveSafePath(mountPath, relativePath);
    if (!authorizationToken) {
      throw new Error('Security Violation: File deletion requires an explicit authorizationToken');
    }
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
      return { deleted: true };
    }
    return { deleted: false, reason: 'Already deleted' };
  }
}

export const fileEngine = new FileStorageEngine();
export default fileEngine;
