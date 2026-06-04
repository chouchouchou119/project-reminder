// ============================================================
// uiRenderer.js — DOM 渲染
// ============================================================

let selectedSerialNo = null;
let currentStarredList = [];
// currentFilterNode 在 app.js 中定义

// ============================================================
// KPI 卡片
// ============================================================
function renderKpiCards(kpiData) {
  if (!kpiData) return;

  // 按时完成率
  const mainCard = document.getElementById('kpiMain');
  mainCard.querySelector('.kpi-value').textContent = kpiData.onTimeRateDisplay;
  mainCard.querySelector('.kpi-sub').textContent =
    `延期 ${kpiData.delayedCount} / 监控 ${kpiData.totalCount}`;

  const rate = kpiData.onTimeRate;
  const rateEl = mainCard.querySelector('.kpi-value');
  if (rate >= 90) rateEl.style.color = '#43A047';
  else if (rate >= 75) rateEl.style.color = '#F57C00';
  else rateEl.style.color = '#E53935';

  // 三个节点卡片 — 可点击筛选逾期项目
  const nodeNames = ['送检开始', '送检结束', '中试开始'];
  const cardIds = ['kpiCheckStart', 'kpiCheckEnd', 'kpiPilotStart'];

  for (let i = 0; i < nodeNames.length; i++) {
    const card = document.getElementById(cardIds[i]);
    const breakdown = kpiData.nodeBreakdown[nodeNames[i]];
    if (breakdown) {
      card.querySelector('.kpi-value').textContent =
        breakdown.delayed > 0 ? `${breakdown.delayed} 逾期` : '正常';
      card.querySelector('.kpi-sub').textContent =
        `逾期 ${breakdown.delayed} / 总计 ${breakdown.total}`;

      const valEl = card.querySelector('.kpi-value');
      if (breakdown.delayed > 0) {
        valEl.style.color = '#E53935';
        card.style.cursor = 'pointer';
        card.title = '点击查看逾期项目详情';
        card.onclick = () => filterByDelayedNode(nodeNames[i]);
      } else {
        valEl.style.color = '#43A047';
        card.style.cursor = 'default';
        card.onclick = null;
      }
    }
  }
}

/** 点击 KPI 逾期卡片，筛选列表 */
function filterByDelayedNode(nodeName) {
  currentFilterNode = nodeName;
  document.dispatchEvent(new CustomEvent('filter-node', { detail: nodeName }));
}

function clearFilterNode() {
  currentFilterNode = null;
  document.dispatchEvent(new CustomEvent('filter-node', { detail: null }));
}

