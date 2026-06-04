const express = require('express');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const app = express();
const DATA_FILE = path.join(__dirname, '..', 'data', '产品项目管理监控表20260529.xlsx');
const WEB_PASSWORD = '119119';

function serialToDateStr(serial) {
  if (serial == null || serial === '' || serial < 1) return '';
  try {
    const p = XLSX.SSF.parse_date_code(serial);
    return p.y + '-' + String(p.m).padStart(2, '0') + '-' + String(p.d).padStart(2, '0');
  } catch (e) { return ''; }
}

function convertDates(arr) {
  for (let r = 0; r < arr.length; r++)
    for (let c = 0; c < arr[r].length; c++)
      if (typeof arr[r][c] === 'number' && arr[r][c] > 40000 && arr[r][c] < 100000) {
        const ds = serialToDateStr(arr[r][c]);
        if (ds) arr[r][c] = ds;
      }
  return arr;
}

function readExcel() {
  if (!fs.existsSync(DATA_FILE)) return { error: '数据文件不存在' };
  const wb = XLSX.readFile(DATA_FILE);
  const s1 = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const s2 = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[1]], { header: 1, defval: '' });
  convertDates(s1); convertDates(s2);
  return { sheet1: s1, sheet2: s2, fileName: path.basename(DATA_FILE) };
}

// 密码验证
app.use((req, res, next) => {
  if (req.query.key === WEB_PASSWORD || (req.headers.cookie || '').includes('key=' + WEB_PASSWORD)) {
    if (req.query.key === WEB_PASSWORD) res.setHeader('Set-Cookie', 'key=' + WEB_PASSWORD + '; Path=/; Max-Age=86400; SameSite=Lax');
    return next();
  }
  if (req.method === 'GET') {
    return res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>项目进度提醒</title><style>*{margin:0;padding:0}body{font-family:"Microsoft YaHei",Arial;background:#E3F2FD;display:flex;justify-content:center;align-items:center;height:100vh}.b{background:#fff;padding:40px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.1);text-align:center}h2{color:#1565C0;margin-bottom:20px}input{padding:10px 16px;border:2px solid #E0E0E0;border-radius:8px;font-size:16px;width:200px;text-align:center;outline:none}input:focus{border-color:#1565C0}button{margin-top:12px;padding:10px 32px;background:#1565C0;color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer}button:hover{background:#0D47A1}.err{color:#E53935;margin-top:8px}</style></head><body><div class="b"><h2>🔐 请输入访问密码</h2><form method="get" action="/"><input type="password" name="key" placeholder="输入密码" autofocus><br>' + (req.query.key ? '<p class="err">密码错误</p>' : '') + '<button type="submit">确认</button></form></div></body></html>');
  }
  res.status(403).end();
});

// API
app.get('/api/load', (req, res) => {
  res.json(readExcel());
});

// 主页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// 静态文件
app.use(express.static(path.join(__dirname, '..', 'public')));

module.exports = app;
