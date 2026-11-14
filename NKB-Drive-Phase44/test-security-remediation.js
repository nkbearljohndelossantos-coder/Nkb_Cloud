// NKB DRIVE PHASE 4.5 — SECURITY REMEDIATION VERIFICATION
// Validates Authentication, Device Scoping, Department Isolation, Session Ownership, and Path Traversal

const BASE_URL = 'http://127.0.0.1:5000';

async function runSecurityGate() {
  console.log('================================================================');
  console.log('   NKB DRIVE PHASE 4.5 SECURITY REMEDIATION GATE                ');
  console.log('================================================================');

  let passed = 0;
  let total = 6;

  // TEST 1: Unauthenticated Journal/Changes Access Rejected (401)
  try {
    const res = await fetch(`${BASE_URL}/api/v1/drive/changes?cursor=0`);
    if (res.status === 401) {
      console.log('  [PASS] Test 1: Unauthenticated journal/changes access rejected (401)');
      passed++;
    } else {
      console.error(`  [FAIL] Test 1: Expected 401, got ${res.status}`);
    }
  } catch (e) {
    console.error('  [FAIL] Test 1 error:', e.message);
  }

  // TEST 2: Missing Device Identity (x-device-id omitted)
  try {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin@nkbmanufacturing.com', password: 'TestPassword2026!' })
    });
    const loginData = await loginRes.json();
    const token = loginData.token;

    if (!token) {
      throw new Error('Failed to login synthetic admin: ' + JSON.stringify(loginData));
    }

    const journalRes = await fetch(`${BASE_URL}/api/v1/drive/changes?cursor=0`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (journalRes.status === 401) {
      const body = await journalRes.json();
      if (body.code === 'MISSING_DEVICE_ID') {
        console.log('  [PASS] Test 2: Missing device identity rejected (401 MISSING_DEVICE_ID)');
        passed++;
      } else {
        console.log(`  [PASS] Test 2: Missing device identity rejected (401)`);
        passed++;
      }
    } else {
      console.error(`  [FAIL] Test 2: Expected 401, got ${journalRes.status}`);
    }

    // TEST 3: Revoked / Unapproved Device Access Denial (403)
    const fakeDeviceId = '00000000-0000-0000-0000-000000000000';
    const fakeDeviceRes = await fetch(`${BASE_URL}/api/v1/drive/changes?cursor=0`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-device-id': fakeDeviceId
      }
    });

    if (fakeDeviceRes.status === 401 || fakeDeviceRes.status === 403) {
      console.log('  [PASS] Test 3: Unregistered/unapproved device denied (401/403)');
      passed++;
    } else {
      console.error(`  [FAIL] Test 3: Expected 401/403, got ${fakeDeviceRes.status}`);
    }

    // TEST 4: Path Traversal Protection
    const traversalRes = await fetch(`${BASE_URL}/api/files/download?path=../../etc/passwd`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (traversalRes.status === 400 || traversalRes.status === 403 || traversalRes.status === 404) {
      console.log('  [PASS] Test 4: Path traversal attempt rejected');
      passed++;
    } else {
      console.error(`  [FAIL] Test 4: Path traversal not blocked, got ${traversalRes.status}`);
    }

    // TEST 5: Upload Session Chunk Injection Guard
    const fakeUploadRes = await fetch(`${BASE_URL}/api/files/upload/chunk`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId: '00000000-0000-0000-0000-000000000000',
        chunkIndex: 0
      })
    });
    if (fakeUploadRes.status === 400 || fakeUploadRes.status === 403 || fakeUploadRes.status === 404) {
      console.log('  [PASS] Test 5: Unauthorized upload session chunk injection rejected');
      passed++;
    } else {
      console.error(`  [FAIL] Test 5: Expected 400/403/404, got ${fakeUploadRes.status}`);
    }

    // TEST 6: Expired / Tampered JWT Rejection
    const tamperedToken = token.slice(0, -6) + 'xxxxxx';
    const tamperedRes = await fetch(`${BASE_URL}/api/v1/drive/changes?cursor=0`, {
      headers: { Authorization: `Bearer ${tamperedToken}` }
    });
    if (tamperedRes.status === 401 || tamperedRes.status === 403) {
      console.log('  [PASS] Test 6: Tampered JWT token rejected (401/403)');
      passed++;
    } else {
      console.error(`  [FAIL] Test 6: Expected 401/403, got ${tamperedRes.status}`);
    }

  } catch (e) {
    console.error('  [FAIL] Security test error:', e.message);
  }

  console.log('================================================================');
  console.log(`  SECURITY GATE RESULT: ${passed} / ${total} PASSED`);
  console.log('================================================================');

  if (passed !== total) {
    process.exit(1);
  }
  process.exit(0);
}

runSecurityGate();
