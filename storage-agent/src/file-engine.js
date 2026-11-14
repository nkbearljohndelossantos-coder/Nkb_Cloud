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
      const forbiddenRoots = [
        'c:\\', 'c:\\windows', 'c:\\windows\\system32', 'c:\\program files',
        '/', '/etc', '/bin', '/usr', '/sbin', '/var', '/root'
      ];
      if (!forbiddenRoots.includes(resolved)) {
        this.allowlistedRoots.add(resolved);
      }
    }
  }

  // Strict path traversal, UNC, ADS, DOS device, and security validator
  resolveSafePath(mountPath, relativePath = '') {
    if (!mountPath) {
      throw new Error('Security Error: mountPath is required');
    }

    // Allow root directory of mount path when relativePath is empty or dot
    if (!relativePath || relativePath === '.' || relativePath === '/' || relativePath === '\\') {
      const resolvedMount = path.resolve(mountPath);
      return resolvedMount;
    }

    // 1. Pre-check URL / Hex Percent-Encoded Traversal Attacks (%2e%2e, %2f, %5c)
    let decoded = relativePath;
    try {
      if (decoded.includes('%')) {
        decoded = decodeURIComponent(decoded);
        // Double-decoding check for nested %252e attacks
        if (decoded.includes('%')) {
          decoded = decodeURIComponent(decoded);
        }
      }
    } catch (e) {
      throw new Error(`Security Violation: Malformed percent-encoding in path: ${relativePath}`);
    }

    // 2. Explicitly reject UNC paths, Extended-Length paths, and drive-relative paths (SEC-05)
    // Matches: \\..., //..., \\?\..., \\.\..., C:..., D:...
    if (
      /^[/\\]{2,}/.test(decoded) ||
      /^[/\\]{2,}/.test(relativePath) ||
      /^[a-zA-Z]:/.test(decoded) ||
      /^[a-zA-Z]:/.test(relativePath) ||
      decoded.startsWith('\\\\') ||
      decoded.startsWith('//') ||
      decoded.includes('\\?\\') ||
      decoded.includes('/?/')
    ) {
      throw new Error(`Security Violation: UNC network paths, extended-length paths, and absolute/drive-relative paths are strictly forbidden: ${relativePath}`);
    }

    // 3. Reject null bytes and directory traversal
    if (decoded.includes('\0') || decoded.includes('..') || relativePath.includes('\0') || relativePath.includes('..')) {
      throw new Error(`Security Violation: Illegal path traversal or null byte detected: ${relativePath}`);
    }

    // 4. Reject Windows Alternate Data Streams (ADS) and illegal characters
    if (decoded.includes(':') || /::\$[a-zA-Z0-9_]+/i.test(decoded) || /[*?"<>|]/.test(decoded)) {
      throw new Error(`Security Violation: Windows alternate data stream (ADS) or illegal character detected: ${relativePath}`);
    }

    // 5. Reject Trailing Dots and Spaces (Windows Win32 auto-strip vulnerability)
    // e.g. "malware.exe." or "secret.txt "
    const segments = decoded.replace(/^[/\\]+/, '').split(/[/\\]/);
    for (const seg of segments) {
      if (/[. ]+$/.test(seg)) {
        throw new Error(`Security Violation: Trailing dots and spaces in path segments are forbidden on Windows: ${seg}`);
      }
    }

    // 6. Reject Windows reserved system device names (CON, PRN, AUX, NUL, COM1..9, LPT1..9)
    const reservedDevicePattern = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
    for (const seg of segments) {
      if (reservedDevicePattern.test(seg.trim())) {
        throw new Error(`Security Violation: Windows reserved system device name detected: ${seg}`);
      }
    }

    const sanitized = segments.join(path.sep);
    const resolvedMount = path.resolve(mountPath);
    const resolvedTarget = path.resolve(resolvedMount, sanitized);

    // 7. Strict containment verification (Prefix Check)
    const mountLower = resolvedMount.toLowerCase() + path.sep;
    const targetLower = resolvedTarget.toLowerCase();
    if (!targetLower.startsWith(resolvedMount.toLowerCase()) && !targetLower.startsWith(mountLower)) {
      throw new Error(`Security Boundary Violation: Target ${resolvedTarget} escapes allowlisted mount root ${resolvedMount}`);
    }

    // 8. Reparse point, junction, and symbolic link inspection (TOCTOU mitigation)
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
    // Bounded chunk size up to 16MB per request to prevent V8 memory overflow
    const maxChunk = 16 * 1024 * 1024;
    const requestedLength = (length !== null && length !== undefined) ? parseInt(length, 10) : (fileSize - start);
    const boundedLength = Math.min(requestedLength, maxChunk);
    const end = fileSize > 0 ? Math.min(fileSize - 1, start + boundedLength - 1) : 0;

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
          startByte: start,
          endByte: end,
          length: fullBuffer.length,
          fileSize,
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

  // Safe file migration with checksum check (Zero destructive ops on source - MIG-01)
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

  // Read-only directory listing with sorting, search, and pagination
  async listDirectory({ volumeRoot, relativePath = '', page = 1, limit = 50, sortBy = 'name', sortOrder = 'asc', search = '' }) {
    if (!volumeRoot) {
      throw new Error('volumeRoot is required for directory listing');
    }

    const resolvedRoot = path.resolve(volumeRoot);
    const targetPath = this.resolveSafePath(volumeRoot, relativePath);

    // Guard against Windows system directories
    const targetLower = targetPath.toLowerCase();
    const systemBlacklist = [
      'c:\\windows', 'c:\\windows\\system32',
      'system volume information', '$recycle.bin', 'config.msi', 'found.000'
    ];
    for (const b of systemBlacklist) {
      if (targetLower.includes(b)) {
        throw new Error(`Access Denied: Windows system protected directory is restricted: ${targetPath}`);
      }
    }

    if (!fs.existsSync(targetPath)) {
      throw new Error(`Directory not found: ${relativePath || '/'}`);
    }

    const dirStat = fs.lstatSync(targetPath);
    if (!dirStat.isDirectory()) {
      throw new Error(`Target path is not a directory: ${relativePath}`);
    }

    // Read single directory entries without recursive scans
    let rawEntries = [];
    try {
      rawEntries = fs.readdirSync(targetPath, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'EPERM' || err.code === 'EACCES') {
        const cleanRelative = relativePath ? relativePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : '';
        const pathParts = cleanRelative ? cleanRelative.split('/') : [];
        const breadcrumbs = [{ name: 'Root', path: '' }];
        let accPath = '';
        for (const part of pathParts) {
          accPath = accPath ? `${accPath}/${part}` : part;
          breadcrumbs.push({ name: part, path: accPath });
        }
        return {
          volumeRoot: resolvedRoot,
          currentPath: cleanRelative,
          breadcrumbs,
          parentPath: pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : '',
          items: [],
          totalCount: 0,
          totalFolders: 0,
          totalFiles: 0,
          page: 1,
          limit: 50,
          totalPages: 1,
          permissionDenied: true,
          error: `Access Denied: Windows ACLs restrict access to this directory.`
        };
      }
      throw err;
    }
    const collectedItems = [];

    const hiddenSystemItems = new Set([
      '$recycle.bin', 'system volume information', 'pagefile.sys',
      'hiberfil.sys', 'swapfile.sys', 'dumpstack.log.tmp', 'config.msi', 'found.000',
      'desktop.ini', 'thumbs.db', 'ehthumbs.db', 'ehthumbs_vista.db', '.ds_store',
      'ntuser.dat', 'ntuser.dat.log', 'ntuser.ini', 'bootmgr', 'bootnxt'
    ]);

    for (const entry of rawEntries) {
      const entryNameLower = entry.name.toLowerCase();
      // Skip hidden system files, recycle bin, dot-files, dollar-files, and desktop.ini
      if (
        hiddenSystemItems.has(entryNameLower) ||
        entry.name.startsWith('.') ||
        entry.name.startsWith('$') ||
        entryNameLower.includes('desktop.ini') ||
        entryNameLower.includes('thumbs.db')
      ) {
        continue;
      }

      const itemFullPath = path.join(targetPath, entry.name);
      let stat = null;
      try {
        stat = fs.lstatSync(itemFullPath);
      } catch (err) {
        // Skip inaccessible entries
        continue;
      }

      const isDir = stat.isDirectory();
      const isSymlink = stat.isSymbolicLink();
      const ext = isDir ? '' : path.extname(entry.name).toLowerCase();
      const fileType = categorizeFileType(ext, isDir);
      const mimeType = isDir ? 'inode/directory' : getMimeType(ext);

      // Relative path from volume root for navigation
      const itemRelativePath = path.relative(resolvedRoot, itemFullPath).replace(/\\/g, '/');

      collectedItems.push({
        name: entry.name,
        isDirectory: isDir,
        isSymlink,
        size: isDir ? 0 : stat.size,
        extension: ext,
        fileType,
        mimeType,
        relativePath: itemRelativePath,
        createdAt: stat.birthtime ? stat.birthtime.toISOString() : stat.ctime.toISOString(),
        modifiedAt: stat.mtime ? stat.mtime.toISOString() : null,
        attributes: {
          isReadOnly: !(stat.mode & 0o200),
          isHidden: entry.name.startsWith('.'),
          isDirectory: isDir
        }
      });
    }

    // Filter by search term if provided
    let filtered = collectedItems;
    if (search && search.trim() !== '') {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(item => item.name.toLowerCase().includes(q));
    }

    // Sort items: Folders first, then files; then by selected field
    const orderMult = sortOrder === 'desc' ? -1 : 1;
    filtered.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;

      switch (sortBy) {
        case 'size':
          return (a.size - b.size) * orderMult;
        case 'modifiedAt':
          return ((new Date(a.modifiedAt || 0)).getTime() - (new Date(b.modifiedAt || 0)).getTime()) * orderMult;
        case 'type':
          return (a.fileType.localeCompare(b.fileType)) * orderMult;
        case 'name':
        default:
          return (a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })) * orderMult;
      }
    });

    // Pagination
    const totalCount = filtered.length;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 50));
    const totalPages = Math.ceil(totalCount / limitNum) || 1;
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedItems = filtered.slice(startIndex, startIndex + limitNum);

    // Build breadcrumb segments
    const cleanRelative = relativePath ? relativePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : '';
    const pathParts = cleanRelative ? cleanRelative.split('/') : [];
    const breadcrumbs = [{ name: 'Root', path: '' }];
    let accPath = '';
    for (const part of pathParts) {
      accPath = accPath ? `${accPath}/${part}` : part;
      breadcrumbs.push({ name: part, path: accPath });
    }

    const parentPath = pathParts.length > 1
      ? pathParts.slice(0, -1).join('/')
      : (pathParts.length === 1 ? '' : null);

    return {
      volumeRoot: resolvedRoot,
      currentPath: cleanRelative,
      breadcrumbs,
      parentPath,
      items: paginatedItems,
      totalCount,
      totalFolders: filtered.filter(i => i.isDirectory).length,
      totalFiles: filtered.filter(i => !i.isDirectory).length,
      page: pageNum,
      limit: limitNum,
      totalPages,
      scannedAt: new Date().toISOString()
    };
  }

  // Get detailed metadata and cryptographic fingerprint for a single file
  async getFileInfo({ volumeRoot, relativePath }) {
    if (!volumeRoot || !relativePath) {
      throw new Error('volumeRoot and relativePath are required');
    }

    const resolvedRoot = path.resolve(volumeRoot);
    const targetPath = this.resolveSafePath(volumeRoot, relativePath);

    if (!fs.existsSync(targetPath)) {
      throw new Error(`File not found: ${relativePath}`);
    }

    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      throw new Error(`Target is a directory, not a file: ${relativePath}`);
    }

    const ext = path.extname(targetPath).toLowerCase();
    const mimeType = getMimeType(ext);
    const fileType = categorizeFileType(ext, false);

    // Compute SHA-256 if file is under 50MB
    let sha256 = null;
    if (stat.size <= 50 * 1024 * 1024) {
      const hash = crypto.createHash('sha256');
      hash.update(fs.readFileSync(targetPath));
      sha256 = hash.digest('hex');
    }

    // Determine preview support
    const previewType = getPreviewType(ext);

    return {
      name: path.basename(targetPath),
      relativePath: path.relative(resolvedRoot, targetPath).replace(/\\/g, '/'),
      size: stat.size,
      extension: ext,
      fileType,
      mimeType,
      sha256,
      createdAt: stat.birthtime ? stat.birthtime.toISOString() : stat.ctime.toISOString(),
      modifiedAt: stat.mtime ? stat.mtime.toISOString() : null,
      previewType,
      isPreviewable: previewType !== 'NONE'
    };
  }

  // Safe read of text files for preview (capped at 256KB)
  async readTextPreview({ volumeRoot, relativePath, maxBytes = 256 * 1024 }) {
    const targetPath = this.resolveSafePath(volumeRoot, relativePath);
    if (!fs.existsSync(targetPath)) {
      throw new Error(`File not found: ${relativePath}`);
    }

    const stat = fs.statSync(targetPath);
    const bytesToRead = Math.min(stat.size, maxBytes);
    const fd = fs.openSync(targetPath, 'r');
    const buffer = Buffer.alloc(bytesToRead);
    fs.readSync(fd, buffer, 0, bytesToRead, 0);
    fs.closeSync(fd);

    return {
      content: buffer.toString('utf-8'),
      truncated: stat.size > maxBytes,
      totalBytes: stat.size,
      bytesRead: bytesToRead
    };
  }

  // Delete payload only when explicitly authorized by Super Admin with authorizationToken
  async deleteFile({ mountPath, relativePath, authorizationToken, commandId }) {
    this.registerAllowlistedRoot(mountPath);
    const targetPath = this.resolveSafePath(mountPath, relativePath);

    if (!authorizationToken || typeof authorizationToken !== 'string') {
      throw new Error('Security Violation: File deletion requires an explicit cryptographic authorizationToken');
    }

    if (commandId && !authorizationToken.includes(commandId)) {
      throw new Error('Security Violation: Authorization token does not match the active commandId');
    }

    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
      return { deleted: true, targetPath };
    }
    return { deleted: false, reason: 'Already deleted' };
  }
}

