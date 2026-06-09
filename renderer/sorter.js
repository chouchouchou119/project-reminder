// ============================================================
// sorter.js — 紧急程度排序
// ============================================================

/**
 * 从"按计划下一步推进节点"文本中提取天数
 * 例如: "批产开始（已超期153天）" → -153
 *       "中试结束（还有58天）" → +58
 *       "已完成所有阶段" → Infinity
 */
function extractDaysFromNode(nodeText) {
  if (!nodeText) return { label: '', days: Infinity };
  const text = String(nodeText).trim();

  // 匹配逾期
  const overdueMatch = text.match(/已超期(\d+)天/);
  if (overdueMatch) {
    const days = -parseInt(overdueMatch[1], 10);
    return { label: `超期${Math.abs(days)}天`, days };
  }

  // 匹配还有
  const remainMatch = text.match(/还有(\d+)天/);
  if (remainMatch) {
    const days = parseInt(remainMatch[1], 10);
    return { label: `还有${days}天`, days };
  }

  // 已完成
  if (text.includes('已完成所有阶段') || text.includes('已完成')) {
    return { label: '已完成', days: Infinity };
  }

  return { label: text, days: Infinity };
}

/**
 * 确定紧急程度级别
 */
function getUrgencyLevel(days) {
  if (days === Infinity) return 'completed';
  if (days < -30) return 'overdue-severe';
  if (days < 0) return 'overdue';
  if (days <= 7) return 'warning';
  if (days <= 30) return 'soon';
  return 'normal';
}

/**
 * 获取对应紧急程度的 badge CSS class
 */
function getUrgencyClass(level) {
  const map = {
    'overdue-severe': 'badge-overdue-severe',
    'overdue': 'badge-overdue',
    'warning': 'badge-warning',
    'soon': 'badge-soon',
    'normal': 'badge-soon',
    'completed': 'badge-completed'
  };
  return map[level] || '';
}

/**
 * 对项目进行排序
 * 1. 标星项目置顶
 * 2. 按紧急程度排列（逾期最多 → 即将到期 → 充裕 → 已完成）
 */
var STAGE_PLAN_MAP = {"送检":"送检开始计划","送检开始":"送检开始计划","送检结束":"送检结束计划","中试":"中试开始计划","中试开始":"中试开始计划","中试结束":"中试结束计划","上市":"上市计划"};

// 阶段 → 计划日期 / 实际日期映射
var STAGE_TO_PLAN = { '送检':'送检开始计划','送检开始':'送检开始计划','送检结束':'送检结束计划','中试':'中试开始计划','中试开始':'中试开始计划','中试结束':'中试结束计划','上市':'上市计划' };
var STAGE_TO_ACTUAL = { '送检':'送检开始实际','送检开始':'送检开始实际','送检结束':'送检结束实际','中试':'中试开始实际','中试开始':'中试开始实际','中试结束':'中试结束实际','上市':'上市实际' };

function sortProjects(projects, starredList, stageFilter) {
  const starredSet = new Set(starredList.map(String));
  const today = new Date().toISOString().split('T')[0];
  const planKey = STAGE_TO_PLAN[stageFilter] || null;
  const actualKey = STAGE_TO_ACTUAL[stageFilter] || null;

  for (const p of projects) {
    p.isStarred = starredSet.has(String(p.serialNo));

    // 按阶段筛选对应的计划日期计算紧急程度
    var urgency;
    if (planKey && p.dates[planKey]) {
      // 如果该阶段已有实际完成日期 → 已完成
      if (actualKey && p.dates[actualKey]) {
        urgency = { days: Infinity, label: '已完成' };
      } else {
        const days = window.KPICalculator ? window.KPICalculator.daysBetween(today, p.dates[planKey]) : 0;
        if (days < 0) urgency = { days: days, label: '超期' + Math.abs(days) + '天' };
        else if (days > 0) urgency = { days: days, label: '还有' + days + '天' };
        else urgency = { days: Infinity, label: '今天到期' };
      }
    } else {
      urgency = extractDaysFromNode(p.nextNode);
    }

    p._urgencyDays = urgency.days;
    p._urgencyLabel = urgency.label;
    p._urgencyLevel = getUrgencyLevel(urgency.days);

    if (p.projectStatus === '完成' || p.projectStatus === '提前完成') {
      p._urgencyDays = Infinity;
      p._urgencyLabel = p.projectStatus;
      p._urgencyLevel = 'completed';
    }
  }

  // 排序：标星优先 → 天数升序（越负越前 → 越大越后 → Infinity最后）
  projects.sort((a, b) => {
    // 标星优先
    if (a.isStarred && !b.isStarred) return -1;
    if (!a.isStarred && b.isStarred) return 1;
    // 按紧急天数排序
    if (a._urgencyDays !== b._urgencyDays) return a._urgencyDays - b._urgencyDays;
    // 同天数按名称排
    return a.name.localeCompare(b.name, 'zh-CN');
  });

  return projects;
}

/**
 * 按紧急程度分组
 */
function groupByUrgency(projects) {
  const groups = {
    'overdue-severe': { label: '🔴 严重超期（>30天）', items: [], cssClass: 'overdue-severe' },
    'overdue': { label: '🟠 已超期', items: [], cssClass: 'overdue' },
    'warning': { label: '🟡 即将到期（≤7天）', items: [], cssClass: 'warning' },
    'soon': { label: '🟢 近期关注（≤30天）', items: [], cssClass: 'soon' },
    'normal': { label: '🟢 正常', items: [], cssClass: 'soon' },
    'completed': { label: '⚪ 已完成', items: [], cssClass: 'completed' }
  };

  for (const p of projects) {
    const level = p._urgencyLevel;
    if (groups[level]) {
      groups[level].items.push(p);
    } else {
      groups['normal'].items.push(p);
    }
  }

  // 过滤空组
  return Object.values(groups).filter(g => g.items.length > 0);
}

window.Sorter = { extractDaysFromNode, getUrgencyLevel, getUrgencyClass, sortProjects, groupByUrgency };
