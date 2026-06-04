import * as vscode from "vscode";
import * as cp from "child_process";

export interface WorkbenchInfo {
  job_id: string;
  hostname: string;
  state: string;            // PBS state: Q, R, H, E, etc.
  queue: string;
  su: number;
  jobdir: string;
  requested: {
    walltime: number;       // seconds
    memory: number;         // bytes
    ncpus: number;
  };
  used: {
    walltime: number;       // seconds
    memory: number;         // bytes
    cpu: number;            // percentage
  };
}

interface FetchResult {
  info: WorkbenchInfo | null;
  age: number;  // consecutive errors since last successful fetch
}

/** Derived values computed from raw WorkbenchInfo */
export function timeRemaining(info: WorkbenchInfo): number {
  return Math.max(0, info.requested.walltime - info.used.walltime);
}

export function ramUsedGb(info: WorkbenchInfo): number {
  return info.used.memory / 1024 ** 3;
}

export function ramTotalGb(info: WorkbenchInfo): number {
  return info.requested.memory / 1024 ** 3;
}

interface ApiResponse {
  output: WorkbenchInfo[];
  error?: string;
}

export class WorkbenchManager {
  public cachedInfo: WorkbenchInfo | null = null;
  private consecutiveErrors = 0;
  private readonly maxRetries = 5;

  private readonly sshHost = "gadi.nci.org.au";
  readonly outputChannel = vscode.window.createOutputChannel("PBS Workbench");
  private log(message: string): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] ${message}`);
  }

  /** Run `job api <subcommand>` on the HPC and return parsed JSON */
  private async runApi(subcommand: string): Promise<ApiResponse> {
    return new Promise((resolve) => {
      const cmd = `ssh ${this.sshHost} "job api ${subcommand}"`;
      this.log(`Running: ${cmd}`);
      cp.exec(cmd, { timeout: 15000 }, (err, stdout, stderr) => {
        this.log(`stdout: ${stdout}`);
        if (err) {
          this.log(`error: ${err.message}`);
          resolve({ error: stderr || err.message, output: []});
          return;
        }
        try {
          resolve(JSON.parse(stdout.trim()));
        } catch {
          resolve({ error: `Invalid JSON response: ${stdout}`, output: []});
        }
      });
    });
  }

  /** Fetch current workbench info. Returns null if no workbench is running. */
  async fetchInfo(): Promise<FetchResult | null> {
    const response = await this.runApi("info");

    if (response.error) {
      // Keep state if there's an error. 
      this.consecutiveErrors++;
      this.log(`Error contacting gadi (${this.consecutiveErrors}/${this.maxRetries})`)
      if (this.consecutiveErrors >= this.maxRetries) {
        this.log(`Max retries reached (${this.maxRetries})`)
        this.cachedInfo = null;
        this.consecutiveErrors = 0;
        return null
      }

      return {info: this.cachedInfo, age: this.consecutiveErrors}
    }
    this.consecutiveErrors = 0;

    if (response.output.length == 0) {
      this.cachedInfo = null;
      return null;
    }

    this.cachedInfo = response.output[0];
    return {info: this.cachedInfo, age: 0}
  }

  /** Start a new workbench */
  async start(): Promise<void> {
    vscode.window.showInformationMessage("Workbench starting. Status will update shortly.");
    const response = await this.runApi("start");

    if (response.error) {
      vscode.window.showErrorMessage(`Failed to start workbench: ${response.error}`);
      return;
    }
  }

  /** End the running workbench */
  async end(): Promise<void> {
    const response = await this.runApi("end");

    if (response.error) {
      vscode.window.showErrorMessage(`Failed to end workbench: ${response.error}`);
      return;
    }

    this.cachedInfo = null;
    vscode.window.showInformationMessage("Workbench ended.");
  }
}
