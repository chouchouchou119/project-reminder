// ============================================================
// kpiCalculator.js — KPI 计算
// ============================================================

var KPI_THREE_NODES = ['送检开始', '送检结束', '中试开始'];

var NODE_PLAN_KEYS = {
  '送检开始': '送检开始计划',
  '送检结束': '送检结束计划',
  '中试开始': '中试开始计划'
};
var NODE_ACTUAL_KEYS = {
  '送检开始': '送检开始实际',
  '送检结束': '送检结束实际',
  '中试开始': '中试开始实际'
};

function daysBetween(date1, date2) {
  if (!date1 || !date2) return Infinity;
  var d1 = new Date(date1);
  var d2 = new Date(date2);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return Infinity;
  // 返回 d2 - d1 的天数
  return Math.round((d2.getTime() - d1.getTime()) / 86400000);
}

// 判断某个节点是否真正逾期
// daysBetween(plan, today) > 0 表示今天 > 计划日期 → 已过期
function isNodeTrulyDelayed(project, nodeName, today) {
  var planDate = project.dates[NODE_PLAN_KEYS[nodeName]];
  var actualDate = project.dates[NODE_ACTUAL_KEYS[nodeName]];

  // 有实际日期 = 已完成，不算逾期
  if (actualDate) return false;

  // 无计划日期 = 信任监控文字
  if (!planDate) {
    var monStatus = project.monitors[nodeName] || '';
    return monStatus === '逾期未完成';
  }

  // 有计划日期：今天 > 计划日期 才逾期
  var past = daysBetween(planDate, today);
  if (past === Infinity) {
    var ms = project.monitors[nodeName] || '';
    return ms === '逾期未完成';
  }
  // past > 0 = 今天比计划晚 = 计划已过 = 逾期
  // past < 0 = 今天比计划早 = 还没到 = 不逾期
  return past > 0;
}

function calculateKPI(projects, today) {
  if (!today) {
    var now = new Date();
    today = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');
  }

  // Step 1: 筛选监控中的项目
  var monitored = projects.filter(function(p) {
    if (p.projectStatus === '完成' || p.projectStatus === '提前完成') return false;
    if (p.isLPCB) return false;
    if (p.isCooperative) return false;

    var planDate = p.dates['送检开始计划'];
    var daysToPlan = daysBetween(today, planDate);
    var condA = (daysToPlan >= 0 && daysToPlan <= 30);

    var actualStart = p.dates['送检开始实际'];
    var condB = !!actualStart;

    return condA || condB;
  });

  // Step 2: 统计真正逾期的项目
  var delayedCount = 0;
  var nodeBreakdown = {};
  for (var i = 0; i < KPI_THREE_NODES.length; i++) {
    nodeBreakdown[KPI_THREE_NODES[i]] = { delayed: 0 };
  }

  for (var j = 0; j < monitored.length; j++) {
    var p = monitored[j];
    var isDelayed = false;
    for (var k = 0; k < KPI_THREE_NODES.length; k++) {
      var node = KPI_THREE_NODES[k];
      if (isNodeTrulyDelayed(p, node, today)) {
        nodeBreakdown[node].delayed++;
        isDelayed = true;
      }
    }
    if (isDelayed) delayedCount++;
  }

  // Step 3: 计算
  var totalCount = monitored.length;
  var onTimeRate = totalCount > 0 ? (1 - delayedCount / totalCount) : 0;

  return {
    onTimeRate: Math.round(onTimeRate * 10000) / 100,
    onTimeRateDisplay: (Math.round(onTimeRate * 1000) / 10).toFixed(1) + '%',
    delayedCount: delayedCount,
    totalCount: totalCount,
    nodeBreakdown: nodeBreakdown
  };
}

window.KPICalculator = {
  calculateKPI: calculateKPI,
  KPI_THREE_NODES: KPI_THREE_NODES,
  daysBetween: daysBetween,
  isNodeTrulyDelayed: isNodeTrulyDelayed
};
