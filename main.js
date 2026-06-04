const { app, BrowserWindow, ipcMain, Notification, dialog, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const chokidar = require('chokidar');
const express = require('express');
const os = require('os');
const localtunnel = require('localtunnel');

// ============================================================
// 配置
// ============================================================
const EXCEL_FOLDER = path.join(__dirname, 'data');
const FILE_PATTERN = /^产品项目管理监控表(\d{8})\.xlsx$/;
let STARRED_FILE = null; // 在 app.whenReady() 后初始化

let mainWindow = null;
let watcher = null;
let currentExcelPath = null;
let tray = null;
let isQuitting = false;

// ============================================================
// 工具函数
// ============================================================

/** 扫描文件夹，找文件名中日期最新的 Excel */
function findLatestExcel(folderPath) {
  if (!fs.existsSync(folderPath)) return null;
  const files = fs.readdirSync(folderPath)
    .filter(f => FILE_PATTERN.test(f))
    .map(f => {
      const match = f.match(FILE_PATTERN);
      return { name: f, dateStr: match[1], fullPath: path.join(folderPath, f) };
    })
    .sort((a, b) => b.dateStr.localeCompare(a.dateStr));
  return files[0] || null;
}

/** 将 Excel 日期序列号转为可读字符串 */
function serialToDateStr(serial) {
  if (serial == null || serial === '' || serial < 1) return '';
  try {
    const parsed = XLSX.SSF.parse_date_code(serial);
    const y = parsed.y, m = String(parsed.m).padStart(2, '0'), d = String(parsed.d).padStart(2, '0');
    return `${y}-${m}-${d}`;
  } catch (e) { return ''; }
}

/** 将数组中所有 Excel 日期序列号转为字符串 */
function convertDatesInArray(arr) {
  for (let r = 0; r < arr.length; r++) {
    const row = arr[r];
    for (let c = 0; c < row.length; c++) {
      const val = row[c];
      // Excel日期序列号通常 > 40000 (2009年以后)
      if (typeof val === 'number' && val > 40000 && val < 100000) {
        const dateStr = serialToDateStr(val);
        if (dateStr) row[c] = dateStr;
      }
    }
  }
  return arr;
}

/** 读取并解析 Excel，返回预处理后的数据 */
function readAndParseExcel(filePath) {
  const wb = XLSX.readFile(filePath, { cellStyles: true });
  const sheet1 = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const sheet2 = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[1]], { header: 1, defval: '' });
  // 在主进程完成日期转换，渲染进程不需要 xlsx 库
  convertDatesInArray(sheet1);
  convertDatesInArray(sheet2);
  return { sheet1, sheet2, sheetNames: wb.SheetNames };
}

// ============================================================
// 标星存储
// ============================================================
function loadStarred() {
  try {
    if (fs.existsSync(STARRED_FILE)) {
      return JSON.parse(fs.readFileSync(STARRED_FILE, 'utf-8'));
    }
  } catch (e) { /* ignore */ }
  return [];
}

function saveStarred(list) {
  try {
    fs.writeFileSync(STARRED_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (e) { /* ignore */ }
}

// ============================================================
// 提前完成 — 写回 Excel
// ============================================================
function markProjectCompleted(excelPath, serialNumber) {
  const wb = XLSX.readFile(excelPath, { cellStyles: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // 找到序号匹配的行（列0）
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]) === String(serialNumber)) {
      const cellRef = XLSX.utils.encode_cell({ r: r, c: 32 }); // 项目状态列
      ws[cellRef] = { t: 's', v: '提前完成' };
      XLSX.writeFile(wb, excelPath);
      return true;
    }
  }
  return false;
}