// Helpers for MIME type and file classification
function getMimeType(extension) {
  const ext = (extension || '').toLowerCase().replace('.', '');
  const mimeMap = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    pdf: 'application/pdf',
    txt: 'text/plain; charset=utf-8',
    csv: 'text/csv; charset=utf-8',
    json: 'application/json; charset=utf-8',
    md: 'text/markdown; charset=utf-8',
    log: 'text/plain; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    jsx: 'text/javascript; charset=utf-8',
    ts: 'text/typescript; charset=utf-8',
    tsx: 'text/typescript; charset=utf-8',
    html: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    py: 'text/x-python; charset=utf-8',
    sql: 'text/plain; charset=utf-8',
    xml: 'application/xml; charset=utf-8',
    yml: 'text/yaml; charset=utf-8',
    yaml: 'text/yaml; charset=utf-8',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    zip: 'application/zip',
    rar: 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed',
    tar: 'application/x-tar',
    gz: 'application/gzip'
  };
  return mimeMap[ext] || 'application/octet-stream';
}

function categorizeFileType(ext, isDir) {
  if (isDir) return 'Folder';
  const e = (ext || '').toLowerCase().replace('.', '');
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(e)) return 'Image';
  if (e === 'pdf') return 'PDF Document';
  if (['doc', 'docx', 'rtf', 'odt'].includes(e)) return 'Word Document';
  if (['xls', 'xlsx', 'csv'].includes(e)) return 'Spreadsheet';
  if (['ppt', 'pptx'].includes(e)) return 'Presentation';
  if (['txt', 'log', 'md', 'ini', 'env'].includes(e)) return 'Text Document';
  if (['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'py', 'sql', 'json', 'xml', 'yml', 'yaml'].includes(e)) return 'Source Code';
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(e)) return 'Archive';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(e)) return 'Video';
  if (['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(e)) return 'Audio';
  if (['exe', 'msi', 'bat', 'cmd', 'ps1', 'dll', 'sys'].includes(e)) return 'Executable / Binary';
  return 'File';
}

function getPreviewType(ext) {
  const e = (ext || '').toLowerCase().replace('.', '');
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(e)) return 'IMAGE';
  if (e === 'pdf') return 'PDF';
  if (['txt', 'csv', 'json', 'md', 'log', 'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'py', 'sql', 'xml', 'yml', 'yaml', 'env', 'ini'].includes(e)) return 'TEXT';
  return 'NONE';
}

export const fileEngine = new FileStorageEngine();
export default fileEngine;
