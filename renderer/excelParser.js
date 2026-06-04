// ============================================================
// excelParser.js — Excel 原始数组 → 项目对象
// ============================================================

/** Excel 列索引常量 — Sheet1 */
const COL = {
  SERIAL: 0,        // 序号
  SERIES: 1,        // 系列
  CODE: 2,          // 编码
  DRAWING: 3,       // 图号
  NAME: 4,          // 名称
  MODEL: 5,         // 型号
  COUNT: 6,         // 款数
  ALT_CODE: 7,      // 替代编码
  ALT_MODEL: 8,     // 替代型号
  PLAN_CHECK_START: 9,     // 送检开始计划
  PLAN_CHECK_END: 10,      // 送检结束计划
  PLAN_PILOT_START: 11,    // 中试开始计划
  PLAN_PILOT_END: 12,      // 中试结束计划
  PLAN_PROD_START: 13,     // 批产开始计划
  PLAN_PROD_END: 14,       // 批产结束计划
  PLAN_LAUNCH: 15,         // 上市计划
  ACTUAL_CHECK_START: 16,  // 送检开始实际
  ACTUAL_CHECK_END: 17,    // 送检结束实际
  ACTUAL_PILOT_START: 18,  // 中试开始实际
  ACTUAL_PILOT_END: 19,    // 中试结束实际
  ACTUAL_PROD_START: 20,   // 批产开始实际
  ACTUAL_PROD_END: 21,     // 批产结束实际
  ACTUAL_LAUNCH: 22,       // 上市实际
  ACTUAL_CERT: 23,         // 获证实际
  MONITOR_CHECK_START: 24, // 送检开始监控
  MONITOR_CHECK_END: 25,   // 送检结束监控
  MONITOR_PILOT_START: 26, // 中试开始监控
  MONITOR_PILOT_END: 27,   // 中试结束监控
  MONITOR_PROD_START: 28,  // 批产开始监控
  MONITOR_PROD_END: 29,    // 批产结束监控
  CERT_STATUS: 30,         // 获证状态
  LAUNCH_STATUS: 31,       // 上市状态
  PROJECT_STATUS: 32,      // 项目状态
  MONITOR_FLAG: 33,        // 监控标记
  REMARK: 34,              // 备注
  COMPLEXITY: 35,          // 产品复杂度
  PERSON: 36,              // 负责人
  DEV_METHOD: 37,          // 开发方式
  CURRENT_STAGE: 38,       // 产品当前阶段/状态
  NEXT_NODE: 39,           // 按计划下一步推进节点
  NEW_STD_DATE: 40,        // 新标实施日期
  TRANSITION_END: 41       // 过渡期截至
};

/** Sheet2 列索引 */
const COL2 = {
  NAME: 0,
  MODEL: 1,
  ACTUAL_PILOT: 2,
  PLAN_QTY: 3,
  PLAN_ARCHIVE: 4,
  PLAN_MATERIAL: 5,
  PLAN_FIXTURE: 6,
  PLAN_PILOT_END: 7,
  ACTUAL_ARCHIVE_HW: 8,
  ACTUAL_ARCHIVE_SW: 9,
  ARCHIVE_COMPLETE: 10,
  MATERIAL_COMPLETE: 11,
  MATERIAL_NOTE: 12,
  ACTUAL_FIXTURE: 13,
  PRODUCTION_COMPLETE: 14,
  ACTUAL_PILOT_QTY: 15,
  ACTUAL_REVIEW: 16,
  PILOT_CONCLUSION: 17,
  POST_CONCLUSION_ISSUES: 18,
  RESOLVE_PLAN_DATE: 19,
  ACTUAL_CLOSURE: 20,
  PRODUCT_OWNER: 21
};

/** 日期已由主进程转为字符串，直接返回 */
function serialToISO(serial) {
  if (!serial || serial === '') return '';
  return String(serial);
}

/** 清理字符串 */
function clean(v) {
  if (v == null) return '';
  return String(v).replace(/\r?\n/g, ' ').trim();
}

/**
 * 解析 Sheet1 项目数据
 * @param {Array<Array>} rawData — XLSX.utils.sheet_to_json 返回的二维数组
 * @returns {Array<Object>} 项目对象数组
 */
