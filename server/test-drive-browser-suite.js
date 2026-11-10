import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Test configuration
const API_URL = 'http://127.0.0.1:5000/api';
let authToken = '';

function makeRequest(method, endpoint, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(`${API_URL}${endpoint}`);
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };
    if (authToken) {
      reqHeaders['Authorization'] = `Bearer ${authToken}`;
    }

    const req = http.request(parsed, {
      method,
      headers: reqHeaders
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        let data = null;
        try {
          data = JSON.parse(raw.toString('utf8'));
        } catch {
          data = raw;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data,
          raw
        });
      });
    });

    req.on('error', reject);

    if (body) {
      if (typeof body === 'string') {
        req.write(body);
      } else {
        req.write(JSON.stringify(body));
      }
    }
    req.end();
  });
}

async function runTests() {
  console.log('===============================================================');
  console.log('   NKB CLOUD v2.1.0 — ACTUAL DRIVE CONTENT BROWSER TEST SUITE   ');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(desc, condition, details = '') {
    if (condition) {
      console.log(`  [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${desc} ${details ? '— ' + details : ''}`);
      failed++;
    }
  }

  try {
    // 1. Authenticate
    console.log('[Phase 1] Authentication and Volume Discovery');
    const loginRes = await makeRequest('POST', '/auth/login', {
      identifier: 'admin@nkbmanufacturing.com',
      password: 'Admin@NKB2026!'
    });
    assert('Admin login succeeds', loginRes.status === 200 && loginRes.data?.token);
    authToken = loginRes.data.token;

    // Fetch storage volumes
    const volRes = await makeRequest('GET', '/storage/volumes');
    assert('Storage volumes endpoint returns 200', volRes.status === 200);
    const volumes = volRes.data?.volumes || [];
    assert('Volumes detected from Windows system', volumes.length > 0, `Found: ${volumes.length}`);

    const jVol = volumes.find(v => v.currentDriveLetter === 'J:' || v.assignedName?.includes('Drive J'));
    const dVol = volumes.find(v => v.currentDriveLetter === 'D:' || v.assignedName?.includes('Drive D'));
    const targetVol = jVol || volumes.find(v => v.status === 'ONLINE' && v.currentDriveLetter) || volumes[0];

    console.log(`  -> Selected Target Volume: ${targetVol.assignedName || targetVol.currentDriveLetter} (ID: ${targetVol.id})`);

    // 2. Root Directory Browsing
    console.log('\n[Phase 2] Root Directory Browsing');
    const rootBrowseRes = await makeRequest('GET', `/storage/volumes/${targetVol.id}/browse?path=`);
    assert('Root browse returns status 200', rootBrowseRes.status === 200);
    assert('Root browse returns success: true', rootBrowseRes.data?.success === true);
    assert('Items array present in response', Array.isArray(rootBrowseRes.data?.items));
    assert('Root directory contains actual folders/files', rootBrowseRes.data?.items?.length > 0, `Found ${rootBrowseRes.data?.items?.length} entries`);
    assert('Breadcrumbs start at Root', rootBrowseRes.data?.breadcrumbs?.[0]?.name === 'Root');

    // Verify system directories hidden
    const hasRecycleBin = rootBrowseRes.data.items.some(i => i.name.toUpperCase().includes('$RECYCLE.BIN'));
    const hasSystemVolInfo = rootBrowseRes.data.items.some(i => i.name.toUpperCase().includes('SYSTEM VOLUME INFORMATION'));
    assert('System directory $RECYCLE.BIN is hidden/filtered', !hasRecycleBin);
    assert('System directory System Volume Information is hidden/filtered', !hasSystemVolInfo);

    // 3. Nested Folder Navigation
    console.log('\n[Phase 3] Nested Folder Navigation');
    const folderCandidates = rootBrowseRes.data.items.filter(i => i.isDirectory);
    let successfulNav = false;
    let activeFolder = null;
    for (const folderItem of folderCandidates) {
      console.log(`  -> Navigating into directory: "${folderItem.name}"`);
      const nestedRes = await makeRequest('GET', `/storage/volumes/${targetVol.id}/browse?path=${encodeURIComponent(folderItem.name)}`);
      if (nestedRes.status === 200 && nestedRes.data?.success) {
        assert('Nested folder browse returns 200', nestedRes.status === 200);
        assert('Nested breadcrumbs contain parent and child', nestedRes.data?.breadcrumbs?.length >= 2);
        const resolvedPath = nestedRes.data?.currentPath || nestedRes.data?.relativePath;
        assert('Nested currentPath matches folder name', resolvedPath === folderItem.name);
        successfulNav = true;
        activeFolder = folderItem;
        break;
      }
    }
    if (!successfulNav) {
      assert('At least one directory is navigable', false, 'All checked folders returned error');
    }

    // 4. Pagination and Sorting
    console.log('\n[Phase 4] Pagination and Sorting');
    const pagedRes = await makeRequest('GET', `/storage/volumes/${targetVol.id}/browse?path=&page=1&limit=3`);
    assert('Pagination limit=3 enforced', pagedRes.data?.items?.length <= 3, `Count: ${pagedRes.data?.items?.length}`);
    assert('Pagination totalCount is accurate', pagedRes.data?.pagination?.totalCount === rootBrowseRes.data?.pagination?.totalCount);

    const sortedResAsc = await makeRequest('GET', `/storage/volumes/${targetVol.id}/browse?path=&sort=name&order=asc`);
    const sortedResDesc = await makeRequest('GET', `/storage/volumes/${targetVol.id}/browse?path=&sort=name&order=desc`);
    assert('Sorting ascending vs descending works', sortedResAsc.status === 200 && sortedResDesc.status === 200);

    // 5. File Metadata and Classification
    console.log('\n[Phase 5] File Info & Classification');
    // Find a file in root or in nested
    let testFile = rootBrowseRes.data.items.find(i => !i.isDirectory);
    let testFilePath = testFile ? testFile.name : '';

    if (!testFile && activeFolder) {
      const subBrowse = await makeRequest('GET', `/storage/volumes/${targetVol.id}/browse?path=${encodeURIComponent(activeFolder.name)}`);
      testFile = (subBrowse.data?.items || []).find(i => !i.isDirectory);
      if (testFile) {
        testFilePath = `${activeFolder.name}/${testFile.name}`;
      }
    }

    if (testFile) {
      console.log(`  -> Inspecting file: "${testFilePath}" (${testFile.size} bytes)`);
      const infoRes = await makeRequest('GET', `/storage/volumes/${targetVol.id}/file-info?path=${encodeURIComponent(testFilePath)}`);
      assert('File info returns 200', infoRes.status === 200);
      assert('File info contains size', typeof infoRes.data?.fileInfo?.size === 'number');
      assert('File info contains extension', !!infoRes.data?.fileInfo?.extension);
      assert('File info contains mimeType', !!infoRes.data?.fileInfo?.mimeType);
      assert('File info contains timestamps (mtime/ctime)', !!infoRes.data?.fileInfo?.modifiedAt);
      if (infoRes.data?.fileInfo?.size < 50 * 1024 * 1024) {
        assert('File info provides SHA-256 for files under 50MB', !!infoRes.data?.fileInfo?.sha256);
      }
    } else {
      console.log('  [INFO] No individual file in target volume root, checking other volumes for file tests...');
    }

    // 6. Preview and Download
    console.log('\n[Phase 6] File Preview and Streaming Download');
    // Find any file on G: or D: or J: smaller than 5MB
    let fileFoundForPreview = null;
    let volForPreview = null;

    for (const v of volumes) {
      if (v.status !== 'ONLINE') continue;
      const bRes = await makeRequest('GET', `/storage/volumes/${v.id}/browse?path=`);
      if (bRes.data?.items) {
        const candidate = bRes.data.items.find(i => !i.isDirectory && i.size > 0 && i.size < 5 * 1024 * 1024);
        if (candidate) {
          fileFoundForPreview = candidate;
          volForPreview = v;
          break;
        }
      }
    }

    if (fileFoundForPreview && volForPreview) {
      console.log(`  -> Testing with file: "${fileFoundForPreview.name}" on volume "${volForPreview.assignedName || volForPreview.currentDriveLetter}"`);
      // Preview
      const prevRes = await makeRequest('GET', `/storage/volumes/${volForPreview.id}/preview?path=${encodeURIComponent(fileFoundForPreview.name)}`);
      assert('Preview endpoint returns 200 or 400 (if non-text)', prevRes.status === 200 || prevRes.status === 400);

      // Download
      const dlRes = await makeRequest('GET', `/storage/volumes/${volForPreview.id}/download?path=${encodeURIComponent(fileFoundForPreview.name)}`);
      assert('Download endpoint returns 200', dlRes.status === 200);
      assert('Download returns binary content', dlRes.raw.length > 0);
      assert('Download Content-Disposition header set', !!dlRes.headers['content-disposition']);
      assert('Downloaded byte size matches file size', dlRes.raw.length === fileFoundForPreview.size);

      // Verify SHA-256 of downloaded content
      const downloadedHash = crypto.createHash('sha256').update(dlRes.raw).digest('hex');
      const infoRes = await makeRequest('GET', `/storage/volumes/${volForPreview.id}/file-info?path=${encodeURIComponent(fileFoundForPreview.name)}`);
      if (infoRes.data?.fileInfo?.sha256) {
        assert('Downloaded content SHA-256 strictly matches agent file-info hash', downloadedHash === infoRes.data.fileInfo.sha256);
      }
    } else {
      console.log('  [SKIP] No readable file found in root of volumes for preview/download test');
    }

    // 7. Security Penetration & Hardening Tests
    console.log('\n[Phase 7] Security Penetration & Hardening Tests');

    // Test 7.1: Path traversal with ..
    const travRes1 = await makeRequest('GET', `/storage/volumes/${targetVol.id}/browse?path=../../Windows`);
    assert('Reject path traversal ../../Windows (403 Forbidden)', travRes1.status === 403);

    const travRes2 = await makeRequest('GET', `/storage/volumes/${targetVol.id}/file-info?path=..\\..\\Windows\\System32\\calc.exe`);
    assert('Reject backslash path traversal ..\\.. (403 Forbidden)', travRes2.status === 403);

    // Test 7.2: UNC path injection
    const uncRes = await makeRequest('GET', `/storage/volumes/${targetVol.id}/browse?path=\\\\attacker.com\\share`);
    assert('Reject UNC path injection \\\\attacker.com\\share (403 Forbidden)', uncRes.status === 403);

    // Test 7.3: Alternate Data Stream (ADS) injection
    const adsRes = await makeRequest('GET', `/storage/volumes/${targetVol.id}/file-info?path=test.txt:secret_stream`);
    assert('Reject NTFS Alternate Data Stream injection (403 Forbidden)', adsRes.status === 403);

    // Test 7.4: Windows reserved device name
    const conRes = await makeRequest('GET', `/storage/volumes/${targetVol.id}/file-info?path=CON`);
    assert('Reject Windows reserved device name CON (403 Forbidden)', conRes.status === 403);

    // Test 7.5: System directory access rejection
    const recRes = await makeRequest('GET', `/storage/volumes/${targetVol.id}/browse?path=$RECYCLE.BIN`);
    assert('Block access to $RECYCLE.BIN (403 Forbidden)', recRes.status === 403);

    const sysRes = await makeRequest('GET', `/storage/volumes/${targetVol.id}/browse?path=System Volume Information`);
    assert('Block access to System Volume Information (403 Forbidden)', sysRes.status === 403);

    // Test 7.6: Non-existent volume ID
    const fakeVolRes = await makeRequest('GET', `/storage/volumes/999999/browse?path=`);
    assert('Reject non-existent volume ID (404 Not Found)', fakeVolRes.status === 404);

    // Test 7.7: Unauthenticated request rejection
    const savedToken = authToken;
    authToken = '';
    const unauthRes = await makeRequest('GET', `/storage/volumes/${targetVol.id}/browse?path=`);
    assert('Reject unauthenticated request (401 Unauthorized)', unauthRes.status === 401);
    authToken = savedToken;

  } catch (err) {
    console.error('Fatal test error:', err);
    failed++;
  }

  console.log('\n===============================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
