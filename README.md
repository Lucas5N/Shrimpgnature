# 🦐 Shrimpgnature — Cryptographic Document Notary & Queueing Simulator

**Shrimpgnature** is a browser-based simulation of a **Central Notary Authority** built with vanilla ES modules, the **WebCrypto API**, and **Web Workers**. It demonstrates how digital signatures and cryptographic hash chains work together to create an ordered, tamper-evident audit ledger, while modelling the notary server as a single-server FIFO queue to evaluate **M/M/1** and **M/G/1** performance under Poisson traffic.

---

## ✨ Features

* **Dual-Algorithm Document Signing (WebCrypto API)**
  * **ECDSA (P-256)** with SHA-256
  * **RSA-PSS (4096-bit modulus, saltLength 32)** with SHA-256
  * Supports both synthetic document digests and **local file notarization** (files are hashed client-side via SHA-256 and never leave your machine).
* **Tamper-Evident Hash Chain Ledger**
  * Links every receipt sequentially: `chainHash = SHA-256(prevHash + signatureHex + docDigestHex)` starting from a 64-zero genesis hash.
  * **Two-Layer Audit Verification**:
    * **Layer 1 (Hash Chain Links):** Detects broken links or modified digests.
    * **Layer 2 (Digital Signatures):** Verifies individual signatures against the authority's SPKI public keys.
* **Interactive Attack Simulations**
  * **Naive Tampering:** Alters the last document digest (`tamperLastDigest`), breaking Layer 1.
  * **History-Rewriting Attack:** Alters a target block's digest and recalculates every downstream chain hash (`rewriteHistory`). Layer 1 passes, but Layer 2 catches the signature forgery.
* **Single-Server Queueing & Live Telemetry**
  * Asynchronous FIFO queue (`IDLE` / `PROCESSING`) dispatching jobs to a dedicated Web Worker.
  * Synthetic **Poisson traffic generator** ($\lambda \in [1, 500]\text{ req/s}$, $N \in [10, 1000]$) using inverse-transform exponential inter-arrival delays.
  * Real-time KPIs ($\rho$, $\mu$, $\bar{S}$, queue depth $L_q$) over a $100$-sample sliding window, live **Chart.js** plot comparing empirical $W_q$ against **M/M/1** and **M/G/1 (Pollaczek–Khinchine)** predictions, and **CSV export**.

---

## 🏗️ System Architecture

```text
  [ Local File / Sign Button / Poisson Generator ]
                        │
                        ▼  SHA-256 digest + algorithm
              [ FIFO Server (Main Thread) ]
               stamps tArrival & tQueueExit
                        │
                        ▼  postMessage("SIGN_REQUEST")
       [ Central Notary Authority (Web Worker) ]
        crypto.subtle.sign() + computeChainHash()
                        │
                        ▼  postMessage("SIGN_SUCCESS")
        [ Audit Ledger + Telemetry Window + Chart.js ]
```

### Project Structure

```text
├── index.html               # UI layout and Chart.js script import
├── main.js                  # Application wiring, worker plumbing, and event listeners
├── worker/
│   ├── worker.js            # Web Worker message handler (INIT / SIGN)
│   └── authority.js         # Keypair generation, ECDSA/RSA-PSS signing, chain hashing
├── queue/
│   └── fifoServer.js        # Pure FIFO queue & IDLE/PROCESSING state machine
├── sim/
│   └── poissonGenerator.js  # Exponential inter-arrival traffic generator
├── stats/
│   └── queueStats.js        # Sliding-window telemetry, M/M/1 & M/G/1 calculations
├── ledger/
│   ├── auditLog.js          # Layer 1 (hash chain) & Layer 2 (signature) verification
│   └── attacks.js           # Naive tampering & history-rewriting attack helpers
├── lib/
│   ├── encoding.js          # Base64, Hex, and WebCrypto SHA-256 helpers
│   └── chain.js             # Genesis hash and chain-hashing rules
└── ui/
    ├── auditTable.js        # Ledger table rendering & Verify/Rewrite row actions
    ├── chart.js             # Live Chart.js plot (Empirical vs. M/M/1 vs. M/G/1)
    ├── telemetry.js         # KPI cards (Utilization, Service Rate, Mean S, Queue Depth)
    ├── terminal.js          # Timestamped console log output
    └── format.js            # Filename truncation helper
```

