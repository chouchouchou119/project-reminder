const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Excel 数据
  loadExcel: () => ipcRenderer.invoke('excel:load'),
  openExcelFile: () => ipcRenderer.invoke('excel:open-file'),
  markCompleted: (serialNumber) => ipcRenderer.invoke('excel:mark-completed', serialNumber),

  // 文件变更监听
  onExcelChanged: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('excel:file-changed', handler);
    return () => ipcRenderer.removeListener('excel:file-changed', handler);
  },

  // 网页版服务器
  startWebServer: () => ipcRenderer.invoke('server:start'),
  stopWebServer: () => ipcRenderer.invoke('server:stop'),
  onPublicUrl: (cb) => ipcRenderer.on('server:public-url', (e, url) => cb(url)),

  // 标星
  getStarred: () => ipcRenderer.invoke('storage:get-starred'),
  setStarred: (list) => ipcRenderer.invoke('storage:set-starred', list),

  // 路径
  getAppPaths: () => ipcRenderer.invoke('app:get-paths'),

  // 通知
  showNotification: (title, body) => ipcRenderer.invoke('notification:show', title, body)
});
