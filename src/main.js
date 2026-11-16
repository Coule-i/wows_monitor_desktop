const { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, screen, shell, session } = require('electron')
const path = require('path')
const fs = require('fs')
const { execFile } = require('child_process')

const URL_ = 'https://wows-monitor.com/'
const PARTITION = 'persist:wowsmonitor'

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

const configFile = path.join(app.getPath('userData'), 'config.json')
const config = {
  alwaysOnTop: false,
  showWhenGameStarts: true,
  hideWhenGameExits: true,
  startWithWindows: false,
  sleepWhenIdle: true
}
try {
  Object.assign(config, JSON.parse(fs.readFileSync(configFile, 'utf8')))
} catch (e) {}

function saveConfig() {
  fs.mkdirSync(path.dirname(configFile), { recursive: true })
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2))
}

app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess,MediaRouter,Translate')

function isMonitor(url) {
  try {
    return /(^|\.)wows-monitor\.com$/.test(new URL(url).hostname)
  } catch (e) {
    return false
  }
}

let win, tray
let quitting = false
let gameRunning = false
let sleepTimer

function createWindow(show) {
  let b = config.bounds
  // monitor unplugged?
  if (b && !screen.getAllDisplays().some(d => b.x >= d.bounds.x && b.x < d.bounds.x + d.bounds.width))
    b = null

  win = new BrowserWindow({
    width: b?.width || 1280,
    height: b?.height || 900,
    x: b?.x,
    y: b?.y,
    show: false,
    autoHideMenuBar: true,
    alwaysOnTop: config.alwaysOnTop,
    backgroundColor: '#000',
    title: 'WoWs Monitor',
    webPreferences: {
      partition: PARTITION,
      spellcheck: false,
      backgroundThrottling: false // needed, site checks replay folder in the bg
    }
  })
  win.setMenu(null)
  if (config.maximized) win.maximize()

  win.webContents.on('dom-ready', inject)
  win.loadURL(URL_)
  win.once('ready-to-show', () => show && win.show())

  win.on('hide', scheduleSleep)
  win.on('show', () => clearTimeout(sleepTimer))
  win.on('close', () => { if (!quitting) app.quit() })
  win.on('closed', () => {
    win = null
    updateTray()
  })

  let t
  function saveBounds() {
    clearTimeout(t)
    t = setTimeout(() => {
      if (!win || win.isMinimized()) return
      config.maximized = win.isMaximized()
      if (!config.maximized) config.bounds = win.getBounds()
      saveConfig()
    }, 500)
  }
  win.on('resize', saveBounds)
  win.on('move', saveBounds)

  win.webContents.on('before-input-event', (e, input) => {
    if (input.type != 'keyDown') return
    switch (input.key) {
      case 'F5': win.webContents.reload(); break
      case 'F11': win.setFullScreen(!win.isFullScreen()); break
      case 'F12': win.webContents.toggleDevTools(); break
      default: return
    }
    e.preventDefault()
  })
}

function readInject(name) {
  try {
    return fs.readFileSync(path.join(__dirname, '../inject', name), 'utf8')
  } catch (e) {
    return ''
  }
}

let cssKey = null
async function applyCss() {
  if (cssKey) win.webContents.removeInsertedCSS(cssKey).catch(() => {})
  cssKey = await win.webContents.insertCSS(readInject('custom.css'))
}

async function inject() {
  if (!isMonitor(win.webContents.getURL())) return
  cssKey = null
  await applyCss()
  win.webContents.executeJavaScript(readInject('custom.js')).catch(console.error)
}

// dev only. tried fs.watch first but it fires twice / not at all on windows
function watchInject() {
  if (app.isPackaged) return
  let css = readInject('custom.css'), js = readInject('custom.js')
  setInterval(() => {
    if (!win) return
    let css2 = readInject('custom.css'), js2 = readInject('custom.js')
    if (js2 != js) {
      js = js2
      css = css2
      win.webContents.reload()
    } else if (css2 != css) {
      css = css2
      applyCss()
    }
  }, 1000)
}

