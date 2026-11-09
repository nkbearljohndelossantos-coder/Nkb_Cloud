# NKB CLOUD v2.1.0 — BINARY STREAMING & PERFORMANCE AUDIT
## Raw Data Transport, Memory Overhead, and Backpressure Architecture

**Organization:** NKB Manufacturing  
**Platform:** NKB Cloud Private Storage Platform  
**Target Scope:** `server/server.js`, `server/controllers/fileController.js`, `server/services/agentHub.js`, `storage-agent/src/file-engine.js`  
**Audit Classification:** Independent Read-Only Security & Performance Audit  
**Audit Date:** November 9, 2026  
**Auditor Verdict:** **FAIL (HIGH DEFECT PERF-01 IDENTIFIED)**

---

### 1. SCOPE & OBJECTIVE

This technical performance audit evaluates the file transfer engine, binary streaming pipelines, serialization formats, memory footprints, and backpressure behavior across the VPS server and the Windows Storage Agent.

The evaluation benchmarks:
1. Resumable chunked upload throughput and serialization overhead.
2. In-memory buffering via `express.raw()` vs. true Node.js streaming.
3. Base64 encoding over JSON WebSocket frames vs. native binary frames.
4. Memory allocation and heap limits under multi-gigabyte transfers (e.g., 5GB - 10GB disk images).
5. Concurrency behavior, event loop blocking, and backpressure mitigation.
6. HTTP Range streaming support and chunk assembly I/O patterns.

---

### 2. EMPIRICAL BENCHMARK EVIDENCE

An automated memory and payload profiling probe was executed using a standardized 10 MB binary payload (recorded in `server/audit_evidence_summary.json` Probe 3):

```json
{
  "probe3": {
    "rawChunkBytes": 10485760,
    "base64ChunkLength": 13981016,
    "overheadPercentage": 33,
    "jsonEnvelopeLength": 13981125,
    "memoryDeltaMB": 13
  }
}
```

#### Benchmark Metrics Summary:
- **Raw Chunk Size:** 10,485,760 bytes (10.00 MB)
- **Base64 String Size:** 13,981,016 bytes (13.33 MB)
- **Serialization Inflation:** **+33.33% network and memory bandwidth waste**
- **JSON WebSocket Envelope Size:** 13,981,125 bytes
- **Heap Allocation Delta:** **+13.0 MB per 10 MB chunk**

---

### 3. ARCHITECTURAL VULNERABILITY ANALYSIS

#### Finding PERF-01: Pseudo-Streaming, Base64 JSON Inflation & Absence of Backpressure
**Severity:** **HIGH (CVSS v3.1: 7.5 - Availability & Resource Exhaustion Risk)**

