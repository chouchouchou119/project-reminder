// ============================================================
// app.js — 渲染进程入口
// ============================================================

var allProjects = [];
var kpiData = null;
var searchText = '';
var currentFilterNode = null;

// ============================================================
// 全局桥接函数 — 供 HTML 内联按钮调用
// ============================================================
window._loadFromResult = function(result) {
  if (!result || !result.sheet1) return;
  allProjects = ExcelParser.parseExcelData(result.sheet1, result.sheet2);
  Sorter.sortProjects(allProjects, UIRenderer.getStarredList());
  kpiData = KPICalculator.calculateKPI(allProjects);
  currentFilterNode = null;
  searchText = '';
  document.getElementById('searchInput').value = '';
  refreshUI();
  updateFileInfo(result);
};

window._showPilotOverview = function() {
  if (allProjects.length > 0) {
    UIRenderer.renderPilotOverview(allProjects);
  }
};

window._refreshData = async function() {
  currentFilterNode = null;
  searchText = '';
  document.getElementById('searchInput').value = '';
  try {
    var starred = await window.electronAPI.getStarred();
    UIRenderer.setStarredList(starred);
    var result = await window.electronAPI.loadExcel();
    if (result && !result.error && result.sheet1) {
      window._loadFromResult(result);
    }
  } catch(e) {
    console.error('刷新失败：', e.message);
  }
};

// ============================================================
// UI 刷新
// ============================================================
function refreshUI() {
  UIRenderer.renderKpiCards(kpiData);
  UIRenderer.renderProjectList(allProjects, searchText, currentFilterNode);
  document.getElementById('detailPanel').innerHTML =
    '<div class="empty-state"><p>👈 点击左侧项目查看详情</p></div>';
}

function updateFileInfo(result) {
  var el = document.getElementById('fileInfo');
  if (result && result.fileName) {
    el.textContent = '📄 ' + result.fileName;
  }
}

// ============================================================
// 搜索
// ============================================================
document.getElementById('searchInput').addEventListener('input', function(e) {
  searchText = e.target.value;
  UIRenderer.renderProjectList(allProjects, searchText, currentFilterNode);
});

// ============================================================
// 事件监听
// ============================================================
document.addEventListener('data-refresh', function() {
  if (allProjects.length > 0) {
    Sorter.sortProjects(allProjects, UIRenderer.getStarredList());
    refreshUI();
  }
});

document.addEventListener('excel-updated', function(e) {
  var result = e.detail;
  if (result && !result.error) {
    window._loadFromResult(result);
  }
});

document.addEventListener('filter-node', function(e) {
  currentFilterNode = e.detail;
  UIRenderer.renderProjectList(allProjects, searchText, currentFilterNode);
});

// 文件变更监听
if (window.electronAPI && window.electronAPI.onExcelChanged) {
  window.electronAPI.onExcelChanged(function(result) {
    if (result && !result.error && result.sheet1) {
      window._loadFromResult(result);
    }
  });
}

// ============================================================
// 启动
// ============================================================
async function initApp() {
  try {
    var starred = await window.electronAPI.getStarred();
    UIRenderer.setStarredList(starred);
    var result = await window.electronAPI.loadExcel();
    if (result && !result.error && result.sheet1) {
      window._loadFromResult(result);
    } else if (result && result.error) {
      document.getElementById('projectList').innerHTML =
        '<div class="empty-state"><p style="color:#E53935;">⚠️ ' + result.error + '</p></div>';
    }
  } catch(e) {
    console.error('初始化失败：', e.message);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
