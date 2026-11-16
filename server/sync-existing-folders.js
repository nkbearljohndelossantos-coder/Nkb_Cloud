import db from './config/db.js';
import agentHub from './services/agentHub.js';
import crypto from 'crypto';
import { detectCategory } from './controllers/fileController.js';

async function syncAllLinkedFolders() {
  console.log('[SYNC] Starting resync of all linked volume folders...');

  // Wait a moment for agentHub if needed
  await new Promise(r => setTimeout(r, 2000));

  const rootFoldersRes = await db.query(
    `SELECT f.*, sv.assigned_name as volume_name 
     FROM folders f
     JOIN storage_volumes sv ON f.preferred_volume_id = sv.id
     WHERE f.parent_id IS NULL AND f.preferred_volume_id IS NOT NULL AND f.is_trashed = FALSE`
  );

  const rootFolders = rootFoldersRes.rows || [];
  console.log(`[SYNC] Found ${rootFolders.length} linked root folder(s):`, rootFolders.map(f => `${f.name} (volume: ${f.volume_name})`));

  let totalFilesIndexed = 0;
  let totalFoldersIndexed = 0;

  for (const rootFolder of rootFolders) {
    const volumeId = rootFolder.preferred_volume_id;
    console.log(`\n[SYNC] Indexing root folder: "${rootFolder.name}" on volume: ${rootFolder.volume_name} (${volumeId})`);

    const indexRecursively = async (parentFolderId, dirRelativePath, depth = 0) => {
      if (depth > 12) {
        console.warn(`[SYNC] Max depth reached at ${dirRelativePath}`);
        return;
      }

      console.log(`[SYNC] Scanning dir: "${dirRelativePath}" (depth: ${depth})`);
      let browseResult;
      try {
        browseResult = await agentHub.browseVolumeDirectory(volumeId, {
          relativePath: dirRelativePath,
          limit: 5000
        });
      } catch (err) {
        console.error(`[SYNC] browseVolumeDirectory failed for "${dirRelativePath}":`, err.message);
        return;
      }

      if (!browseResult || !browseResult.items) {
        console.log(`[SYNC] No items in "${dirRelativePath}"`);
        return;
      }

      console.log(`[SYNC] Found ${browseResult.items.length} items in "${dirRelativePath}"`);

      for (const item of browseResult.items) {
        const itemNameLower = item.name.toLowerCase();
        // Skip hidden system files, recycle bin, dotfiles, desktop.ini, thumbs.db
        if (
          itemNameLower.includes('desktop.ini') ||
          itemNameLower.includes('thumbs.db') ||
          itemNameLower.includes('.ds_store') ||
          itemNameLower.includes('$recycle.bin') ||
          item.name.startsWith('.') ||
          item.name.startsWith('$')
        ) {
          continue;
        }

        if (item.isDirectory) {
          // Check or create folder
          const subCheck = await db.query(
            'SELECT id FROM folders WHERE name = $1 AND parent_id = $2 AND preferred_volume_id = $3 AND is_trashed = FALSE',
            [item.name, parentFolderId, volumeId]
          );
          let childFolderId;
          if (subCheck.rows && subCheck.rows.length > 0) {
            childFolderId = subCheck.rows[0].id;
          } else {
            childFolderId = crypto.randomUUID();
            await db.query(
              `INSERT INTO folders (id, name, parent_id, owner_id, preferred_volume_id, color, is_shared_drive, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, '#0F172A', FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
              [childFolderId, item.name, parentFolderId, rootFolder.owner_id, volumeId]
            );
            totalFoldersIndexed++;
            console.log(`[SYNC]   [+FOLDER] ${item.name}`);
          }
          await indexRecursively(childFolderId, item.relativePath, depth + 1);
        } else {
          // Check or create file
          const fileCheck = await db.query(
            'SELECT id FROM files WHERE name = $1 AND folder_id = $2 AND is_trashed = FALSE',
            [item.name, parentFolderId]
          );
          if (!fileCheck.rows || fileCheck.rows.length === 0) {
            const fileId = crypto.randomUUID();
            const ext = (item.extension || (item.name.includes('.') ? item.name.split('.').pop() : '')).replace('.', '').toLowerCase();
            const mimeType = item.mimeType || 'application/octet-stream';
            const category = detectCategory(mimeType, ext);
            const sha256 = item.sha256 || crypto.createHash('sha256').update(volumeId + ':' + item.relativePath + ':' + (item.size || 0)).digest('hex');
            const sizeBytes = BigInt(item.size || 0);

            try {
              await db.query(
                `INSERT INTO files (
                  id, folder_id, owner_id, name, original_name, mime_type, extension, 
                  size_bytes, category, storage_volume_id, relative_path, current_version_num, status, sha256_hash, 
                  created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9, $10, 1, 'AVAILABLE', $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [
                  fileId,
                  parentFolderId,
                  rootFolder.owner_id,
                  item.name,
                  mimeType,
                  ext,
                  sizeBytes.toString(),
                  category,
                  volumeId,
                  item.relativePath,
                  sha256
                ]
              );
              totalFilesIndexed++;
              console.log(`[SYNC]   [+FILE] ${item.name} (${sizeBytes} bytes, ${category})`);
            } catch (insErr) {
              console.error(`[SYNC]   [!ERROR inserting ${item.name}]:`, insErr.message);
            }
          }
        }
      }
    };

    await indexRecursively(rootFolder.id, rootFolder.name, 0);
  }

  console.log(`\n========================================`);
  console.log(`[SYNC] Completed! Total new folders: ${totalFoldersIndexed}, total new files: ${totalFilesIndexed}`);
  console.log(`========================================\n`);

  const countRes = await db.query('SELECT COUNT(*) as count FROM files;');
  console.log(`[SYNC] Current total files in database: ${countRes.rows[0].count}`);
  process.exit(0);
}

syncAllLinkedFolders().catch(err => {
  console.error('[SYNC FATAL]', err);
  process.exit(1);
});
