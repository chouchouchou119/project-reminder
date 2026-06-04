const express = require('express');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const app = express();
const PORT = 3000;
const EXCEL_FOLDER = path.join(__dirname, 'data');
const FILE_PATTERN = /^产品项目管理监控表(\d{8})\.xlsx$/;

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

function serialToDateStr(serial) {
  if (serial == null || serial === '' || serial < 1) return '';
  try {
    const p = XLSX.SSF.parse_date_code(serial);
    return p.y + '-' + String(p.m).padStart(2,'0') + '-' + String(p.d).padStart(2,'0');
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

function readExcel(filePath) {
  const wb = XLSX.readFile(filePath);
  const s1 = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const s2 = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[1]], { header: 1, defval: '' });
  convertDates(s1); convertDates(s2);
  return { sheet1: s1, sheet2: s2, fileName: path.basename(filePath), filePath };
}

// API
app.get('/api/load', (req, res) => {
  const latest = findLatestExcel(EXCEL_FOLDER);
  if (!latest) return res.json({ error: '未找到Excel文件' });
  res.json({ error: null, ...readExcel(latest.fullPath) });
});

// 静态文件
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const ifaces = os.networkInterfaces();
  console.log('\n  ========================================');
  console.log('    产品项目进度提醒 - 网页版');
  console.log('  ========================================\n');
  console.log('    本机: http://localhost:' + PORT + '\n');
  for (const [name, nets] of Object.entries(ifaces))
    for (const net of nets)
      if (net.family === 'IPv4' && !net.internal)
        console.log('    局域网: http://' + net.address + ':' + PORT);
  console.log('\n    按 Ctrl+C 停止\n');
});
