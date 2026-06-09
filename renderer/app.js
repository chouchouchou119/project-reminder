// ============================================================
// app.js — 渲染进程入口
// ============================================================

var allProjects = [];
var kpiData = null;
var searchText = '';
var currentFilterNode = null;
var dateStart = '';
var dateEnd = '';
var stageFilter = '';

window._setStageFilter = function(s) { stageFilter = s; recalcAndRender(); };

// ============================================================
// 全局桥接函数
// ============================================================
window._loadFromResult = function(result) {
  if (!result || !result.sheet1) return;
  allProjects = ExcelParser.parseExcelData(result.sheet1, result.sheet2);
  Sorter.sortProjects(allProjects, UIRenderer.getStarredList(), stageFilter);
  recalcAndRender();
  updateFileInfo(result);
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
  } catch(e) { console.error(e); }
};

window._showPilotOverview = function() {
  if (allProjects.length > 0) UIRenderer.renderPilotOverview(allProjects);
};

// ============================================================
// 动态KPI + 筛选
// ============================================================
function getFilteredProjects() {
  var filtered = allProjects.slice();

  // 搜索过滤
  if (searchText && searchText.trim()) {
    var kw = searchText.trim().toLowerCase();
    filtered = filtered.filter(function(p) {
      return p.name.toLowerCase().includes(kw) || p.series.toLowerCase().includes(kw) || p.person.toLowerCase().includes(kw);
    });
  }

  // 阶段过滤
  if (stageFilter) {
    if (stageFilter === '上市') {
      filtered = filtered.filter(function(p) { return p.dates['上市计划'] && p.dates['上市计划'] !== ''; });
    } else if (stageFilter === '送检结束' || stageFilter === '中试结束') {
      // 匹配结束阶段：currentStage包含关键词 且 该阶段实际已开始
      var prefix = stageFilter.replace('结束', '');
      filtered = filtered.filter(function(p) { return p.currentStage && p.currentStage.includes(prefix); });
    } else {
      filtered = filtered.filter(function(p) { return p.currentStage && p.currentStage.includes(stageFilter); });
    }
  }

  // 逾期节点过滤
  if (currentFilterNode) {
    var today = dateEnd || new Date().toISOString().split('T')[0];
    filtered = filtered.filter(function(p) {
      return KPICalculator.isNodeTrulyDelayed(p, currentFilterNode, today);
    });
  }

  // 日期范围过滤：只看计划日期在范围内的项目
  if (dateStart || dateEnd) {
    filtered = filtered.filter(function(p) {
      var planDate = p.dates['送检开始计划'];
      if (!planDate) return true; // 无计划日期，保留
      if (dateStart && planDate < dateStart) return false;
      if (dateEnd && planDate > dateEnd) return false;
      return true;
    });
  }

  return filtered;
}

function recalcAndRender() {
  var filtered = getFilteredProjects();
  var today = dateEnd || new Date().toISOString().split('T')[0];
  kpiData = KPICalculator.calculateKPI(filtered, today);
  UIRenderer.renderKpiCards(kpiData);
  UIRenderer.renderProjectList(allProjects, searchText, currentFilterNode, dateStart, dateEnd);
  document.getElementById('detailPanel').innerHTML = '<div class="empty-state"><p>👈 点击左侧项目查看详情</p></div>';
}

function updateFileInfo(result) {
  var el = document.getElementById('fileInfo');
  if (result && result.fileName) el.textContent = '📄 ' + result.fileName;
}

// ============================================================
// 搜索
// ============================================================
document.getElementById('searchInput').addEventListener('input', function(e) {
  searchText = e.target.value;
  recalcAndRender();
});

// ============================================================
// 日期筛选
// ============================================================
document.getElementById('dateStart').addEventListener('change', function(e) {
  dateStart = e.target.value;
  recalcAndRender();
});
document.getElementById('dateEnd').addEventListener('change', function(e) {
  dateEnd = e.target.value;
  recalcAndRender();
});

// ============================================================
// 事件监听
// ============================================================
document.addEventListener('data-refresh', function() {
  if (allProjects.length > 0) {
    Sorter.sortProjects(allProjects, UIRenderer.getStarredList(), stageFilter);
    recalcAndRender();
  }
});

document.addEventListener('excel-updated', function(e) {
  var result = e.detail;
  if (result && !result.error) window._loadFromResult(result);
});

document.addEventListener('filter-node', function(e) {
  currentFilterNode = e.detail;
  recalcAndRender();
});

document.addEventListener('pilot-filter-changed', function() {
  window._showPilotOverview();
});

if (window.electronAPI && window.electronAPI.onExcelChanged) {
  window.electronAPI.onExcelChanged(function(result) {
    if (result && !result.error && result.sheet1) window._loadFromResult(result);
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
    }
  } catch(e) { console.error(e); }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
