import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage } from "electron";
import path from "node:path";
import { autoUpdater } from "electron-updater";
import { detectLanguage } from "./languageDetector";
import { openFile, openFolder, readWorkspaceFile, saveFile } from "./fileService";
import { getRuntimeStatus, runCode, stopExecution } from "./runtime/RuntimeManager";
import { writeToRunningProcess } from "./runtime/localExecutionAdapter";
import { RunCodeRequest, SaveFileRequest } from "./types";

const dependencyInstallMode = (process.env.KINDRED_DEP_INSTALL_MODE as "prompt" | "auto" | "off" | undefined) ?? "prompt";
const autoUpdateEnabled = process.env.KINDRED_AUTO_UPDATE !== "0";

app.setName("Kindred");
app.setAppUserModelId("com.kindred.ide");

function getAppIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "kindred_logo.ico")
    : path.join(app.getAppPath(), "kindred_logo.ico");
}

let mainWindow: BrowserWindow | null = null;

function createMainWindow(): BrowserWindow {
  const iconPath = getAppIconPath();
  const icon = nativeImage.createFromPath(iconPath);
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 620,
    show: false,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#0b0f16",
    icon,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  window.setTitle("Kindred");

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  window.once("ready-to-show", () => {
    window.setIcon(icon);
    window.show();
  });

  window.on("closed", () => {
    mainWindow = null;
  });

  window.on("maximize", () => {
    window.webContents.send("window:maximizeChanged", true);
  });

  window.on("unmaximize", () => {
    window.webContents.send("window:maximizeChanged", false);
  });

  window.on("focus", () => {
    window.webContents.send("window:focusChanged", true);
  });

  window.on("blur", () => {
    window.webContents.send("window:focusChanged", false);
  });

  return window;
}

function createApplicationMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin"
      ? [
          {
            label: "Kindred",
            submenu: [
              { label: "About Kindred", click: () => showAboutDialog() },
              { type: "separator" },
              { label: "Quit", accelerator: "CmdOrCtrl+Q", click: () => app.quit() }
            ]
          }
        ]
      : []),
    {
      label: "File",
      submenu: [
        { label: "Open Folder", accelerator: "Shift+CmdOrCtrl+O", click: () => mainWindow?.webContents.send("menu:openFolder") },
        { label: "Close Folder", accelerator: "CmdOrCtrl+K CmdOrCtrl+F", click: () => mainWindow?.webContents.send("menu:closeFolder") },
        { label: "Open", accelerator: "CmdOrCtrl+O", click: () => mainWindow?.webContents.send("menu:open") },
        { label: "Save", accelerator: "CmdOrCtrl+S", click: () => mainWindow?.webContents.send("menu:save") },
        { type: "separator" },
        { label: "Exit", click: () => app.quit() }
      ]
    },
    {
      label: "Run",
      submenu: [{ label: "Execute Code", accelerator: "CmdOrCtrl+R", click: () => mainWindow?.webContents.send("menu:run") }]
    },
    {
      label: "Help",
      submenu: [
        { label: "About Kindred", click: () => showAboutDialog() },
        { label: "Check for Updates", click: () => checkForUpdates() },
        { type: "separator" },
        {
          label: "GitHub Repository",
          click: async () => {
            const { shell } = await import("electron");
            await shell.openExternal("https://github.com/lesliefdo08/Kindred");
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function setupAutoUpdates(): void {
  if (!app.isPackaged || !autoUpdateEnabled) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (error) => {
    console.error("Auto-update error:", error);
  });

  autoUpdater.on("update-downloaded", async () => {
    const result = await dialog.showMessageBox(mainWindow ?? undefined, {
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update ready",
      message: "Kindred update downloaded",
      detail: "Restart now to apply the update."
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  void autoUpdater.checkForUpdatesAndNotify();
}

function showAboutDialog(): void {
  const appVersion = app.getVersion();
  dialog.showMessageBox(mainWindow ?? undefined, {
    type: "info",
    title: "About Kindred",
    message: "Kindred",
    icon: getAppIconPath(),
    detail: `Kindred — Zero-setup coding for fast experimentation.\n\nVersion: ${appVersion}\n\nPython, C (with TinyCC), Java, and JavaScript.\n\nMIT License • https://github.com/lesliefdo08/Kindred`
  });
}

function checkForUpdates(): void {
  if (!app.isPackaged) {
    void dialog.showMessageBox(mainWindow ?? undefined, {
      type: "info",
      title: "Check for Updates",
      message: "Updates are available in packaged builds only.",
      detail: "Run a packaged Kindred build to check GitHub Releases."
    });
    return;
  }

  void autoUpdater.checkForUpdates().then((result) => {
    if (!result?.updateInfo?.version) {
      void dialog.showMessageBox(mainWindow ?? undefined, {
        type: "info",
        title: "Check for Updates",
        message: "Kindred is up to date",
        detail: "You're running the latest version."
      });
    }
  }).catch((error) => {
    void dialog.showMessageBox(mainWindow ?? undefined, {
      type: "error",
      title: "Update check failed",
      message: "Kindred could not check for updates.",
      detail: error instanceof Error ? error.message : "Unknown update error."
    });
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle("file:open", async () => openFile());

  ipcMain.handle("file:openFolder", async () => openFolder());

  ipcMain.handle("file:readWorkspaceFile", async (_, filePath: string) => readWorkspaceFile(filePath));

  ipcMain.handle("file:save", async (_, request: SaveFileRequest) => saveFile(request));

  ipcMain.handle("language:detect", async (_, payload: { filePath: string | null; code: string }) => {
    return detectLanguage(payload.filePath, payload.code);
  });

  ipcMain.handle("runtime:run", async (event, request: RunCodeRequest) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const cacheRoot = path.join(app.getPath("userData"), "dependency-cache");
    const managedRuntimeRoot = path.join(app.getPath("userData"), "managed-runtimes");
    const appRoot = app.getAppPath();
    const resourceRoot = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, "..");

    return runCode(request, {
      cacheRoot,
      managedRuntimeRoot,
      appRoot,
      resourceRoot,
      installMode: dependencyInstallMode,
      confirmInstall: async ({ language, packages }) => {
        if (dependencyInstallMode === "auto") {
          return true;
        }

        if (dependencyInstallMode === "off") {
          return false;
        }

        const result = await dialog.showMessageBox(parentWindow, {
          type: "question",
          buttons: ["Install", "Cancel"],
          defaultId: 0,
          cancelId: 1,
          title: "Install dependencies",
          message: `Install missing ${language} dependencies?`,
          detail: `Kindred needs to install: ${packages.join(", ")}. The packages will be cached locally and reused for later runs.`
        });

        return result.response === 0;
      },
      streamCallbacks: {
        onStdout: (data: string) => {
          mainWindow?.webContents.send("runtime:stdout", data);
        },
        onStderr: (data: string) => {
          mainWindow?.webContents.send("runtime:stderr", data);
        }
      }
    });
  });

  ipcMain.handle("runtime:stop", async () => stopExecution());

  ipcMain.on("runtime:writeStdin", (_, data: string) => {
    writeToRunningProcess(data);
  });

  ipcMain.handle("runtime:status", async () => {
    const appRoot = app.getAppPath();
    const managedRuntimeRoot = path.join(app.getPath("userData"), "managed-runtimes");
    const resourceRoot = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, "..");

    return getRuntimeStatus({
      appRoot,
      managedRuntimeRoot,
      resourceRoot
    });
  });

  ipcMain.on("window:minimize", () => {
    mainWindow?.minimize();
  });

  ipcMain.on("window:maximize", () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on("window:close", () => {
    mainWindow?.close();
  });

  ipcMain.handle("window:isMaximized", () => {
    return mainWindow?.isMaximized() ?? false;
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createApplicationMenu();
  mainWindow = createMainWindow();
  setupAutoUpdates();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