// ============================================================
// IPC 处理
// ============================================================
function setupIPC() {
  // 加载 Excel（自动找最新）
  ipcMain.handle('excel:load', async () => {
    const latest = findLatestExcel(EXCEL_FOLDER);
    if (!latest) return { error: '未找到Excel文件', filePath: null, sheet1: [], sheet2: [] };
    currentExcelPath = latest.fullPath;
    const data = readAndParseExcel(latest.fullPath);
    return { error: null, filePath: latest.fullPath, fileName: latest.name, ...data };
  });

  // 手动选择 Excel 文件
  ipcMain.handle('excel:open-file', async () => {
    console.log('[IPC] excel:open-file called');
    try {
      const win = mainWindow || BrowserWindow.getFocusedWindow();
      console.log('[IPC] opening dialog...');
      const result = await dialog.showOpenDialog(win, {
        title: '选择产品项目管理表',
        filters: [{ name: 'Excel 文件', extensions: ['xlsx', 'xls'] }],
        defaultPath: EXCEL_FOLDER,
        properties: ['openFile']
      });
      console.log('[IPC] dialog closed, canceled:', result.canceled);
      if (result.canceled || result.filePaths.length === 0) {
        return { error: '已取消', filePath: null, sheet1: [], sheet2: [] };
      }
      const filePath = result.filePaths[0];
      console.log('[IPC] loading file:', filePath);
      currentExcelPath = filePath;
      const data = readAndParseExcel(filePath);
      console.log('[IPC] file loaded, rows:', data.sheet1.length);
      return { error: null, filePath: filePath, fileName: path.basename(filePath), ...data };
    } catch (e) {
      console.log('[IPC] ERROR:', e.message);
      return { error: '读取失败：' + e.message, filePath: null, sheet1: [], sheet2: [] };
    }
  });

  // 标记提前完成
  ipcMain.handle('excel:mark-completed', async (event, serialNumber) => {
    if (!currentExcelPath) return { error: '没有打开的Excel文件' };
    try {
      const ok = markProjectCompleted(currentExcelPath, serialNumber);
      if (!ok) return { error: '未找到该项目' };
      // 重新读取
      const data = readAndParseExcel(currentExcelPath);
      return { error: null, filePath: currentExcelPath, ...data };
    } catch (e) {
      return { error: e.message };
    }
  });

  // 标星
  ipcMain.handle('storage:get-starred', () => loadStarred());
  ipcMain.handle('storage:set-starred', (event, list) => { saveStarred(list); return true; });

  // 获取路径
  ipcMain.handle('app:get-paths', () => ({
    excelFolder: EXCEL_FOLDER,
    userData: app.getPath('userData')
  }));

  // 系统通知
  ipcMain.handle('notification:show', (event, title, body) => {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  });

  // 同步到公网：复制 Excel 到 data/，推送到 GitHub
  ipcMain.handle('sync:push', async () => {
    try {
      const { execSync } = require('child_process');
      const projectDir = __dirname;
      const dataDir = path.join(projectDir, 'data');

      // 找到最新的Excel文件
      const latest = findLatestExcel(EXCEL_FOLDER) || (currentExcelPath ? { fullPath: currentExcelPath, name: path.basename(currentExcelPath) } : null);
      if (!latest) return { error: '没有可同步的Excel文件' };

      // 复制到 docs/ 文件夹（GitHub Pages用）
      const docsDir = path.join(projectDir, 'docs');
      if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir);
      const destName = '产品项目管理监控表20260529.xlsx';
      fs.copyFileSync(latest.fullPath, path.join(docsDir, destName));
      console.log('[同步] 已复制到docs/:', destName);

      // 也复制到 data/
      if (path.dirname(latest.fullPath) !== dataDir) {
        fs.copyFileSync(latest.fullPath, path.join(dataDir, destName));
      }

      // Git add, commit, push
      const gitDir = path.join(projectDir, '.git');
      if (!fs.existsSync(gitDir)) return { error: 'Git 未初始化' };

      execSync('git add data/', { cwd: projectDir, encoding: 'utf8' });
      const status = execSync('git status --porcelain data/', { cwd: projectDir, encoding: 'utf8' });
      if (!status.trim()) return { success: true, message: '数据没有变化' };

      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      execSync('git commit -m "数据更新 ' + dateStr + '"', { cwd: projectDir, encoding: 'utf8' });
      execSync('git push', { cwd: projectDir, encoding: 'utf8', timeout: 30000 });

      return { success: true, message: '已同步！1-2分钟后公网网址自动更新。' };
    } catch (e) {
      return { error: '同步失败：' + (e.stderr || e.message) };
    }
  });

  // 启动网页版服务器 + 公网隧道
  let webServer = null;
  let tunnelProcess = null;
  let publicUrl = null;

  function getLocalIP() {
    const ifaces = os.networkInterfaces();
    for (const [, nets] of Object.entries(ifaces))
      for (const net of nets)
        if (net.family === 'IPv4' && !net.internal) return net.address;
    return 'localhost';
  }

  ipcMain.handle('server:start', async () => {
    if (webServer) {
      return { running: true, url: 'http://' + getLocalIP() + ':3000', publicUrl };
    }
    try {
      const WEB_PASSWORD = '119119';
      const expressApp = express();

      // 密码验证（仅对外网访问）
      const LOGIN_PAGE = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>项目进度提醒</title><style>*{margin:0;padding:0}body{font-family:"Microsoft YaHei",Arial;background:#E3F2FD;display:flex;justify-content:center;align-items:center;height:100vh}.b{background:#fff;padding:40px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.1);text-align:center}h2{color:#1565C0;margin-bottom:20px}input{padding:10px 16px;border:2px solid #E0E0E0;border-radius:8px;font-size:16px;width:200px;text-align:center;outline:none}input:focus{border-color:#1565C0}button{margin-top:12px;padding:10px 32px;background:#1565C0;color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer}button:hover{background:#0D47A1}.err{color:#E53935;margin-top:8px}</style></head><body><div class="b"><h2>🔐 请输入访问密码</h2><form method="get" action="/"><input type="password" name="key" placeholder="输入密码" autofocus><br>ERRMSG<button type="submit">确认</button></form></div></body></html>';

      expressApp.use((req, res, next) => {
        const ip = req.ip || req.connection.remoteAddress;
        // 本地和局域网免密码
        if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.startsWith('192.168.') || ip === 'localhost') return next();
        // key参数验证
        if (req.query.key === WEB_PASSWORD) {
          res.cookie('key', WEB_PASSWORD, { maxAge: 86400000, httpOnly: true });
          return next();
        }
        // 已登录cookie
        if ((req.headers.cookie || '').includes('key=' + WEB_PASSWORD)) return next();
        // 显示密码页
        if (req.method === 'GET') {
          return res.send(LOGIN_PAGE.replace('ERRMSG', req.query.key ? '<p class=\"err\">密码错误</p>' : ''));
        }
        res.status(403).end('Forbidden');
      });

      expressApp.get('/api/load', (req, res) => {
        const latest = findLatestExcel(EXCEL_FOLDER);
        if (!latest) return res.json({ error: '未找到Excel文件' });
        const data = readAndParseExcel(latest.fullPath);
        res.json({ error: null, ...data, fileName: latest.name });
      });
      expressApp.use(express.static(path.join(__dirname, 'public')));
      expressApp.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

      return new Promise((resolve) => {
        webServer = expressApp.listen(3000, '0.0.0.0', () => {
          const localURL = 'http://' + getLocalIP() + ':3000';
          console.log('[网页版] 已启动: ' + localURL);

          // 启动公网隧道（自动重连）
          function startTunnel() {
            localtunnel({ port: 3000 }).then(tunnel => {
              tunnelProcess = tunnel;
              publicUrl = tunnel.url;
              console.log('[公网] ' + publicUrl);
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('server:public-url', publicUrl);
              }
              // 隧道断开时自动重连
              tunnel.on('close', function() {
                console.log('[公网] 断开，3秒后重连...');
                publicUrl = null;
                setTimeout(startTunnel, 3000);
              });
              tunnel.on('error', function(err) {
                console.log('[公网] 错误:', err.message);
              });
            }).catch(err => {
              console.log('[公网] 连接失败，5秒后重试:', err.message);
              setTimeout(startTunnel, 5000);
            });
          }
          startTunnel();

          resolve({ running: true, url: localURL, publicUrl: null });
        });
        webServer.on('error', (e) => resolve({ running: false, error: e.message }));
      });
    } catch (e) {
      return { running: false, error: e.message };
    }
  });

  // 停止网页版
  ipcMain.handle('server:stop', async () => {
    if (tunnelProcess) { try { tunnelProcess.close(); } catch(e) {} tunnelProcess = null; }
    if (webServer) { webServer.close(); webServer = null; }
    publicUrl = null;
    console.log('[网页版] 已停止');
    return { running: false };
  });
}

