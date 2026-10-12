// SyllabusStudy desktop companion: a floating phone-shaped window that loads
// the live site, so web publishes update it automatically (like the iOS shell).
const { app, BrowserWindow, screen, globalShortcut } = require("electron");
const path = require("path");

const SITE_URL = "https://syllabusstudy.com/dashboard?source=desktop";

let win = null;

function createWindow() {
  const { workAreaSize } = screen.getPrimaryDisplay();

  win = new BrowserWindow({
    width: 420,
    height: Math.min(860, workAreaSize.height - 40),
    minWidth: 360,
    minHeight: 560,
    x: workAreaSize.width - 440,
    y: 20,
    frame: true,
    alwaysOnTop: false,
    autoHideMenuBar: true,
    backgroundColor: "#0F1117",
    title: "SyllabusStudy",
    icon: path.join(__dirname, "..", "public", "icon-192.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(SITE_URL);

  // Open external links (Google sign-in, etc.) in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://syllabusstudy.com") || url.startsWith("https://www.syllabusstudy.com")) {
      return { action: "allow" };
    }
    require("electron").shell.openExternal(url);
    return { action: "deny" };
  });

  win.on("closed", () => { win = null; });
}

function toggleWindow() {
  if (!win) return createWindow();
  if (win.isVisible()) win.hide();
  else { win.show(); win.focus(); }
}

app.whenReady().then(() => {
  createWindow();
  // Global shortcut: Ctrl+Shift+G shows/hides Glo from anywhere on the computer.
  globalShortcut.register("Control+Shift+G", toggleWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("will-quit", () => globalShortcut.unregisterAll());

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
