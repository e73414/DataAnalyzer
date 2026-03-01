const fs = require('fs');
const path = 'DataAnalyzer/n8n-workflows/Data Analyzer - Analyze.json';
const wf = JSON.parse(fs.readFileSync(path, 'utf8'));

// ── 1. Replace column_names with column_list (includes type info) ─────────────
const setNode = wf.nodes.find(n => n.name === 'Set Prompt and ID');
const assignments = setNode.parameters.assignments.assignments;

// Remove old column_names
const idx = assignments.findIndex(a => a.name === 'column_names');
if (idx !== -1) assignments.splice(idx, 1);

// Add column_list with types derived from generic column prefix
assignments.push({
  id: 'column_list',
  name: 'column_list',
  value: `={{ Object.entries($('Get Dataset').item.json.column_mapping).map(([name, col]) => {
  const typeMap = { real: 'numeric', string: 'text', int: 'integer', date: 'date', bool: 'boolean' };
  const type = typeMap[col.replace(/\\d+$/, '')] || 'text';
  return '"' + name + '" (' + type + ')';
}).join(', ') }}`,
  type: 'string'
});

console.log('✓ Replaced column_names with column_list (includes types)');

// ── 2. Update AI Agent system message — use column_list, replace COLUMNS line ─
const aiAgent = wf.nodes.find(n => n.name === 'AI Agent');
let sysMsg = aiAgent.parameters.options.systemMessage;

sysMsg = sysMsg.replace(
  'COLUMNS: {{ $json.column_names }}',
  'COLUMNS (name + type):\n{{ $json.column_list }}'
);

aiAgent.parameters.options.systemMessage = sysMsg;
console.log('✓ Updated AI Agent system message to use column_list');

fs.writeFileSync(path, JSON.stringify(wf));
console.log('\n✓ Saved');

// Verify
const check = JSON.parse(fs.readFileSync(path, 'utf8'));
const setCheck = check.nodes.find(n => n.name === 'Set Prompt and ID');
const cl = setCheck.parameters.assignments.assignments.find(a => a.name === 'column_list');
console.log('\ncolumn_list value:', cl?.value);
const aiCheck = check.nodes.find(n => n.name === 'AI Agent');
const msgSnippet = aiCheck.parameters.options.systemMessage;
const colIdx = msgSnippet.indexOf('COLUMNS');
console.log('\nSystem message COLUMNS section:', msgSnippet.substring(colIdx, colIdx + 60));
