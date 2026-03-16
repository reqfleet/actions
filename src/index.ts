import * as core from '@actions/core';
import * as child_process from 'child_process';
import * as https from 'https';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Helper function to execute commands safely without a shell
async function execCommand(file: string, args: string[], options?: child_process.ExecFileOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    child_process.execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout: stdout.toString(), stderr: stderr.toString() });
      } else {
        resolve(stdout.toString().trim());
      }
    });
  });
}

// Helper function to download a file
async function downloadFile(url: string, destination: string): Promise<void> {
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
function parseLatencyThreshold(input: string): { avg?: number; p50?: number; p90?: number; p95?: number; p99?: number } {
  const thresholds: { avg?: number; p50?: number; p90?: number; p95?: number; p99?: number } = {};
  input.split(',').forEach(part => {
    const [key, value] = part.split(':');
    if (key && value) {
      const msValue = parseFloat(value.replace('ms', ''));
      if (!isNaN(msValue)) {
        if (key === 'avg') thresholds.avg = msValue;
        if (key === 'p50') thresholds.p50 = msValue;
        if (key === 'p90') thresholds.p90 = msValue;
        if (key === 'p95') thresholds.p95 = msValue;
        if (key === 'p99') thresholds.p99 = msValue;
      }
    }
  });
  return thresholds;
}

// Helper to parse status threshold string like "200=100%,401<10%"
function parseStatusThreshold(input: string): { [statusCode: string]: { value: number; operator: string } } {
  const thresholds: { [statusCode: string]: { value: number; operator: string } } = {};
  input.split(',').forEach(part => {
    // Relaxed regex to allow non-numeric status codes/exceptions
    const match = part.trim().match(/^(.+?)\s*(>=|<=|>|<|=)\s*([\d.]+)%?$/);
    if (match) {
      const [, statusCode, operator, percentage] = match;
      const percentValue = parseFloat(percentage);
      if (!isNaN(percentValue)) {
        thresholds[statusCode] = { value: percentValue, operator };
      }
    }
  });
  return thresholds;
}

function checkThresholds(summaryData: any, latencyThresholdInput: string, statusThresholdInput: string): boolean {
  let thresholdExceeded = false;
  const total = summaryData.total || 0;
  if (total === 0) return false;

  const parsedLatencyThresholds = latencyThresholdInput ? parseLatencyThreshold(latencyThresholdInput) : {};
  const parsedStatusThresholds = statusThresholdInput ? parseStatusThreshold(statusThresholdInput) : {};

  // Check Latency Thresholds
  if (summaryData.latency_ms) {
    for (const key of ['avg', 'p50', 'p90', 'p95', 'p99'] as const) {
      const actual = summaryData.latency_ms[key];
      const threshold = parsedLatencyThresholds[key];
      if (actual !== undefined && threshold !== undefined && actual > threshold) {
        core.error(`Latency threshold exceeded: ${key} actual ${actual.toFixed(2)}ms > threshold ${threshold}ms`);
        thresholdExceeded = true;
      }
    }
  }

  // Check Status Code Thresholds
  if (Object.keys(parsedStatusThresholds).length > 0) {
    for (const [statusCode, thresholdData] of Object.entries(parsedStatusThresholds)) {
      const statusMetric = summaryData.status?.find((s: any) => String(s.status) === statusCode);
      const actualRatio = statusMetric ? statusMetric.ratio * 100 : 0;
      const { value: threshold, operator } = thresholdData;

      let isThresholdMet = true;
      switch (operator) {
        case '>=': isThresholdMet = actualRatio >= threshold; break;
        case '<=': isThresholdMet = actualRatio <= threshold; break;
        case '>':  isThresholdMet = actualRatio > threshold; break;
        case '<':  isThresholdMet = actualRatio < threshold; break;
        case '=':  isThresholdMet = Math.abs(actualRatio - threshold) < 0.001; break;
      }

      if (!isThresholdMet) {
        core.error(`Status code threshold not met for ${statusCode}: actual ${actualRatio.toFixed(2)}% is not ${operator} ${threshold}%`);
        thresholdExceeded = true;
      }
    }
  }

  return thresholdExceeded;
}


async function run() {
  let rqtPath: string = ''; // Declare outside try for finally block access
  let collectionId: string = '';
  try {
    collectionId = core.getInput('collection_id', { required: true });
    const apiKey = core.getInput('api_key', { required: true });
    core.setSecret(apiKey);
    const reqfleetApiEndpoint = core.getInput('reqfleet_api_endpoint'); // New input
    const failOnOverThreshold = core.getBooleanInput('fail_on_over_threshold');
    const latencyThresholdInput = core.getInput('latency_threshold');
    const statusThresholdInput = core.getInput('status_threshold');

    core.info(`Reqfleet Action Inputs:`);
    core.info(`  collection-id: ${collectionId}`);
    core.info(`  api_key: ***${apiKey.substring(apiKey.length - 4)}`); // Mask API key for logs
    if (reqfleetApiEndpoint) {
      core.info(`  reqfleet_api_endpoint: ${reqfleetApiEndpoint}`);
    }
    core.info(`  fail_on_over_threshold: ${failOnOverThreshold}`);
    core.info(`  latency_threshold: ${latencyThresholdInput || 'N/A'}`);
    core.info(`  status_threshold: ${statusThresholdInput || 'N/A'}`);

    // Determine OS and architecture for rqt CLI
    let platform: string;
    let arch: string;

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
      await execCommand('chmod', ['+x', rqtPath]);
      core.info(`Made ${rqtPath} executable.`);
    }

    // Set REQFLEET_API_KEY environment variable
    process.env.REQFLEET_API_KEY = apiKey;
    core.info('REQFLEET_API_KEY set as environment variable.');

    // Set REQFLEET_API_ENDPOINT environment variable if provided
    if (reqfleetApiEndpoint) {
      process.env.REQFLEET_API_ENDPOINT = reqfleetApiEndpoint;
      core.info('REQFLEET_API_ENDPOINT set as environment variable.');
    }

    // Execute rqt collection launch
    core.info(`Attempting to launch collection: ${collectionId}`);
    try {
      const launchOutput = await execCommand(rqtPath, ['collection', 'launch', `--collection-id=${collectionId}`]);
      core.info(`rqt collection launch output: ${launchOutput}`);
    } catch (launchError: any) {
      core.error(`Launch Command failed. Stderr: ${launchError.stderr}`);
      core.setFailed(`Failed to launch collection: ${launchError.error?.message || launchError}`);
      return;
    }

    // Implement trigger loop with timeout (6 minutes)
    const startTimeTrigger = Date.now();
    const timeoutTrigger = 6 * 60 * 1000; // 6 minutes in milliseconds
    let triggered = false;
    let lastTriggerError: any = null;

    core.info(`Attempting to trigger collection '${collectionId}' (timeout: 6 minutes)...`);
    while (Date.now() - startTimeTrigger < timeoutTrigger) {
      try {
        const triggerOutput = await execCommand(rqtPath, ['collection', 'trigger', `--collection-id=${collectionId}`]);
        core.info(`rqt collection trigger output: ${triggerOutput}`);
        triggered = true;
        break;
      } catch (triggerError: any) {
        lastTriggerError = triggerError;
        // Suppress errors during retry as requested
        core.info(`Trigger attempt failed. Retrying... Stderr: ${triggerError.stderr}`);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retrying
      }
    }

    if (!triggered) {
      if (lastTriggerError) {
        core.error(`Trigger Command failed finally. Stderr: ${lastTriggerError.stderr}`);
      }
      core.setFailed(`Timed out after 6 minutes waiting to trigger collection '${collectionId}'. ${lastTriggerError ? (lastTriggerError.error?.message || lastTriggerError) : ''}`);
      return;
    }
    core.info(`Collection '${collectionId}' successfully triggered.`);

    // --- Monitoring summary in a loop ---
    core.info(`Monitoring run summary for collection: ${collectionId}`);
    let summaryData: any;
    let isRunning = true;

    while (isRunning) {
      let summaryOutput = '';
      try {
        summaryOutput = await execCommand(rqtPath, ['collection', 'run_summary', `--collection-id=${collectionId}`]);
      } catch (summaryError: any) {
        core.error(`Summary Command failed. Stderr: ${summaryError.stderr}`);
        core.setFailed(`Failed to retrieve run summary: ${summaryError.error?.message || summaryError}`);
        return;
      }

      try {
        summaryData = JSON.parse(summaryOutput);
      } catch (parseError: any) {
        core.setFailed(`Failed to parse run summary JSON: ${parseError.message}`);
        return;
      }

      isRunning = summaryData.is_running === true;

      // Log current summary
      let currentSummaryLog = `Reqfleet test run_id: ${summaryData.run_id || 'N/A'}`;
      if (summaryData.latency_ms) {
        currentSummaryLog += ` | Latency: `;
        const latencyParts = Object.entries(summaryData.latency_ms).map(([key, value]) => `${key}=${(value as number).toFixed(2)}ms`);
        currentSummaryLog += latencyParts.join(', ');
      }
      if (summaryData.status && summaryData.status.length > 0) {
        currentSummaryLog += ` | Status: `;
        summaryData.status.forEach((s: any) => {
          currentSummaryLog += `${s.status}:${(s.ratio * 100).toFixed(2)}% `;
        });
      }
      core.info(`Current Summary [running=${isRunning}]: ${currentSummaryLog}`);

      // Early threshold check
      if (failOnOverThreshold && checkThresholds(summaryData, latencyThresholdInput, statusThresholdInput)) {
        core.setFailed('Reqfleet test thresholds exceeded during run.');
        return;
      }

      if (isRunning) {
        await new Promise(resolve => setTimeout(resolve, 10000)); // Poll every 10 seconds
      }
    }

    core.info('Collection has finished running.');

    // Set final outputs
    let finalSummary = `Reqfleet test run_id: ${summaryData.run_id || 'N/A'}`;
    if (summaryData.latency_ms) {
      finalSummary += `\nLatency: `;
      const latencyParts = Object.entries(summaryData.latency_ms).map(([key, value]) => `${key}=${(value as number).toFixed(2)}ms`);
      finalSummary += latencyParts.join(', ');
    }
    if (summaryData.status && summaryData.status.length > 0) {
      finalSummary += `\nStatus Codes: `;
      summaryData.status.forEach((s: any) => {
        finalSummary += `${s.status}:${(s.ratio * 100).toFixed(2)}% `;
      });
    }
    core.setOutput('summary', finalSummary);

    // --- Final Threshold Checking Logic ---
    const totalFinal = summaryData.total || 0;
    core.info(`Final Threshold Check: fail_on_over_threshold=${failOnOverThreshold}, total_requests=${totalFinal}`);
    if (failOnOverThreshold && checkThresholds(summaryData, latencyThresholdInput, statusThresholdInput)) {
      core.setFailed('Reqfleet test thresholds exceeded.');
      return;
    }


  } catch (error: any) {
    core.setFailed(error.message);
  } finally {
    // Purge resources if collectionId and rqtPath are available
    if (collectionId && rqtPath && fs.existsSync(rqtPath)) {
      core.info(`Purging resources for collection: ${collectionId}`);
      try {
        await execCommand(rqtPath, ['collection', 'purge', `--collection-id=${collectionId}`]);
        core.info(`Successfully purged resources.`);
      } catch (purgeError: any) {
        core.warning(`Failed to purge resources: ${purgeError.error?.message || purgeError}`);
      }
    }

    // Clean up the downloaded rqt binary
    try {
      if (rqtPath && fs.existsSync(rqtPath)) {
        fs.unlinkSync(rqtPath);
        core.info(`Cleaned up downloaded rqt CLI: ${rqtPath}`);
      }
    } catch (cleanupError: any) {
      core.warning(`Failed to clean up rqt CLI: ${cleanupError.message}`);
    }
  }
}

run();