function parseSheet1(rawData) {
  if (!rawData || rawData.length < 2) return [];
  const projects = [];

  for (let r = 1; r < rawData.length; r++) {
    const row = rawData[r];
    const name = clean(row[COL.NAME]);
    if (!name) continue;

    const serialNo = clean(row[COL.SERIAL]);

    const project = {
      _rowIndex: r,
      serialNo: serialNo,
      series: clean(row[COL.SERIES]),
      name: name,
      model: clean(row[COL.MODEL]),
      person: clean(row[COL.PERSON]),
      complexity: clean(row[COL.COMPLEXITY]),
      devMethod: clean(row[COL.DEV_METHOD]),

      // 日期
      dates: {
        送检开始计划: serialToISO(row[COL.PLAN_CHECK_START]),
        送检结束计划: serialToISO(row[COL.PLAN_CHECK_END]),
        中试开始计划: serialToISO(row[COL.PLAN_PILOT_START]),
        中试结束计划: serialToISO(row[COL.PLAN_PILOT_END]),
        批产开始计划: serialToISO(row[COL.PLAN_PROD_START]),
        批产结束计划: serialToISO(row[COL.PLAN_PROD_END]),
        上市计划: serialToISO(row[COL.PLAN_LAUNCH]),
        送检开始实际: serialToISO(row[COL.ACTUAL_CHECK_START]),
        送检结束实际: serialToISO(row[COL.ACTUAL_CHECK_END]),
        中试开始实际: serialToISO(row[COL.ACTUAL_PILOT_START]),
        中试结束实际: serialToISO(row[COL.ACTUAL_PILOT_END]),
        批产开始实际: serialToISO(row[COL.ACTUAL_PROD_START]),
        批产结束实际: serialToISO(row[COL.ACTUAL_PROD_END]),
        上市实际: serialToISO(row[COL.ACTUAL_LAUNCH]),
        获证实际: serialToISO(row[COL.ACTUAL_CERT])
      },

      // 监控状态
      monitors: {
        送检开始: clean(row[COL.MONITOR_CHECK_START]),
        送检结束: clean(row[COL.MONITOR_CHECK_END]),
        中试开始: clean(row[COL.MONITOR_PILOT_START]),
        中试结束: clean(row[COL.MONITOR_PILOT_END]),
        批产开始: clean(row[COL.MONITOR_PROD_START]),
        批产结束: clean(row[COL.MONITOR_PROD_END])
      },

      // 其他字段
      certStatus: clean(row[COL.CERT_STATUS]),
      launchStatus: clean(row[COL.LAUNCH_STATUS]),
      projectStatus: clean(row[COL.PROJECT_STATUS]),
      monitorFlag: row[COL.MONITOR_FLAG],  // 保持原始值（可能是数字0）
      remark: clean(row[COL.REMARK]),
      currentStage: clean(row[COL.CURRENT_STAGE]),
      nextNode: clean(row[COL.NEXT_NODE]),
      newStdDate: serialToISO(row[COL.NEW_STD_DATE]),
      transitionEnd: serialToISO(row[COL.TRANSITION_END]),

      // 衍生标记
      isLPCB: false,
      isCooperative: false,
      isStarred: false,

      // Sheet2 关联数据
      pilotDetail: null
    };

    // 检测 LPCB
    if (name.toUpperCase().includes('LPCB') || project.series.toUpperCase().includes('LPCB')) {
      project.isLPCB = true;
    }

    // 检测合作项目（监控标记=0）
    if (project.monitorFlag === 0 || project.monitorFlag === '0') {
      project.isCooperative = true;
    }

    projects.push(project);
  }

  return projects;
}

/**
 * 解析 Sheet2 中试细化数据
 * @returns {Map<string, Object>} key = 产品名称, value = 中试详细数据
 */
function parseSheet2(rawData) {
  if (!rawData || rawData.length < 2) return new Map();
  const map = new Map();

  for (let r = 1; r < rawData.length; r++) {
    const row = rawData[r];
    const name = clean(row[COL2.NAME]);
    if (!name) continue;

    map.set(name, {
      model: clean(row[COL2.MODEL]),
      actualPilotDate: serialToISO(row[COL2.ACTUAL_PILOT]),
      planQty: clean(row[COL2.PLAN_QTY]),
      planArchive: serialToISO(row[COL2.PLAN_ARCHIVE]),
      planMaterial: serialToISO(row[COL2.PLAN_MATERIAL]),
      planFixture: serialToISO(row[COL2.PLAN_FIXTURE]),
      planPilotEnd: serialToISO(row[COL2.PLAN_PILOT_END]),
      actualArchiveHW: serialToISO(row[COL2.ACTUAL_ARCHIVE_HW]),
      actualArchiveSW: clean(row[COL2.ACTUAL_ARCHIVE_SW]),
      archiveComplete: clean(row[COL2.ARCHIVE_COMPLETE]),
      materialComplete: clean(row[COL2.MATERIAL_COMPLETE]),
      materialNote: clean(row[COL2.MATERIAL_NOTE]),
      actualFixture: serialToISO(row[COL2.ACTUAL_FIXTURE]),
      productionComplete: clean(row[COL2.PRODUCTION_COMPLETE]),
      actualPilotQty: clean(row[COL2.ACTUAL_PILOT_QTY]),
      actualReview: serialToISO(row[COL2.ACTUAL_REVIEW]),
      pilotConclusion: clean(row[COL2.PILOT_CONCLUSION]),
      postConclusionIssues: clean(row[COL2.POST_CONCLUSION_ISSUES]),
      resolvePlanDate: serialToISO(row[COL2.RESOLVE_PLAN_DATE]),
      actualClosure: serialToISO(row[COL2.ACTUAL_CLOSURE]),
      productOwner: clean(row[COL2.PRODUCT_OWNER])
    });
  }

  return map;
}

/**
 * 主解析函数：合并两张 Sheet
 */
function parseExcelData(sheet1Raw, sheet2Raw) {
  const projects = parseSheet1(sheet1Raw);
  const pilotMap = parseSheet2(sheet2Raw);

  // 将 Sheet2 数据匹配到 Sheet1 项目
  for (const project of projects) {
    // 先精确匹配名称
    if (pilotMap.has(project.name)) {
      project.pilotDetail = pilotMap.get(project.name);
    } else {
      // 模糊匹配（可能名称略有差异）
      for (const [key, detail] of pilotMap) {
        if (project.name.includes(key) || key.includes(project.name)) {
          project.pilotDetail = detail;
          break;
        }
      }
    }
  }

  return projects;
}

// 导出到全局（供 app.js 使用）
window.ExcelParser = { parseExcelData, parseSheet1, parseSheet2, serialToISO, COL, COL2 };