function showWindow() {
  clearTimeout(sleepTimer)
  if (!win) {
    createWindow(true)
    updateTray()
    return
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function toggleWindow() {
  if (win && win.isVisible() && win.isFocused()) win.hide()
  else showWindow()
}

// kill the renderer when hidden and not in a game, it eats ~200mb otherwise
function scheduleSleep() {
  clearTimeout(sleepTimer)
  if (!config.sleepWhenIdle) return
  sleepTimer = setTimeout(() => {
    if (!win || win.isVisible() || gameRunning) return
    win.destroy() // destroy() doesn't fire 'close' so it won't quit
    win = null
    updateTray()
  }, 60 * 1000)
}

function checkGame() {
  execFile('tasklist', ['/FI', 'IMAGENAME eq WorldOfWarships*', '/NH'], { windowsHide: true }, (err, out) => {
    if (err) return
    const running = out.includes('WorldOfWarships')
    if (running == gameRunning) return
    gameRunning = running

    if (running) {
      if (config.showWhenGameStarts) showWindow()
      else if (!win) createWindow(false)
    } else if (win) {
      if (config.hideWhenGameExits) win.hide()
      if (!win.isVisible()) scheduleSleep()
    }
    updateTray()
  })
}

function makeIcon() {
  const S = 32
  const buf = Buffer.alloc(S * S * 4)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x - 15.5, dy = y - 15.5
      const d = Math.hypot(dx, dy)
      let c = [0, 0, 0, 0]
      if (d < 15.5) c = [70, 50, 30, 255]
      if (Math.abs(d - 9.5) < 1.2 || ((Math.abs(dx) < 1 || Math.abs(dy) < 1) && d < 14)) c = [255, 255, 255, 255]
      buf.set(c, (y * S + x) * 4)
    }
  }
  return nativeImage.createFromBitmap(buf, { width: S, height: S })
}

function toggle(label, key, cb) {
  return {
    label,
    type: 'checkbox',
    checked: config[key],
    click(item) {
      config[key] = item.checked
      saveConfig()
      cb && cb(item.checked)
    }
  }
}

function updateTray() {
  if (!tray) return
  let status = 'sleeping'
  if (gameRunning) status = 'game running'
  else if (win) status = 'idle'

  tray.setToolTip(`WoWs Monitor (${status})`)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Status: ' + status, enabled: false },
    { label: 'Show / hide (Ctrl+Alt+M)', click: toggleWindow },
    { type: 'separator' },
    toggle('Always on top', 'alwaysOnTop', v => win && win.setAlwaysOnTop(v)),
    toggle('Show when game starts', 'showWhenGameStarts'),
    toggle('Hide when game exits', 'hideWhenGameExits'),
    toggle('Unload page when not playing', 'sleepWhenIdle'),
    // TODO only applied when clicked, editing config.json by hand does nothing
    toggle('Start with Windows', 'startWithWindows', v => {
      if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: v, args: ['--hidden'] })
    }),
    { type: 'separator' },
    { label: 'Open config folder', click: () => shell.openPath(path.dirname(configFile)) },
    { label: 'Quit', click: () => app.quit() }
  ]))
}

app.on('second-instance', showWindow)
app.on('before-quit', () => quitting = true)
app.on('window-all-closed', () => {}) // tray stays when the page is unloaded

app.whenReady().then(() => {
  const ses = session.fromPartition(PARTITION)
  // without this the replay folder permission is lost on every restart
  ses.setPermissionCheckHandler((wc, perm, origin, details) => isMonitor(origin || details.requestingUrl))
  ses.setPermissionRequestHandler((wc, perm, cb, details) => cb(isMonitor(details.requestingUrl)))
  // game is usually in Program Files which chromium blocks
  ses.on('file-system-access-restricted', (e, details, cb) => cb(isMonitor(details.origin) ? 'allow' : 'deny'))

  if (!process.argv.includes('--hidden')) createWindow(true)

  tray = new Tray(makeIcon())
  tray.on('click', toggleWindow)
  updateTray()

  globalShortcut.register('CommandOrControl+Alt+M', toggleWindow)
  watchInject()
  checkGame()
  setInterval(checkGame, 5000)
})