---

## 🚀 Getting Started

Because the project uses native **ES Modules** and **Web Workers**, opening `index.html` directly via `file://` will fail due to browser CORS restrictions. You **must** serve the directory over a local HTTP server using `npx serve .`:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Lucas5N/Shrimpgnature.git
   cd <your-repo>
   ```

2. **Start the local server:**
   ```bash
   npx serve .
   ```
   *(Requires [Node.js](https://nodejs.org/). No `npm install` or build step is needed.)*

3. **Open in your browser:**
   Navigate to `http://localhost:3000` (the default port for `serve`) and wait for the status badge to switch to `ONLINE` once the Web Worker finishes generating its ECDSA and 4096-bit RSA-PSS keypairs.

---

## 🧪 Usage Guide

### 1. Notarize Documents
* **Local File:** Click **Choose file** to hash any file locally in the browser and submit its SHA-256 digest for signing.
* **Quick Test:** Select `ECDSA (P-256)` or `RSA-PSS` and click **Sign Single Doc** to submit a synthetic digest.

### 2. Test Tamper Detection
1. Sign at least 2–3 documents so entries appear in the audit table.
2. **Naive Tampering:** Trigger the tamper action to alter the latest block's digest, then click **Verify Chain** — Layer 1 immediately flags the broken hash link.
3. **History-Rewriting Attack:** Click **Rewrite** on any row in the audit table to mutate its digest *and* recompute all subsequent chain hashes. Click **Verify Chain** — Layer 1 reports `VALID`, while Layer 2 catches the forged signature at that exact sequence index.

### 3. Run Queueing & Load Benchmarks
1. Select an algorithm (`ECDSA (P-256)` or `RSA-PSS`).
2. Adjust **$\lambda$ (req/s)** and **Total Req**, then click **Start Workload** (or call `window.startPoissonTraffic(lambda, total, "RSA-PSS")` in DevTools).
3. Telemetry cards and the chart begin updating once at least **5 samples** have completed.
4. Click **Export CSV** when finished to download per-request timestamps, wait times, service times, and model predictions.

> **Benchmarking Tip:** Always refresh the page between separate load tests so the $100$-sample sliding window and DOM ledger start clean without carryover from the previous run.

---

## 📐 Cryptographic & Queueing Models

* **Utilization & Service Rate:** $\mu = 1 / \bar{S}$, $\rho = \lambda / \mu$
* **M/M/1 Expected Queue Wait:**
  $$W_q^{\text{M/M/1}} = \frac{\rho}{\mu (1 - \rho)} \quad (\rho < 1)$$
* **M/G/1 Expected Queue Wait (Pollaczek–Khinchine):**
  $$W_q^{\text{M/G/1}} = \frac{\lambda (\sigma_S^2 + \bar{S}^2)}{2 (1 - \rho)} \quad (\rho < 1)$$
* When $\rho \ge 1.0$, steady-state predictions return `Infinity` (rendered as gaps on the chart).
* Because cryptographic signing times exhibit very low variance ($C_S^2 = \sigma_S^2 / \bar{S}^2 \ll 1$, nearly deterministic), empirical sub-critical waiting times align closely with **M/G/1** ($\approx \frac{1}{2} W_q^{\text{M/M/1}}$) rather than the exponential **M/M/1** model.

---

## ⚠️ Known Browser Simulation Constraints

* **Timer Clamping:** Browsers clamp nested `setTimeout` calls in `poissonGenerator.js` to a $\ge 4\text{ ms}$ minimum interval ($\approx 200\text{–}250\text{ req/s}$ practical ceiling).
* **Timer Quantization:** `performance.now()` is quantized to $\approx 0.1\text{ ms}$ in modern browsers for Spectre mitigation, which affects sub-millisecond ECDSA timing granularity.
* **DOM Re-rendering at High $N$:** `auditTable.render()` re-renders all accumulated rows on each completion, which adds main-thread latency once the table grows beyond several hundred rows.