#### 3.1 Flaw 1: In-Memory Ingestion via `express.raw({ limit: '100mb' })`
In [`server/server.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/server.js#L30-L32):
```javascript
app.use(express.raw({ type: 'application/octet-stream', limit: '100mb' }));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
```

**Architectural Defect:**
`express.raw()` is **not streaming**. It forces the Node.js V8 runtime to read the entire HTTP request body off the network socket and allocate a single contiguous `Buffer` in RAM before the route handler is invoked. Under 20 concurrent users uploading 50 MB chunks, the VPS instantly consumes **1.0 GB to 1.5 GB of raw heap memory**, creating extreme garbage collection pauses and risking V8 heap out-of-memory crashes on resource-constrained VPS instances (such as 2 GB to 4 GB RAM Hostinger VPS).

#### 3.2 Flaw 2: Base64 String Transformation over WebSocket JSON Envelopes
In [`server/controllers/fileController.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/controllers/fileController.js#L302-L305):
```javascript
if (Buffer.isBuffer(req.body) && req.body.length > 0) {
  chunkBuffer = req.body;
  chunkBase64 = chunkBuffer.toString('base64');
}
```
And in [`server/services/agentHub.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/services/agentHub.js#L512-L523):
```javascript
// Handle both Buffer and Base64 string chunk data
const chunkBase64 = Buffer.isBuffer(chunkData) ? chunkData.toString('base64') : chunkData;

return await this.dispatchCommand(agentId, 'WRITE_CHUNK', {
  mountPath: volume.mount_path,
  relativePath,
  chunkIndex,
  chunkBase64,
  isLastChunk,
  chunkSha256
}, 45000);
```

**Memory Multiplier Analysis:**
When a 50 MB binary chunk is uploaded:
1. `express.raw` allocates a **50 MB Buffer**.
2. `chunkBuffer.toString('base64')` allocates a **66.7 MB UTF-16 V8 String**.
3. `JSON.stringify(envelope)` allocates another **66.7 MB String** for the WebSocket frame.
4. Total memory consumed for **one single 50 MB chunk** during transit: $\approx 183.4 \text{ MB}$ ($\mathbf{3.67\times}$ amplification).
5. On the Windows Storage Agent, `Buffer.from(chunkBase64, 'base64')` in [`storage-agent/src/file-engine.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/storage-agent/src/file-engine.js#L91) repeats this allocation in reverse.

#### 3.3 Flaw 3: Catastrophic Heap Exhaustion on Non-Ranged Large File Downloads
In [`server/controllers/fileController.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/controllers/fileController.js#L546-L574):
```javascript
let start = 0;
let end = fileSize > 0 ? fileSize - 1 : 0;
...
if (rangeHeader && fileSize > 0) {
  // partial range calculation
}
const chunkLength = fileSize > 0 ? (end - start + 1) : 0;
...
if (agentHub.hasConnectedAgent()) {
  const chunkRes = await agentHub.readChunkFromStorage(volume.id, file.relative_path, start, chunkLength);
  res.send(chunkRes.buffer);
}
```

**Catastrophic Failure Scenario (5 GB - 10 GB Large Files):**
- When a client issues a standard download request (no `Range` header), `chunkLength` equals the **entire file size** ($5\text{ GB}$).
- `readChunkFromStorage` asks the agent to read 5 GB in a single command.
- The agent reads 5 GB into RAM, converts it to Base64 ($\approx 6.67\text{ GB}$), which immediately **exceeds the V8 string length limit** (`ERR_STRING_TOO_LONG`, maximum string size $\approx 512\text{ MB}$ to $1\text{ GB}$) and crashes the process.
- Non-ranged downloads of files larger than 500 MB are completely broken under the current architecture.

#### 3.4 Flaw 4: Blocking Synchronous I/O in Chunk Assembly
In [`storage-agent/src/file-engine.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/storage-agent/src/file-engine.js#L116-L121):
```javascript
// Assemble all chunks in deterministic numeric order
for (const pFile of partFiles) {
  const pPath = path.join(partsDir, pFile);
  const data = fs.readFileSync(pPath); // SYNCHRONOUS BLOCKING READ
  hashStream.update(data);
  writeStream.write(data);
}
```

**Event Loop Starvation:**
On the final chunk of a multi-gigabyte upload containing hundreds of parts, `fs.readFileSync()` executes in a synchronous loop on the Node.js main thread. While this loop runs:
- The Windows Storage Agent cannot process heartbeats.
- The WebSocket connection times out on the VPS (`ping/pong` fails).
- The VPS marks the agent `OFFLINE`, aborting other concurrent transfers.

---

### 4. MEMORY & BANDWIDTH MULTIPLIER PROJECTION

| File / Chunk Size | Wire Transfer Size (Base64) | Network Waste | Node.js Heap Peak ($3.67\times$) | Outcome Under Current Engine |
|---|:---:|:---:|:---:|---|
| **5 MB Chunk** | 6.67 MB | +1.67 MB | ~18.3 MB | Operational |
| **20 MB Chunk** | 26.67 MB | +6.67 MB | ~73.4 MB | Operational |
| **50 MB Chunk** | 66.67 MB | +16.67 MB | ~183.5 MB | High GC Latency |
| **100 MB Chunk** | 133.33 MB | +33.33 MB | ~367.0 MB | Severe Memory Pressure |
| **1 GB File Download** | N/A (JSON Crash) | +333 MB | Crash | **FATAL:** `ERR_STRING_TOO_LONG` / OOM |
| **5 GB ISO Download** | N/A (JSON Crash) | +1.67 GB | Crash | **FATAL:** `ERR_STRING_TOO_LONG` / OOM |

---

### 5. MANDATORY PRODUCTION REMEDIATION

To achieve genuine enterprise-grade performance and support multi-gigabyte file transfers without memory exhaustion:

#### 1. Binary WebSocket Channels (Opcode `0x2`)
Eliminate Base64 encoding completely. Send binary payloads as native WebSocket binary frames:
- Format: `[16-byte Envelope Header: commandId + chunkIndex + flags][Raw Binary Bytes]`.
- Reduces network bandwidth by 33.3% and eliminates all string conversions.

#### 2. Streaming Request Ingestion with Backpressure
Remove `express.raw({ limit: '100mb' })` from chunk endpoints. Instead, pipe the raw incoming HTTP request stream directly to the WebSocket stream using Node.js `stream.pipeline()` with active backpressure:
```javascript
// Remediated Streaming Ingestion
import { pipeline } from 'node:stream/promises';
await pipeline(
  req,
  agentHub.createChunkWriteStream(agentId, { volumeId, relativePath, chunkIndex })
);
```

#### 3. Bounded Chunk Streaming on Large File Downloads
Never request more than 8 MB to 16 MB in a single `readChunk` command. On non-ranged downloads, `downloadFile` must loop through chunks sequentially using an asynchronous streaming generator and pipe each chunk to `res` with backpressure.

#### 4. Asynchronous Chunk Concatenation
Replace `fs.readFileSync` in `file-engine.js` with asynchronous streams:
```javascript
for (const pFile of partFiles) {
  await pipeline(
    fs.createReadStream(path.join(partsDir, pFile)),
    writeStream,
    { end: false }
  );
}
```

---

### 6. VERDICT

**FAIL.** Production deployment must remain blocked until PERF-01 is remediated to prevent memory exhaustion and catastrophic process termination during large file transfers.