// ============================================================
// 项目列表
// ============================================================
function renderProjectList(projects, searchText, filterNode, dateStart, dateEnd) {
  const container = document.getElementById('projectList');
  container.innerHTML = '';

  if (!projects || projects.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>📂 没有项目数据</p></div>`;
    return;
  }

  // 搜索过滤
  let filtered = projects;
  if (searchText && searchText.trim()) {
    const kw = searchText.trim().toLowerCase();
    filtered = projects.filter(p =>
      p.name.toLowerCase().includes(kw) ||
      p.series.toLowerCase().includes(kw) ||
      p.person.toLowerCase().includes(kw) ||
      p.model.toLowerCase().includes(kw)
    );
  }

  // 节点逾期筛选
  if (filterNode) {
    filtered = filtered.filter(p => p.monitors[filterNode] === '逾期未完成');
  }

  if (filtered.length === 0) {
    const msg = filterNode
      ? `✅ "${filterNode}" 节点没有逾期未完成的项目`
      : (searchText ? `🔍 未找到匹配 "${searchText}" 的项目` : '📂 没有项目数据');
    container.innerHTML = `<div class="empty-state"><p>${msg}</p>
      ${filterNode ? '<button class="btn btn-outline" onclick="UIRenderer.clearFilterNode()">← 返回全部项目</button>' : ''}
    </div>`;
    return;
  }

  // 筛选提示
  if (filterNode) {
    const filterBanner = document.createElement('div');
    filterBanner.style.cssText = 'padding:8px 16px;background:#FFEBEE;border-bottom:1px solid #EF9A9A;font-size:13px;display:flex;justify-content:space-between;align-items:center';
    filterBanner.innerHTML = `<span>🔍 筛选：「${filterNode}」逾期未完成（${filtered.length} 个项目）</span>
      <button class="btn btn-sm btn-outline" onclick="UIRenderer.clearFilterNode()">✕ 清除筛选</button>`;
    container.appendChild(filterBanner);
  }

  const groups = Sorter.groupByUrgency(filtered);

  for (const group of groups) {
    if (group.items.length === 0) continue;

    const header = document.createElement('div');
    header.className = `group-header ${group.cssClass}`;
    header.textContent = group.label + ` (${group.items.length})`;
    container.appendChild(header);

    for (const p of group.items) {
      const item = document.createElement('div');
      item.className = 'project-item';
      if (p.isStarred) item.classList.add('starred');
      if (String(p.serialNo) === String(selectedSerialNo)) item.classList.add('selected');
      item.setAttribute('data-serial', p.serialNo);

      // 星标按钮
      const starBtn = document.createElement('span');
      starBtn.className = 'star-btn' + (p.isStarred ? ' active' : '');
      starBtn.textContent = p.isStarred ? '⭐' : '☆';
      starBtn.title = p.isStarred ? '取消标星' : '标星置顶';
      starBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleStar(p);
      });

      const infoDiv = document.createElement('div');
      infoDiv.className = 'item-info';

      const nameDiv = document.createElement('div');
      nameDiv.className = 'item-name';
      nameDiv.textContent = p.name;

      const metaDiv = document.createElement('div');
      metaDiv.className = 'item-meta';
      metaDiv.innerHTML = `
        <span>👤 ${p.person || '-'}</span>
        <span>📦 ${p.series || '-'}</span>
        <span>📍 ${p.currentStage || '-'}</span>
      `;

      infoDiv.appendChild(nameDiv);
      infoDiv.appendChild(metaDiv);

      // 中试标记
      if (p.pilotDetail) {
        var pilotTag = document.createElement('span');
        pilotTag.className = 'item-badge';
        pilotTag.style.cssText = 'background:#E8F5E9;color:#2E7D32;margin-right:4px;';
        pilotTag.textContent = '🔧 中试';
        infoDiv.appendChild(pilotTag);
      }

      const badge = document.createElement('span');
      badge.className = 'item-badge ' + Sorter.getUrgencyClass(p._urgencyLevel);
      badge.textContent = p._urgencyLabel || '';

      item.appendChild(starBtn);
      item.appendChild(infoDiv);
      item.appendChild(badge);

      item.addEventListener('click', () => {
        selectedSerialNo = p.serialNo;
        renderProjectList(projects, searchText, filterNode);
        renderDetail(p);
      });

      container.appendChild(item);
    }
  }
}

// ============================================================
// 项目详情
// ============================================================
function renderDetail(project) {
  const panel = document.getElementById('detailPanel');
  if (!project) {
    panel.innerHTML = `<div class="empty-state"><p>👈 点击左侧项目查看详情</p></div>`;
    return;
  }

  const isStarred = currentStarredList.includes(String(project.serialNo));

  let html = `
    <div class="detail-header">
      <h2>${project.name}</h2>
      <span class="detail-star ${isStarred ? 'active' : ''}" id="detailStarBtn"
            title="${isStarred ? '取消标星' : '标星置顶'}">${isStarred ? '⭐' : '☆'}</span>
    </div>

    <div class="detail-section">
      <h3>📋 基本信息</h3>
      <div class="detail-grid">
        <span class="label">序号</span><span class="value">${project.serialNo}</span>
        <span class="label">系列</span><span class="value">${project.series || '-'}</span>
        <span class="label">型号</span><span class="value">${project.model || '-'}</span>
        <span class="label">负责人</span><span class="value"><strong>${project.person || '-'}</strong></span>
        <span class="label">复杂度</span><span class="value">${project.complexity || '-'}</span>
        <span class="label">开发方式</span><span class="value">${project.devMethod || '-'}</span>
        <span class="label">当前阶段</span><span class="value">${project.currentStage || '-'}</span>
        <span class="label">项目状态</span><span class="value">${project.projectStatus || '进行中'}</span>
      </div>
    </div>

    <div class="detail-section">
      <h3>📅 关键节点进度</h3>
      ${renderNodeTable(project)}
    </div>
  `;

  // 中试细化数据 — 含催办提醒
  html += renderPilotSection(project);

  // 备注
  if (project.remark) {
    html += `
      <div class="detail-section">
        <h3>📝 备注</h3>
        <p style="font-size:13px;color:#616161;">${project.remark}</p>
      </div>
    `;
  }

  // 下一步推进
  if (project.nextNode) {
    const isOverdue = project.nextNode.includes('超期');
    const isSoon = project.nextNode.includes('还有');
    html += `
      <div class="detail-section">
        <h3>⏰ 下一步推进</h3>
        <p style="font-size:14px;color:${isOverdue ? '#E53935' : (isSoon ? '#F57C00' : '#212121')};font-weight:600;">
          ${project.nextNode}
        </p>
      </div>
    `;
  }

  // 操作按钮
  html += `
    <div class="detail-actions">
      ${(project.projectStatus !== '提前完成' && project.projectStatus !== '完成') ?
        `<button class="btn btn-primary" id="btnMarkCompleted">✅ 标记为提前完成</button>` : ''}
      <span style="font-size:12px;color:#9E9E9E;margin-left:8px;">
        ${project.projectStatus === '提前完成' ? '该项目已标记为提前完成' : ''}
        ${project.projectStatus === '完成' ? '该项目已完成' : ''}
      </span>
    </div>
  `;

  panel.innerHTML = html;

  // 绑定事件
  const starBtn = document.getElementById('detailStarBtn');
  if (starBtn) starBtn.addEventListener('click', () => toggleStar(project));
  const completeBtn = document.getElementById('btnMarkCompleted');
  if (completeBtn) completeBtn.addEventListener('click', () => markCompleted(project));
}

/** 生成节点进度表格 */
function renderNodeTable(project) {
  const nodes = [
    { key: '送检开始', plan: '送检开始计划', actual: '送检开始实际' },
    { key: '送检结束', plan: '送检结束计划', actual: '送检结束实际' },
    { key: '中试开始', plan: '中试开始计划', actual: '中试开始实际' },
    { key: '中试结束', plan: '中试结束计划', actual: '中试结束实际' },
    { key: '批产开始', plan: '批产开始计划', actual: '批产开始实际' },
    { key: '批产结束', plan: '批产结束计划', actual: '批产结束实际' },
    { key: '上市', plan: '上市计划', actual: '上市实际' }
  ];

  let rows = '';
  for (const node of nodes) {
    const status = project.monitors[node.key] || '';
    const planDate = project.dates[node.plan] || '-';
    const actualDate = project.dates[node.actual] || '-';

    let statusClass = '';
    let statusIcon = '';
    if (status.includes('逾期未完成')) { statusClass = 'delayed'; statusIcon = '🔴 '; }
    else if (status.includes('逾期完成')) { statusClass = 'delayed'; statusIcon = '⚠️ '; }
    else if (status.includes('按期完成')) { statusClass = 'completed'; statusIcon = '✅ '; }
    else if (status === '待完成') { statusIcon = '⏳ '; }

    rows += `
      <tr>
        <td><strong>${node.key}</strong></td>
        <td>${planDate}</td>
        <td>${actualDate}</td>
        <td class="node-step ${statusClass}" style="font-size:12px;">${statusIcon}${status || '-'}</td>
      </tr>
    `;
  }

  return `
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr style="background:#E3F2FD;">
          <th style="padding:6px 8px;text-align:left;">节点</th>
          <th style="padding:6px 8px;text-align:left;">计划日期</th>
          <th style="padding:6px 8px;text-align:left;">实际日期</th>
          <th style="padding:6px 8px;text-align:left;">状态</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/** 生成中试细化区域 — 含催办提醒 */
function renderPilotSection(project) {
  if (!project.pilotDetail) {
    return `
      <div class="detail-section">
        <h3>🔧 中试细化进度</h3>
        <p style="font-size:12px;color:#9E9E9E;">该项目暂无中试细化数据（Sheet2中未匹配到）</p>
      </div>
    `;
  }

  const d = project.pilotDetail;
  const today = new Date();

  // 分析催办项
  const chaseItems = [];

  // 研发归档
  if (d.archiveComplete === '否') {
    chaseItems.push({ node: '研发归档', who: '薛涵月（档案室）', status: '未完成', urgent: true });
  }
  // 物料齐套
  if (d.materialComplete === '否') {
    chaseItems.push({ node: '物料齐套', who: '（生产计划）', status: '未齐套', urgent: true });
  }
  // 治具完成
  if (!d.actualFixture && d.planFixture) {
    const planDate = new Date(d.planFixture);
    const daysLeft = Math.round((planDate - today) / 86400000);
    if (daysLeft < 0) {
      chaseItems.push({ node: '治具完成', who: '邵部长（工艺）', status: `超期${Math.abs(daysLeft)}天`, urgent: true });
    } else if (daysLeft <= 7) {
      chaseItems.push({ node: '治具完成', who: '邵部长（工艺）', status: `还有${daysLeft}天`, urgent: true });
    }
  }
  // 中试生产
  if (d.productionComplete === '否') {
    chaseItems.push({ node: '中试生产', who: '孙登琨（生产计划）', status: '未完成', urgent: true });
  }
  // 中试评审
  if (!d.actualReview && d.planPilotEnd) {
    chaseItems.push({ node: '中试评审', who: '姜雨豪（研发管理）', status: '待评审', urgent: true });
  }
  // 中试结论
  if (!d.pilotConclusion) {
    chaseItems.push({ node: '中试结论', who: '王国燕/郭嘉（项目计划）', status: '待出具', urgent: true });
  }
  // 问题闭环
  if (d.postConclusionIssues && !d.actualClosure) {
    chaseItems.push({ node: '问题闭环', who: '郭嘉（跟踪）', status: '待闭环', urgent: true });
  }

  let chaseHTML = '';
  if (chaseItems.length > 0) {
    chaseHTML = `
      <div style="background:#FFF3E0;border:1px solid #FFB74D;border-radius:6px;padding:10px;margin-bottom:12px;">
        <strong style="color:#E65100;">⚠️ 需要催办的节点：</strong>
        <ul style="margin:4px 0 0 16px;font-size:12px;color:#BF360C;">
          ${chaseItems.map(c => `<li><strong>${c.node}</strong> → ${c.who}（${c.status}）</li>`).join('')}
        </ul>
      </div>
    `;
  }

  return `
    <div class="detail-section">
      <h3>🔧 中试细化进度</h3>
      ${chaseHTML}
      ${renderPilotTable(d)}
    </div>
  `;
}

/** 生成中试细化表格 */
function renderPilotTable(detail) {
  return `
    <table class="pilot-table">
      <tr><td>计划数量</td><td>${detail.planQty || '-'}</td></tr>
      <tr><td>中试开始实际</td><td>${detail.actualPilotDate || '-'}</td></tr>
      <tr><td>研发归档计划</td><td>${detail.planArchive || '-'}</td></tr>
      <tr><td>研发归档硬件实际</td><td>${detail.actualArchiveHW || '-'}</td></tr>
      <tr><td>研发归档软件实际</td><td>${detail.actualArchiveSW || '-'}</td></tr>
      <tr><td>研发归档是否齐套</td><td class="${detail.archiveComplete === '是' ? 'status-yes' : 'status-no'}">${detail.archiveComplete || '-'} ${detail.archiveComplete === '否' ? '⚠️ 需催办' : ''}</td></tr>
      <tr><td>物料齐套计划</td><td>${detail.planMaterial || '-'}</td></tr>
      <tr><td>物料是否齐套</td><td class="${detail.materialComplete === '是' ? 'status-yes' : 'status-no'}">${detail.materialComplete || '-'} ${detail.materialComplete === '否' ? '⚠️ 需催办' : ''}</td></tr>
      <tr><td>物料备注</td><td>${detail.materialNote || '-'}</td></tr>
      <tr><td>治具完成计划</td><td>${detail.planFixture || '-'}</td></tr>
      <tr><td>治具完成实际</td><td>${detail.actualFixture || '-'} ${!detail.actualFixture && detail.planFixture ? '⚠️ 待完成' : ''}</td></tr>
      <tr><td>中试结束计划</td><td>${detail.planPilotEnd || '-'}</td></tr>
      <tr><td>中试生产是否完成</td><td class="${detail.productionComplete === '是' ? 'status-yes' : 'status-no'}">${detail.productionComplete || '-'} ${detail.productionComplete === '否' ? '⚠️ 需催办' : ''}</td></tr>
      <tr><td>实际中试数量</td><td>${detail.actualPilotQty || '-'}</td></tr>
      <tr><td>中试评审时间实际</td><td>${detail.actualReview || '-'} ${!detail.actualReview ? '⚠️ 待评审' : ''}</td></tr>
      <tr><td>中试结论</td><td><strong>${detail.pilotConclusion || '⚠️ 待出具'}</strong></td></tr>
      <tr><td>结论后跟踪问题</td><td>${detail.postConclusionIssues || '-'}</td></tr>
      <tr><td>解决计划时间</td><td>${detail.resolvePlanDate || '-'}</td></tr>
      <tr><td>问题闭环实际</td><td>${detail.actualClosure || '-'} ${detail.postConclusionIssues && !detail.actualClosure ? '⚠️ 待闭环' : ''}</td></tr>
      <tr><td>产品负责人</td><td>${detail.productOwner || '-'}</td></tr>
    </table>
  `;
}

// ============================================================
// 标星切换
// ============================================================
async function toggleStar(project) {
  const serialStr = String(project.serialNo);
  const idx = currentStarredList.indexOf(serialStr);
  if (idx >= 0) {
    currentStarredList.splice(idx, 1);
  } else {
    currentStarredList.push(serialStr);
  }
  await window.electronAPI.setStarred(currentStarredList);
  project.isStarred = (idx < 0);
  document.dispatchEvent(new CustomEvent('data-refresh'));
}

function getStarredList() { return currentStarredList; }
function setStarredList(list) { currentStarredList = list || []; }

// ============================================================
// 标记完成
// ============================================================
async function markCompleted(project) {
  const confirmed = confirm(`确定将「${project.name}」标记为提前完成吗？\n\n标记后该项目将从监控列表移除，并写回Excel。`);
  if (!confirmed) return;
  const result = await window.electronAPI.markCompleted(project.serialNo);
  if (result.error) {
    alert('标记失败：' + result.error);
    return;
  }
  document.dispatchEvent(new CustomEvent('excel-updated', { detail: result }));
}

// ============================================================
// 中试概览 — 显示所有中试项目及催办事项
// ============================================================
function renderPilotOverview(projects) {
  const panel = document.getElementById('detailPanel');
  const pilotProjects = projects.filter(function(p) { return p.pilotDetail; });

  if (pilotProjects.length === 0) {
    panel.innerHTML = '<div class="empty-state"><p>📂 没有中试阶段的项目</p></div>';
    return;
  }

  var html = '<div style="padding:16px;"><h2 style="margin-bottom:12px;">🔧 中试进度概览</h2>';
  html += '<p style="font-size:12px;color:#757575;margin-bottom:16px;">共 ' + pilotProjects.length + ' 个项目进入中试阶段</p>';

  for (var i = 0; i < pilotProjects.length; i++) {
    var p = pilotProjects[i];
    var d = p.pilotDetail;
    var today = new Date();

    // 收集催办项
    var chaseItems = [];
    if (d.archiveComplete === '否') chaseItems.push('研发归档→薛涵月（档案室）');
    if (d.materialComplete === '否') chaseItems.push('物料齐套→生产计划');
    if (!d.actualFixture && d.planFixture) {
      var fixturePlan = new Date(d.planFixture);
      var fixtureDays = Math.round((fixturePlan - today) / 86400000);
      if (fixtureDays < 0) chaseItems.push('治具→邵部长（工艺）超期' + Math.abs(fixtureDays) + '天');
      else if (fixtureDays <= 7) chaseItems.push('治具→邵部长（工艺）还有' + fixtureDays + '天');
    }
    if (d.productionComplete === '否') chaseItems.push('中试生产→孙登琨（生产计划）');
    if (!d.actualReview) chaseItems.push('中试评审→姜雨豪（研发管理）');
    if (!d.pilotConclusion) chaseItems.push('中试结论→王国燕/郭嘉（项目计划）');
    if (d.postConclusionIssues && !d.actualClosure) chaseItems.push('问题闭环→郭嘉');

    var urgencyBadge = '';
    if (chaseItems.length > 0) {
      urgencyBadge = '<span style="background:#E53935;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;">' + chaseItems.length + '项待催</span>';
    } else {
      urgencyBadge = '<span style="background:#E8F5E9;color:#2E7D32;padding:2px 8px;border-radius:10px;font-size:11px;">正常</span>';
    }

    html += '<div style="background:#fff;border:1px solid #E0E0E0;border-radius:8px;padding:12px;margin-bottom:8px;" onclick="document.querySelector(\'[data-serial=\\\'' + p.serialNo + '\\\']\').click();" style="cursor:pointer;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
    html += '<strong style="font-size:14px;">' + p.name + '</strong>';
    html += urgencyBadge;
    html += '</div>';
    html += '<div style="font-size:11px;color:#757575;">👤 ' + (p.person || '-') + ' | 📦 ' + (p.series || '-') + '</div>';

    if (chaseItems.length > 0) {
      html += '<div style="margin-top:8px;background:#FFF3E0;border-radius:4px;padding:8px;">';
      html += '<div style="font-size:11px;color:#E65100;font-weight:600;margin-bottom:4px;">⚠️ 需要催办：</div>';
      for (var j = 0; j < chaseItems.length; j++) {
        html += '<div style="font-size:11px;color:#BF360C;margin-left:8px;">• ' + chaseItems[j] + '</div>';
      }
      html += '</div>';
    }

    // 中试进度简表
    html += '<div style="margin-top:8px;font-size:11px;color:#616161;display:flex;gap:12px;flex-wrap:wrap;">';
    html += '<span>归档:' + (d.archiveComplete === '是' ? '✅' : '❌') + '</span>';
    html += '<span>物料:' + (d.materialComplete === '是' ? '✅' : '❌') + '</span>';
    html += '<span>治具:' + (d.actualFixture ? '✅' : '⏳') + '</span>';
    html += '<span>生产:' + (d.productionComplete === '是' ? '✅' : '❌') + '</span>';
    html += '<span>评审:' + (d.actualReview ? '✅' : '⏳') + '</span>';
    html += '<span>结论:' + (d.pilotConclusion || '⏳') + '</span>';
    html += '</div>';

    html += '</div>';
  }

  html += '</div>';
  panel.innerHTML = html;
}

window.UIRenderer = {
  renderKpiCards,
  renderProjectList,
  renderDetail,
  renderPilotOverview,
  getStarredList,
  setStarredList,
  toggleStar,
  filterByDelayedNode,
  clearFilterNode
};
