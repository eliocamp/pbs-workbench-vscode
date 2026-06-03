"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkbenchManager = void 0;
exports.timeRemaining = timeRemaining;
exports.ramUsedGb = ramUsedGb;
exports.ramTotalGb = ramTotalGb;
const vscode = require("vscode");
const cp = require("child_process");
/** Derived values computed from raw WorkbenchInfo */
function timeRemaining(info) {
    return Math.max(0, info.requested.walltime - info.used.walltime);
}
function ramUsedGb(info) {
    return info.used.memory / 1024 ** 3;
}
function ramTotalGb(info) {
    return info.requested.memory / 1024 ** 3;
}
class WorkbenchManager {
    constructor() {
        this.cachedInfo = null;
        this.sshHost = "gadi.nci.org.au";
        this.outputChannel = vscode.window.createOutputChannel("HPC Workbench");
    }
    /** Run `job api <subcommand>` on the HPC and return parsed JSON */
    async runApi(subcommand) {
        return new Promise((resolve) => {
            const cmd = `ssh ${this.sshHost} "job api ${subcommand}"`;
            this.outputChannel.appendLine(`Running: ${cmd}`);
            cp.exec(cmd, { timeout: 15000 }, (err, stdout, stderr) => {
                this.outputChannel.appendLine(`stdout: ${stdout}`);
                this.outputChannel.appendLine(`stderr: ${stderr}`);
                if (err) {
                    this.outputChannel.appendLine(`error: ${err.message}`);
                    resolve({ error: stderr || err.message });
                    return;
                }
                try {
                    resolve(JSON.parse(stdout.trim()));
                }
                catch {
                    resolve({ error: `Invalid JSON response: ${stdout}` });
                }
            });
        });
    }
    /** Fetch current workbench info. Returns null if no workbench is running. */
    async fetchInfo() {
        const response = await this.runApi("info");
        if (response.error || !response.output) {
            this.cachedInfo = null;
            return null;
        }
        this.cachedInfo = response.output;
        return this.cachedInfo;
    }
    /** Start a new workbench */
    async start() {
        vscode.window.showInformationMessage("Workbench starting. Status will update shortly.");
        const response = await this.runApi("start");
        if (response.error) {
            vscode.window.showErrorMessage(`Failed to start workbench: ${response.error}`);
            return;
        }
    }
    /** End the running workbench */
    async end() {
        const response = await this.runApi("end");
        if (response.error) {
            vscode.window.showErrorMessage(`Failed to end workbench: ${response.error}`);
            return;
        }
        this.cachedInfo = null;
        vscode.window.showInformationMessage("Workbench ended.");
    }
}
exports.WorkbenchManager = WorkbenchManager;
//# sourceMappingURL=workbenchManager.js.map