// ============================================================
// 文件监听
// ============================================================
function startFileWatcher() {
  if (watcher) return;
  if (!fs.existsSync(EXCEL_FOLDER)) fs.mkdirSync(EXCEL_FOLDER, { recursive: true });

  let debounceTimer = null;
  watcher = chokidar.watch(path.join(EXCEL_FOLDER, '*.xlsx'), {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    ignoreInitial: true
  });

  const onExcelChange = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const latest = findLatestExcel(EXCEL_FOLDER);
        if (latest && latest.fullPath !== currentExcelPath) {
          currentExcelPath = latest.fullPath;
        }
        if (currentExcelPath && fs.existsSync(currentExcelPath)) {
          try {
            const data = readAndParseExcel(currentExcelPath);
            mainWindow.webContents.send('excel:file-changed', {
              error: null, filePath: currentExcelPath, fileName: path.basename(currentExcelPath), ...data
            });
          } catch (e) {
            mainWindow.webContents.send('excel:file-changed', { error: e.message });
          }
        }
      }
    }, 2000);
  };

  watcher.on('add', onExcelChange);
  watcher.on('change', onExcelChange);
}

// ============================================================
// 每天早上9点定时提醒
// ============================================================
let dailyTimer = null;

function scheduleDailyReminder() {
  if (dailyTimer) clearTimeout(dailyTimer);

  const now = new Date();
  const nineAM = new Date(now);
  nineAM.setHours(9, 0, 0, 0);

  // 如果今天9点已经过了，设到明天9点
  if (now >= nineAM) {
    nineAM.setDate(nineAM.getDate() + 1);
  }

  const msUntil9 = nineAM.getTime() - now.getTime();
  console.log('[定时提醒] 将在', nineAM.toLocaleString(), '触发，还有', Math.round(msUntil9 / 3600000), '小时');

  dailyTimer = setTimeout(() => {
    console.log('[定时提醒] 触发！');
    checkAndNotify();
    // 安排下一天
    scheduleDailyReminder();
  }, msUntil9);
}

