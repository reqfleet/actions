"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const child_process = __importStar(require("child_process"));
const https = __importStar(require("https"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
// Helper function to execute shell commands
async function execCommand(command, options) {
    return new Promise((resolve, reject) => {
        child_process.exec(command, options, (error, stdout, stderr) => {
            if (error) {
                core.error(`Command failed: ${command}`);
                core.error(`Stderr: ${stderr}`);
                reject(error);
            }
            else {
                resolve(stdout.toString().trim());
            }
        });
    });
}
// Helper function to download a file
async function downloadFile(url, destination) {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            if (response.statusCode && (response.statusCode < 200 || response.statusCode >= 300)) {
                return reject(new Error(`Failed to download '${url}'. Status Code: ${response.statusCode}`));
            }
            const file = fs.createWriteStream(destination);
            response.pipe(file);
            file.on('finish', () => resolve());
            file.on('error', (err) => {
                fs.unlink(destination, () => reject(err)); // Delete the file if an error occurs
            });
        }).on('error', (err) => reject(err));
    });
}
// Helper to parse latency threshold string like "avg:50ms,p50:50ms,p99:100ms"
function parseLatencyThreshold(input) {
    const thresholds = {};
    input.split(',').forEach(part => {
        const [key, value] = part.split(':');
        if (key && value) {
            const msValue = parseFloat(value.replace('ms', ''));
            if (!isNaN(msValue)) {
                if (key === 'avg')
                    thresholds.avg = msValue;
                if (key === 'p50')
                    thresholds.p50 = msValue;
                if (key === 'p90')
                    thresholds.p90 = msValue;
                if (key === 'p95')
                    thresholds.p95 = msValue;
                if (key === 'p99')
                    thresholds.p99 = msValue;
            }
        }
    });
    return thresholds;
}
// Helper to parse status threshold string like "200:100%,400:0%"
function parseStatusThreshold(input) {
    const thresholds = {};
    input.split(',').forEach(part => {
        const [statusCode, percentage] = part.split(':');
        if (statusCode && percentage) {
            const percentValue = parseFloat(percentage.replace('%', ''));
            if (!isNaN(percentValue)) {
                thresholds[statusCode] = percentValue;
            }
        }
    });
    return thresholds;
}
async function run() {
    let rqtPath = ''; // Declare outside try for finally block access
    try {
        const collectionId = core.getInput('collection_id', { required: true });
        const apiKey = core.getInput('api_key', { required: true });
        const failOnOverThreshold = core.getBooleanInput('fail_on_over_threashold');
        const latencyThresholdInput = core.getInput('latency_threashold');
        const statusThresholdInput = core.getInput('status_threadshold');
        // const rawMetrics = core.getBooleanInput('raw_metrics'); // Removed as per request
        core.info(`Reqfleet Action Inputs:`);
        core.info(`  collection_id: ${collectionId}`);
        core.info(`  api_key: ***${apiKey.substring(apiKey.length - 4)}`); // Mask API key for logs
        core.info(`  fail_on_over_threashold: ${failOnOverThreshold}`);
        core.info(`  latency_threashold: ${latencyThresholdInput || 'N/A'}`);
        core.info(`  status_threadshold: ${statusThresholdInput || 'N/A'}`);
        // core.info(`  raw_metrics: ${rawMetrics}`); // Removed as per request
        // Determine OS and architecture for rqt CLI
        let platform;
        let arch;
        switch (os.platform()) {
            case 'linux':
                platform = 'linux';
                break;
            case 'win32':
                platform = 'windows';
                break;
            default:
                throw new Error(`Unsupported OS: ${os.platform()}`);
        }
        switch (os.arch()) {
            case 'x64':
                arch = 'amd64';
                break;
            case 'arm64':
                arch = 'arm64';
                break;
            default:
                throw new Error(`Unsupported architecture: ${os.arch()}`);
        }
        const rqtCliFileName = platform === 'windows' ? 'rqt.exe' : 'rqt';
        const rqtDownloadUrl = `https://blackhole.reqfleet.io/rqt-cli/latest/${platform}-${arch}/${rqtCliFileName}`;
        rqtPath = path.join(os.tmpdir(), rqtCliFileName); // Assign to rqtPath here
        core.info(`Downloading rqt CLI from: ${rqtDownloadUrl}`);
        await downloadFile(rqtDownloadUrl, rqtPath);
        core.info(`rqt CLI downloaded to: ${rqtPath}`);
        // Make the CLI executable (only for non-Windows)
        if (platform !== 'windows') {
            await execCommand(`chmod +x ${rqtPath}`);
            core.info(`Made ${rqtPath} executable.`);
        }
        // Set REQFLEET_API_KEY environment variable
        process.env.REQFLEET_API_KEY = apiKey;
        core.info('REQFLEET_API_KEY set as environment variable.');
        // Execute rqt collection launch
        core.info(`Attempting to launch collection: ${collectionId}`);
        try {
            const launchOutput = await execCommand(`${rqtPath} collection launch --collection_id=${collectionId}`);
            core.info(`rqt collection launch output: ${launchOutput}`);
        }
        catch (launchError) {
            core.setFailed(`Failed to launch collection: ${launchError.message}`);
            return;
        }
        // Implement trigger loop with timeout (6 minutes)
        const startTime = Date.now();
        const timeout = 6 * 60 * 1000; // 6 minutes in milliseconds
        let triggered = false;
        core.info(`Attempting to trigger collection '${collectionId}' (timeout: 6 minutes)...`);
        while (Date.now() - startTime < timeout) {
            try {
                const triggerOutput = await execCommand(`${rqtPath} collection trigger --collection_id=${collectionId}`);
                core.info(`rqt collection trigger output: ${triggerOutput}`);
                // Assuming successful trigger if no error is thrown
                triggered = true;
                break;
            }
            catch (triggerError) {
                core.info(`Collection trigger failed, retrying... Error: ${triggerError.message}`);
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retrying
            }
        }
        if (!triggered) {
            core.setFailed(`Timed out after 6 minutes waiting to trigger collection '${collectionId}'.`);
            return;
        }
        core.info(`Collection '${collectionId}' successfully triggered.`);
        // --- Retrieve and process summary ---
        core.info(`Retrieving run summary for collection: ${collectionId}`);
        let summaryOutput = '';
        try {
            summaryOutput = await execCommand(`${rqtPath} collection run_summary --collection_id=${collectionId}`);
            core.info(`rqt collection run_summary output: ${summaryOutput}`);
        }
        catch (summaryError) {
            core.setFailed(`Failed to retrieve run summary: ${summaryError.message}`);
            return;
        }
        let summaryData;
        try {
            summaryData = JSON.parse(summaryOutput);
            core.info('Successfully parsed run summary.');
        }
        catch (parseError) {
            core.setFailed(`Failed to parse run summary JSON: ${parseError.message}`);
            return;
        }
        // Set raw metrics output if requested - REMOVED
        // Default summary output
        let finalSummary = `Reqfleet test run_id: ${summaryData.run_id || 'N/A'}`;
        if (summaryData.latency_ms) {
            finalSummary += `\nLatency: avg=${summaryData.latency_ms.avg?.toFixed(2)}ms, p50=${summaryData.latency_ms.p50?.toFixed(2)}ms, p99=${summaryData.latency_ms.p99?.toFixed(2)}ms`;
        }
        if (summaryData.status && summaryData.status.length > 0) {
            finalSummary += `\nStatus Codes: `;
            summaryData.status.forEach((s) => {
                finalSummary += `${s.status}:${(s.ratio * 100).toFixed(2)}% `;
            });
        }
        core.setOutput('summary', finalSummary);
        // --- Threshold Checking Logic ---
        if (failOnOverThreshold) {
            let thresholdExceeded = false;
            const parsedLatencyThresholds = latencyThresholdInput ? parseLatencyThreshold(latencyThresholdInput) : {};
            const parsedStatusThresholds = statusThresholdInput ? parseStatusThreshold(statusThresholdInput) : {};
            // Check Latency Thresholds
            if (summaryData.latency_ms) {
                for (const key of ['avg', 'p50', 'p90', 'p95', 'p99']) {
                    const actual = summaryData.latency_ms[key];
                    const threshold = parsedLatencyThresholds[key];
                    if (actual !== undefined && threshold !== undefined && actual > threshold) {
                        core.error(`Latency threshold exceeded: ${key} actual ${actual.toFixed(2)}ms > threshold ${threshold}ms`);
                        thresholdExceeded = true;
                    }
                }
            }
            // Check Status Code Thresholds
            if (summaryData.status && summaryData.status.length > 0) {
                for (const statusMetric of summaryData.status) {
                    const statusCode = statusMetric.status;
                    const actualRatio = statusMetric.ratio * 100; // Convert to percentage
                    const threshold = parsedStatusThresholds[statusCode];
                    if (threshold !== undefined && actualRatio < threshold) {
                        core.error(`Status code threshold exceeded for ${statusCode}: actual ${actualRatio.toFixed(2)}% < threshold ${threshold}%`);
                        thresholdExceeded = true;
                    }
                }
            }
            if (thresholdExceeded) {
                core.setFailed('Reqfleet test thresholds exceeded.');
                return;
            }
            else {
                core.info('All Reqfleet test thresholds passed.');
            }
        }
    }
    catch (error) {
        core.setFailed(error.message);
    }
    finally {
        // Clean up the downloaded rqt binary
        try {
            if (rqtPath && fs.existsSync(rqtPath)) {
                fs.unlinkSync(rqtPath);
                core.info(`Cleaned up downloaded rqt CLI: ${rqtPath}`);
            }
        }
        catch (cleanupError) {
            core.warning(`Failed to clean up rqt CLI: ${cleanupError.message}`);
        }
    }
}
run();
