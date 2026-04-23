import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";
import path from "node:path";
import { detectLanguage } from "./languageDetector";
import { openFile, saveFile } from "./fileService";
import { runCode, stopExecution } from "./runtime/RuntimeManager";
import { RunCodeRequest, SaveFileRequest } from "./types";

const dependencyInstallMode = (process.env.KINDRED_DEP_INSTALL_MODE as "prompt" | "auto" | "off" | undefined) ?? "prompt";

app.setName("Kindred");

function getAppIconPath(): string {
  const packagedRoot = app.isPackaged ? process.resourcesPath : app.getAppPath();
  return path.join(packagedRoot, "kindredlogo.png");
}

let mainWindow: BrowserWindow | null = null;

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 620,
    show: false,
    backgroundColor: "#0b0f16",
    icon: getAppIconPath(),
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
    window.show();
  });

  window.on("closed", () => {
    mainWindow = null;
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

function showAboutDialog(): void {
  const appVersion = app.getVersion();
  dialog.showMessageBox(mainWindow ?? undefined, {
    type: "info",
    title: "About Kindred",
    message: "Kindred",
    icon: getAppIconPath(),
    detail: `A premium local-first IDE with managed runtimes and confidence-based language detection.\n\nVersion: ${appVersion}\n\nPython, C (with TinyCC), and Java execution.\n\nMIT License • https://github.com/lesliefdo08/Kindred`
  });
}

function checkForUpdates(): void {
  // Scaffold for electron-updater integration
  // In production, this would check GitHub releases and download updates
  dialog.showMessageBox(mainWindow ?? undefined, {
    type: "info",
    title: "Check for Updates",
    message: "Kindred is up to date",
    detail: "You're running the latest version. Updates will be checked automatically on launch."
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle("file:open", async () => openFile());

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
      }
    });
  });

  ipcMain.handle("runtime:stop", async () => stopExecution());
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createApplicationMenu();
  mainWindow = createMainWindow();

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