function checkAndNotify() {
  try {
    // 读取最新 Excel
    const latest = findLatestExcel(EXCEL_FOLDER);
    if (!latest) return;
    const data = readAndParseExcel(latest.fullPath);
    if (!data.sheet1 || data.sheet1.length < 2) return;

    // 解析项目并计算紧急程度
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    let overdueProjects = [];
    let warningProjects = [];

    for (let r = 1; r < data.sheet1.length; r++) {
      const name = String(data.sheet1[r][4] || '').trim();
      if (!name) continue;
      const status = String(data.sheet1[r][32] || '').trim();
      if (status === '完成' || status === '提前完成') continue;
      if (name.includes('LPCB')) continue;
      const mark = data.sheet1[r][33];
      if (mark === 0 || mark === '0') continue;

      const person = String(data.sheet1[r][36] || '').trim();

      // 检查3个考核节点
      const nodeChecks = [
        { node: '送检开始', planCol: 9, actualCol: 16 },
        { node: '送检结束', planCol: 10, actualCol: 17 },
        { node: '中试开始', planCol: 11, actualCol: 18 }
      ];

      let mostUrgentDays = Infinity;
      for (const nc of nodeChecks) {
        const planVal = data.sheet1[r][nc.planCol];
        const actualVal = data.sheet1[r][nc.actualCol];
        if (actualVal && actualVal >= 1) continue; // 已完成
        if (!planVal || planVal < 1) continue;

        const planDate = new Date((planVal - 25569) * 86400000);
        const daysLeft = Math.round((planDate - today) / 86400000);
        // daysLeft < 0 = 逾期, daysLeft 0-7 = 即将到期
        if (daysLeft < mostUrgentDays) mostUrgentDays = daysLeft;
      }

      if (mostUrgentDays < 0) {
        overdueProjects.push({ name, person, days: Math.abs(mostUrgentDays) });
      } else if (mostUrgentDays <= 7 && mostUrgentDays >= 0) {
        warningProjects.push({ name, person, days: mostUrgentDays });
      }
    }

    // 构建通知内容
    let title = '📊 项目进度提醒';
    let body = '';

    if (overdueProjects.length > 0) {
      const top = overdueProjects.slice(0, 3);
      body += '逾期 ' + overdueProjects.length + ' 个：' + top.map(p => p.name + '(超' + p.days + '天)').join('、');
    }
    if (warningProjects.length > 0) {
      if (body) body += '\n';
      const top = warningProjects.slice(0, 2);
      body += '即将到期 ' + warningProjects.length + ' 个：' + top.map(p => p.name + '(' + p.days + '天后)').join('、');
    }

    if (body && Notification.isSupported()) {
      new Notification({ title, body, urgency: 'critical' }).show();
      console.log('[定时提醒] 通知已发送');
    } else if (!body) {
      console.log('[定时提醒] 没有需要提醒的项目');
    }
  } catch (e) {
    console.error('[定时提醒] 出错:', e.message);
  }
}

// ============================================================
// 窗口创建
// ============================================================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 600,
    backgroundColor: '#E3F2FD',
    title: '产品项目进度提醒',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // 关窗口→藏托盘
  mainWindow.on('close', (event) => {
    if (!isQuitting) { event.preventDefault(); mainWindow.hide(); }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'assets', 'icon.png'));
  tray.setToolTip('产品项目进度提醒');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示窗口', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: '退出程序', click: () => { isQuitting = true; app.quit(); } }
  ]));
  tray.on('double-click', () => { mainWindow.show(); mainWindow.focus(); });
}

// ============================================================
// 应用生命周期
// ============================================================
app.whenReady().then(() => {
  // 初始化需要 app 就绪的变量
  STARRED_FILE = path.join(app.getPath('userData'), 'starred.json');

  setupIPC();

  // 开机自启
  app.setLoginItemSettings({ openAtLogin: true });

  // 确保 data 文件夹存在
  if (!fs.existsSync(EXCEL_FOLDER)) {
    fs.mkdirSync(EXCEL_FOLDER, { recursive: true });
  }

  createWindow();
  createTray();
  startFileWatcher();

  // 每天早上9点定时提醒
  scheduleDailyReminder();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (watcher) { watcher.close(); watcher = null; }
  if (process.platform !== 'darwin') app.quit();
});
