"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusBarController = void 0;
exports.suIncurred = suIncurred;
const vscode = require("vscode");
const workbenchManager_1 = require("./workbenchManager");
// Colour thresholds for time remaining
const WARN_SECONDS = 3600;
const DANGER_SECONDS = 3600 / 2;
const FAST_POLL_MS = 10000; // 10s while queued
const NORMAL_POLL_MS = 60000; // 60s while running
const STATE_LABELS = {
    Q: "Queued",
    R: "Running",
    H: "Held",
    E: "Exiting",
};
class StatusBarController {
    constructor(manager) {
        this.currentPollMs = NORMAL_POLL_MS;
        this.lastState = null;
        this.manager = manager;
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 10);
        this.statusBarItem.command = "workbench.showActions";
    }
    async refresh() {
        this.showRefreshing();
        const prevState = this.lastState;
        const info = await this.manager.fetchInfo();
        if (!info) {
            this.lastState = null;
            this.hide();
            return;
        }
        this.lastState = info.state;
        this.update(info);
        this.ensurePolling(info.state);
        if ((prevState === "Q" || prevState === "H") && info.state === "R") {
            vscode.window.showInformationMessage(`Workbench is ready on ${info.hostname}`, "Connect").then(choice => {
                if (choice === "Connect") {
                    vscode.commands.executeCommand("workbench.connectCurrentWindow");
                }
            });
        }
    }
    /** Show the status bar immediately with a queued state, then begin fast polling */
    showQueued() {
        this.statusBarItem.text = `$(server) PBS Workbench — Queued`;
        this.statusBarItem.tooltip = "Workbench is starting…";
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.show();
        this.startPolling(FAST_POLL_MS);
    }
    showRefreshing() {
        this.statusBarItem.text = this.statusBarItem.text.replace(/^\$\([^)]+\)/, "$(sync~spin)");
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.show();
    }
    update(info) {
        const label = STATE_LABELS[info.state] ?? info.state;
        const isRunning = info.state === "R";
        const remaining = (0, workbenchManager_1.timeRemaining)(info);
        this.statusBarItem.text = isRunning
            ? `$(server) PBS Workbench ${formatSeconds(remaining)}`
            : `$(server) PBS Workbench — ${label}`;
        this.statusBarItem.tooltip = buildTooltip(info);
        this.statusBarItem.backgroundColor = isRunning
            ? getColour(remaining)
            : undefined;
        this.statusBarItem.show();
    }
    hide() {
        this.statusBarItem.text = `$(server) PBS Workbench`;
        this.statusBarItem.tooltip = undefined;
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.hide();
        this.stopPolling();
    }
    ensurePolling(state) {
        const targetMs = state === "R" ? NORMAL_POLL_MS : FAST_POLL_MS;
        if (this.pollTimer && this.currentPollMs === targetMs)
            return;
        this.startPolling(targetMs);
    }
    startPolling(intervalMs) {
        this.stopPolling();
        this.currentPollMs = intervalMs;
        this.pollTimer = setInterval(async () => {
            await this.refresh();
        }, intervalMs);
    }
    stopPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = undefined;
        }
    }
    dispose() {
        this.stopPolling();
        this.statusBarItem.dispose();
    }
}
exports.StatusBarController = StatusBarController;
function formatSeconds(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0)
        return `${h}h ${m}m`;
    return `${m}m`;
}
function getColour(seconds) {
    if (seconds <= DANGER_SECONDS) {
        return new vscode.ThemeColor("statusBarItem.errorBackground");
    }
    if (seconds <= WARN_SECONDS) {
        return new vscode.ThemeColor("statusBarItem.warningBackground");
    }
    return undefined;
}
function suIncurred(info) {
    if (info.requested.walltime === 0)
        return 0;
    return info.su * (info.used.walltime / info.requested.walltime);
}
function buildTooltip(info) {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    const isRunning = info.state === "R";
    const label = STATE_LABELS[info.state] ?? info.state;
    md.appendMarkdown(`### HPC Workbench\n\n`);
    md.appendMarkdown(`| | |\n|---|---|\n`);
    md.appendMarkdown(`| **Job ID** | ${info.job_id} |\n`);
    md.appendMarkdown(`| **State** | ${label} |\n`);
    md.appendMarkdown(`| **Queue** | ${info.queue} |\n`);
    if (info.hostname) {
        md.appendMarkdown(`| **Node** | ${info.hostname} |\n`);
    }
    if (isRunning) {
        const remaining = (0, workbenchManager_1.timeRemaining)(info);
        md.appendMarkdown(`| **Time remaining** | ${formatSeconds(remaining)} |\n`);
        md.appendMarkdown(`| **CPUs** | ${info.requested.ncpus} |\n`);
        md.appendMarkdown(`| **CPU usage** | ${info.used.cpu.toFixed(1)}% |\n`);
        md.appendMarkdown(`| **RAM** | ${(0, workbenchManager_1.ramUsedGb)(info).toFixed(1)} / ${(0, workbenchManager_1.ramTotalGb)(info).toFixed(1)} GB |\n`);
        md.appendMarkdown(`| **SU cost** | ${suIncurred(info).toFixed(2)} / ${info.su.toFixed(2)} |\n`);
    }
    md.appendMarkdown(`\n_Click to manage workbench_`);
    return md;
}
//# sourceMappingURL=statusBar.js.map