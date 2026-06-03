"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const cp = require("child_process");
const workbenchManager_1 = require("./workbenchManager");
const statusBar_1 = require("./statusBar");
function activate(context) {
    const manager = new workbenchManager_1.WorkbenchManager();
    const statusBar = new statusBar_1.StatusBarController(manager);
    context.subscriptions.push(manager.outputChannel);
    // Register commands
    context.subscriptions.push(vscode.commands.registerCommand("workbench.start", async () => {
        statusBar.showQueued();
        await manager.start();
    }), vscode.commands.registerCommand("workbench.end", async () => {
        await manager.end();
        statusBar.refresh();
    }), vscode.commands.registerCommand("workbench.refresh", async () => {
        await statusBar.refresh();
    }), vscode.commands.registerCommand("workbench.showActions", async () => {
        await showActionsMenu(manager, statusBar);
    }), vscode.commands.registerCommand("workbench.connectNewWindow", async () => {
        const info = manager.cachedInfo;
        if (info)
            await connectRemoteSSH(info.hostname, info.jobdir, true);
    }), vscode.commands.registerCommand("workbench.connectCurrentWindow", async () => {
        const info = manager.cachedInfo;
        if (info)
            await connectRemoteSSH(info.hostname, info.jobdir, false);
    }));
    // Initial check
    statusBar.refresh();
    context.subscriptions.push(statusBar);
}
async function showActionsMenu(manager, statusBar) {
    const info = manager.cachedInfo;
    if (!info) {
        const action = await vscode.window.showQuickPick([{ label: "$(play) Start Workbench", action: "start" }], { title: "HPC Workbench" });
        if (action?.action === "start") {
            await manager.start();
            statusBar.refresh();
        }
        return;
    }
    const items = [
        {
            label: "$(remote-explorer) Connect via Remote SSH (Current Window)",
            action: "connect-thiswindow",
        },
        {
            label: "$(remote-explorer) Connect via Remote SSH (New Window)",
            action: "connect-newwindow",
        },
        { label: "$(refresh) Refresh Status", action: "refresh" },
        { label: "$(stop-circle) End Workbench", action: "end" },
    ];
    const picked = await vscode.window.showQuickPick(items, {
        title: `HPC Workbench — ${info.hostname}`,
        placeHolder: "Select an action",
    });
    if (!picked)
        return;
    switch (picked.action) {
        case "connect-thiswindow":
            await connectRemoteSSH(info.hostname, info.jobdir, false);
            break;
        case "connect-newwindow":
            await connectRemoteSSH(info.hostname, info.jobdir, true);
            break;
        case "refresh":
            await statusBar.refresh();
            break;
        case "end":
            const confirm = await vscode.window.showWarningMessage("End the running workbench?", { modal: true }, "End Workbench");
            if (confirm === "End Workbench") {
                await manager.end();
                statusBar.refresh();
            }
            break;
    }
}
async function connectRemoteSSH(node, jobdir, newWindow) {
    const flag = newWindow ? "--new-window" : "--reuse-window";
    const ssh_command = `--remote ssh-remote+${node} ${jobdir} ${flag}`;
    const hasVSCodeRemote = vscode.extensions.getExtension("ms-vscode-remote.remote-ssh");
    const hasOpenRemote = vscode.extensions.getExtension("jeanp413.open-remote-ssh");
    if (!hasVSCodeRemote && !hasOpenRemote) {
        await vscode.env.clipboard.writeText(ssh_command);
        vscode.window.showInformationMessage(`Remote SSH command copied to clipboard: ${ssh_command}`);
        return;
    }
    const app = hasVSCodeRemote ? "code" : "positron";
    const command = `${app} ${ssh_command}`;
    vscode.window.showInformationMessage(command);
    cp.exec(command);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map