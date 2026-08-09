// Global App State
let currentRole = 'TEACHER'; // TEACHER, LEADER_1..4, STUDENT
let currentGroupId = 1;
let studentsData = [];
let groupsData = [];
let overviewData = {};
let pendingLogsData = [];
let rankChart = null;
let groupChart = null;
let studentSubjectChart = null;
let activeModalStudentId = null;
let selectedKttxPeriod = 1; // 1, 2, 3, 4

// Period Change Sync Handlers
function onOverviewPeriodChange() {
  const select = document.getElementById('overview-period-select');
  if (select) {
    selectedKttxPeriod = parseInt(select.value);
    syncPeriodSelects();
    reloadPeriodData();
  }
}

function onScorePeriodChange() {
  const select = document.getElementById('score-period-select');
  if (select) {
    selectedKttxPeriod = parseInt(select.value);
    syncPeriodSelects();
    reloadPeriodData();
  }
}

function onReportPeriodChange() {
  const select = document.getElementById('report-period-select');
  if (select) {
    selectedKttxPeriod = parseInt(select.value);
    syncPeriodSelects();
    reloadPeriodData();
  }
}

function syncPeriodSelects() {
  const ovSelect = document.getElementById('overview-period-select');
  const scSelect = document.getElementById('score-period-select');
  const rpSelect = document.getElementById('report-period-select');
  
  if (ovSelect) ovSelect.value = selectedKttxPeriod;
  if (scSelect) scSelect.value = selectedKttxPeriod;
  if (rpSelect) rpSelect.value = selectedKttxPeriod;
}

async function reloadPeriodData() {
  await Promise.all([
    fetchOverview(),
    fetchStudents(),
    fetchLeaderboard()
  ]);
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log("KHTN Tracking System initialized...");
  await loadInitialData();
  fetchSystemMetrics();
});

// Load All Data from Flask Backend API
async function loadInitialData() {
  try {
    syncPeriodSelects();
    await Promise.all([
      fetchOverview(),
      fetchGroups(),
      fetchStudents(),
      fetchPendingLogs(),
      fetchLeaderboard()
    ]);

    populateRoleSelect();
    populateFilters();
    await populateDeclarationClasses();
    await populateScoreClasses();
    await populateReportCardClasses();
    populateLoginDropdown();
    updateRoleUI();
  } catch (err) {
    console.error("Error loading data from server:", err);
    showToast("Không thể kết nối Backend Server Flask!", "error");
  }
}

// Toast Notification Utility
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  let bgClass = 'toast-info';
  let icon = '<i class="fa-solid fa-info-circle text-cyan-300"></i>';

  if (type === 'success') {
    bgClass = 'toast-success';
    icon = '<i class="fa-solid fa-circle-check text-emerald-200"></i>';
  } else if (type === 'error') {
    bgClass = 'toast-error';
    icon = '<i class="fa-solid fa-circle-exclamation text-rose-200"></i>';
  }

  toast.className = `toast ${bgClass}`;
  toast.innerHTML = `${icon} <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Fetch Overview Stats
async function fetchOverview() {
  const res = await fetch(`/api/overview?period=${selectedKttxPeriod}`);
  overviewData = await res.json();

  document.getElementById('stat-total-students').innerText = overviewData.total_students || 16;
  document.getElementById('stat-pending-bp').innerText = overviewData.pending_declarations || 0;
  document.getElementById('stat-avg-score').innerText = (overviewData.avg_class_score || 0).toFixed(1);
  document.getElementById('teacher-pending-badge').innerText = `${overviewData.pending_declarations || 0} Chờ duyệt`;

  // Calculate Good/Excellent count
  const dist = overviewData.rank_distribution || {};
  const goodCount = (dist['Xuất Sắc'] || 0) + (dist['Giỏi'] || 0);
  document.getElementById('stat-good-count').innerText = goodCount;

  renderCharts(dist);
}

// Fetch Groups List
async function fetchGroups() {
  const res = await fetch('/api/groups');
  groupsData = await res.json();
}

// Fetch All Students
async function fetchStudents() {
  const res = await fetch(`/api/students?period=${selectedKttxPeriod}`);
  studentsData = await res.json();

  renderScoresTable();
  applyFilters();
  populateLeaderStudentSelect();
  populateReportCardStudentSelect();
  renderLeaderboard();
}

// Fetch Pending Logs for Teacher Review
async function fetchPendingLogs() {
  const res = await fetch('/api/bonus-penalty?status=PENDING');
  pendingLogsData = await res.json();
  renderTeacherPendingTable();
}

// Fetch Leaderboard
async function fetchLeaderboard() {
  renderLeaderboard();
}

// Fetch Group Declaration Logs for Group Leader
async function fetchGroupLogs(groupId) {
  const res = await fetch(`/api/bonus-penalty?group_id=${groupId}`);
  const logs = await res.json();
  renderGroupLogsTable(logs);
}

// Fetch System Metrics for Interactive Architecture Visualizer
async function fetchSystemMetrics() {
  try {
    const res = await fetch('/api/system/metrics');
    const data = await res.json();

    document.getElementById('m-students').innerText = data.tables?.students || 0;
    document.getElementById('m-groups').innerText = data.tables?.groups || 0;
    document.getElementById('m-scores').innerText = data.tables?.regular_scores || 0;
    document.getElementById('m-logs').innerText = data.tables?.bonus_penalty_logs || 0;
    document.getElementById('m-comments').innerText = data.tables?.teacher_comments || 0;
    document.getElementById('metrics-timestamp').innerText = `Sync: ${data.timestamp}`;
  } catch (e) {
    console.error("Metrics fetch error:", e);
  }
}

// --- ROLE SWITCHING LOGIC ---
async function switchRole(role) {
  currentRole = role;
  if (role.startsWith('LEADER_')) {
    const gId = parseInt(role.replace('LEADER_', ''));
    currentGroupId = gId;
  }
  await updateRoleUI();
  
  let roleDisplayName = role;
  if (role.startsWith('LEADER_')) {
    const matchedGroup = groupsData.find(g => g.id === currentGroupId);
    roleDisplayName = matchedGroup ? `Nhóm Trưởng - ${matchedGroup.name} (${matchedGroup.class_name})` : role;
  }
  showToast(`Đã chuyển sang vai trò: ${role === 'TEACHER' ? 'Giáo viên KHTN' : roleDisplayName}`, 'info');
}

async function updateRoleUI() {
  const leaderLabel = document.getElementById('current-leader-group-label');
  
  const classSelect = document.getElementById('form-class-select');
  if (classSelect) classSelect.disabled = false;
  const groupSelect = document.getElementById('form-group-select');
  if (groupSelect) groupSelect.disabled = false;

  // Re-populate class/group dropdown options with role-based restrictions
  await populateDeclarationClasses();

  // Hide recalculate, import excel, add student, save scores, pending approval container for non-teachers
  const isTeacher = (currentRole === 'TEACHER');
  
  const btnRecalc = document.getElementById('btn-recalculate-all');
  if (btnRecalc) btnRecalc.style.display = isTeacher ? 'inline-flex' : 'none';
  
  const classAdminActions = document.getElementById('classes-admin-actions');
  if (classAdminActions) classAdminActions.style.display = isTeacher ? 'flex' : 'none';
  
  const btnSaveScores = document.getElementById('btn-save-scores');
  if (btnSaveScores) btnSaveScores.style.display = isTeacher ? 'inline-flex' : 'none';

  const btnImportScores = document.getElementById('btn-import-scores');
  if (btnImportScores) btnImportScores.style.display = isTeacher ? 'inline-flex' : 'none';

  const btnEditComment = document.getElementById('btn-edit-rc-comment');
  if (btnEditComment) btnEditComment.style.display = isTeacher ? 'inline-flex' : 'none';

  const btnEditBadge = document.getElementById('btn-edit-rc-badge');
  if (btnEditBadge) btnEditBadge.style.display = isTeacher ? 'inline-flex' : 'none';
  
  const pendingContainer = document.getElementById('teacher-pending-container');
  if (pendingContainer) pendingContainer.style.display = isTeacher ? 'block' : 'none';

  // Navigation tab visibility: student cannot access Leader declaration
  const btnTabLeader = document.getElementById('btn-tab-leader');
  if (btnTabLeader) {
    btnTabLeader.style.display = (currentRole === 'STUDENT') ? 'none' : 'inline-block';
  }

  if (currentRole.startsWith('LEADER_')) {
    const matchedGroup = groupsData.find(g => g.id === currentGroupId);
    if (leaderLabel && matchedGroup) {
      leaderLabel.innerText = `Đang làm việc: ${matchedGroup.name} (${matchedGroup.class_name})`;
    } else if (leaderLabel) {
      leaderLabel.innerText = `Đang làm việc: Nhóm ID ${currentGroupId}`;
    }
    fetchGroupLogs(currentGroupId);
  } else {
    if (leaderLabel) leaderLabel.innerText = `Chế độ: ${currentRole}`;
    fetchGroupLogs(currentGroupId);
  }

  // Rerender tables to reflect disabled inputs or hidden edit/delete buttons
  renderScoresTable();
  applyFilters();
}

function getStudentSTT(s) {
  if (!s) return '';
  return s.student_code || '';
}

// Populate Student Select Dropdown in Declaration Form
function populateLeaderStudentSelect() {
  const groupSelect = document.getElementById('form-group-select');
  const select = document.getElementById('form-student-select');
  if (!select) return;
  select.innerHTML = '';

  const groupVal = groupSelect ? groupSelect.value : '';
  if (!groupVal) return;
  const groupId = parseInt(groupVal);

  const filtered = studentsData.filter(s => s.group_id === groupId);

  filtered.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    const stt = getStudentSTT(s);
    opt.innerText = `${stt}- ${s.full_name}`;
    select.appendChild(opt);
  });
}

// Auto update point suggestion based on category selection
function updatePointSuggestion(category) {
  const pointsInput = document.getElementById('form-points-input');
  if (!pointsInput) return;

  switch (category) {
    case 'Phát biểu KHTN':
      pointsInput.value = '0.5';
      break;
    case 'Bài tập nhóm':
      pointsInput.value = '1.0';
      break;
    case 'Thực hành thí nghiệm':
      pointsInput.value = '0.5';
      break;
    case 'Vi phạm nội quy':
      pointsInput.value = '-0.5';
      break;
    default:
      pointsInput.value = '0.5';
  }
}

// Submit Bonus / Penalty Declaration
async function submitBonusPenalty(event) {
  event.preventDefault();

  const studentId = parseInt(document.getElementById('form-student-select').value);
  const categoryType = document.getElementById('form-category-select').value;
  const points = parseFloat(document.getElementById('form-points-input').value);
  const reason = document.getElementById('form-reason-input').value;
  const weekNumber = parseInt(document.getElementById('form-week-select').value) || 1;

  const leaderObj = studentsData.find(s => s.group_id === currentGroupId && s.is_group_leader === 1);
  const declaredByStudentId = leaderObj ? leaderObj.id : studentId;

  const payload = {
    student_id: studentId,
    category_type: categoryType,
    points: points,
    reason: reason,
    declared_by_student_id: declaredByStudentId,
    week_number: weekNumber
  };

  try {
    const res = await fetch('/api/bonus-penalty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      showToast("Gửi khai báo thi đua thành công! Đang chờ Giáo viên duyệt.", "success");
      document.getElementById('form-reason-input').value = '';
      await loadInitialData();
    } else {
      showToast("Có lỗi xảy ra khi gửi khai báo.", "error");
    }
  } catch (err) {
    console.error("Submit error:", err);
  }
}

// Render Teacher Pending Approvals Table
function renderTeacherPendingTable() {
  const tbody = document.getElementById('table-teacher-pending-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (pendingLogsData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-400">🎉 Không có khai báo nào đang chờ duyệt!</td></tr>`;
    return;
  }

  pendingLogsData.forEach(log => {
    const tr = document.createElement('tr');
    const isBonus = log.points > 0;
    const ptsBadge = isBonus 
      ? `<span class="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">+${log.points}đ</span>`
      : `<span class="text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/30">${log.points}đ</span>`;

    tr.innerHTML = `
      <td class="p-3 font-semibold text-white">${log.student_name} (${log.student_code})</td>
      <td class="p-3 text-slate-300 font-medium">${log.class_name || 'Lớp'}</td>
      <td class="p-3 text-cyan-300">Nhóm ${log.group_number}</td>
      <td class="p-3 text-slate-300">${log.category_type}</td>
      <td class="p-3">${ptsBadge}</td>
      <td class="p-3 text-slate-300">${log.reason}</td>
      <td class="p-3 text-slate-400 text-xs">${log.declared_by_name || 'Nhóm trưởng'}</td>
      <td class="p-3 text-center space-x-2">
        <button onclick="reviewLog(${log.id}, 'APPROVED')" class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-1.5 rounded-lg font-medium shadow transition">
          <i class="fa-solid fa-check"></i> Duyệt
        </button>
        <button onclick="reviewLog(${log.id}, 'REJECTED')" class="bg-rose-600 hover:bg-rose-500 text-white text-xs px-3 py-1.5 rounded-lg font-medium shadow transition">
          <i class="fa-solid fa-xmark"></i> Từ chối
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Review Log (Approve / Reject)
async function reviewLog(logId, status) {
  try {
    const res = await fetch(`/api/bonus-penalty/${logId}/review`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: status, teacher_note: `Đã ${status === 'APPROVED' ? 'duyệt' : 'từ chối'} bởi Giáo viên KHTN` })
    });

    if (res.ok) {
      showToast(`Đã ${status === 'APPROVED' ? 'chấp nhận' : 'từ chối'} khai báo!`, status === 'APPROVED' ? 'success' : 'info');
      await loadInitialData();
    }
  } catch (err) {
    console.error("Review error:", err);
  }
}

// Render Scores Table in Teacher Tab
function renderScoresTable() {
  const tbody = document.getElementById('table-scores-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const classSelect = document.getElementById('score-class-select');
  const classVal = classSelect ? classSelect.value : 'ALL';

  let filtered = studentsData;
  if (classVal !== 'ALL') {
    const classId = parseInt(classVal);
    filtered = studentsData.filter(s => s.class_id === classId);
  }

  filtered.forEach((s, index) => {
    const tr = document.createElement('tr');
    tr.className = "hover:bg-white/5 transition";

    const totalBpVal = s.total_bonus_penalty || 0;
    const bpClass = totalBpVal > 0 ? 'text-emerald-400 font-bold' : (totalBpVal < 0 ? 'text-rose-400 font-bold' : 'text-slate-400');
    const bpText = totalBpVal > 0 ? `+${totalBpVal}` : `${totalBpVal}`;

    const isDisabled = (currentRole === 'TEACHER') ? '' : 'disabled';

    tr.innerHTML = `
      <td class="p-3 text-center text-slate-400 font-bold font-mono text-xs">${s.student_code}</td>
      <td class="p-3 font-semibold text-white">
        ${s.is_group_leader ? '<span class="text-amber-400" title="Nhóm trưởng">👑</span>' : ''}
        ${s.full_name}
      </td>
      <td class="p-3 text-slate-300 font-medium">${s.class_name || 'Lớp'}</td>
      <td class="p-3 text-cyan-300 text-xs">Nhóm ${s.group_number}</td>
      <td class="p-3 text-center">
        <input type="number" step="0.1" min="0" max="10" data-sid="${s.id}" data-stype="1" value="${(s.avg_kttx || 0.0).toFixed(1)}" ${isDisabled} class="score-input glass-input w-20 px-1 text-center font-bold text-sm text-indigo-300">
      </td>
      <td class="p-3 text-center ${bpClass}">${bpText}</td>
      <td class="p-3 text-center font-extrabold text-cyan-400 text-base">${(s.final_score || 0.0).toFixed(1)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Batch Save All KTTX Scores
async function saveAllScores() {
  const inputs = document.querySelectorAll('.score-input');
  const payload = [];

  inputs.forEach(inp => {
    payload.push({
      student_id: parseInt(inp.getAttribute('data-sid')),
      score_type_id: selectedKttxPeriod,
      score: parseFloat(inp.value || 0)
    });
  });

  try {
    const res = await fetch('/api/scores/batch-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      showToast("Đã cập nhật điểm KTTX và tính lại điểm chốt KHTN thành công!", "success");
      await loadInitialData();
    }
  } catch (err) {
    console.error("Save scores error:", err);
  }
}

// Manual Recalculate Trigger
async function recalculateAll() {
  await fetch('/api/recalculate-all', { method: 'POST' });
  await loadInitialData();
  showToast("Đã tính toán lại toàn bộ điểm chốt KHTN!", "success");
}

// Render Group Declaration Logs Table for Group Leader
function renderGroupLogsTable(logs) {
  const tbody = document.getElementById('table-group-logs-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!logs || logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400">Chưa có khai báo thi đua nào cho nhóm này.</td></tr>`;
    return;
  }

  logs.forEach(log => {
    const tr = document.createElement('tr');
    let statusBadge = '<span class="px-2 py-0.5 rounded text-xs badge-pending">⏳ Chờ duyệt</span>';
    if (log.status === 'APPROVED') statusBadge = '<span class="px-2 py-0.5 rounded text-xs badge-approved">✓ Đã duyệt</span>';
    if (log.status === 'REJECTED') statusBadge = '<span class="px-2 py-0.5 rounded text-xs badge-rejected">✕ Từ chối</span>';

    const ptsBadge = log.points > 0 
      ? `<span class="text-emerald-400 font-bold">+${log.points}đ</span>`
      : `<span class="text-rose-400 font-bold">${log.points}đ</span>`;

    tr.innerHTML = `
      <td class="p-3 font-medium text-white">${log.student_name}</td>
      <td class="p-3 text-slate-300">${log.category_type}</td>
      <td class="p-3">${ptsBadge}</td>
      <td class="p-3 text-slate-300">${log.reason}</td>
      <td class="p-3 text-slate-400 text-xs">${log.created_at}</td>
      <td class="p-3">${statusBadge}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Render Leaderboard
function onLeaderboardClassChange() {
  renderLeaderboard();
}

function renderLeaderboard() {
  const studentContainer = document.getElementById('leaderboard-students-list');
  const disciplineContainer = document.getElementById('leaderboard-discipline-list');
  if (!studentContainer || !disciplineContainer) return;

  studentContainer.innerHTML = '';
  disciplineContainer.innerHTML = '';

  const classSelect = document.getElementById('leaderboard-class-select');
  const classVal = classSelect ? classSelect.value : 'ALL';
  const className = classSelect ? classSelect.options[classSelect.selectedIndex].text : 'Lớp';

  // 1. Filter studentsData by chosen class
  let filtered = [...studentsData];
  if (classVal !== 'ALL') {
    const classId = parseInt(classVal);
    filtered = filtered.filter(s => s.class_id === classId);
  }

  if (filtered.length === 0) {
    studentContainer.innerHTML = `<div class="p-6 text-center text-slate-400">Không có học sinh nào vinh danh.</div>`;
    disciplineContainer.innerHTML = `<div class="p-6 text-center text-slate-400">Không có học sinh nào cảnh cáo.</div>`;
    return;
  }

  const limit = classVal === 'ALL' ? 10 : 3;

  // --- RENDER KHEN THƯỞNG (HONOR ROLL) ---
  const studentsTitle = document.getElementById('leaderboard-students-title');
  if (studentsTitle) {
    studentsTitle.innerHTML = `<i class="fa-solid fa-crown text-amber-400 text-xl"></i> ${classVal === 'ALL' ? 'Top 10 Học Sinh Xuất Sắc Môn KHTN' : `Top 3 Học Sinh Xuất Sắc - ${className}`}`;
  }

  // Get distinct scores descending to handle ties correctly
  const distinctScoresDesc = [...new Set(filtered.map(s => s.final_score))].sort((a, b) => b - a);
  let cutoffScoreDesc = -999;
  if (distinctScoresDesc.length > 0) {
    if (distinctScoresDesc.length <= limit) {
      cutoffScoreDesc = distinctScoresDesc[distinctScoresDesc.length - 1];
    } else {
      cutoffScoreDesc = distinctScoresDesc[limit - 1];
    }
  }

  const honorRoll = filtered.filter(s => s.final_score >= cutoffScoreDesc).sort((a, b) => b.final_score - a.final_score);

  honorRoll.forEach((s, idx) => {
    let medal = `<span class="w-7 h-7 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs">${idx + 1}</span>`;
    if (idx === 0) medal = `<span class="w-7 h-7 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center font-bold text-xs shadow-lg shadow-amber-500/40">🥇</span>`;
    if (idx === 1) medal = `<span class="w-7 h-7 rounded-full bg-slate-300 text-slate-950 flex items-center justify-center font-bold text-xs">🥈</span>`;
    if (idx === 2) medal = `<span class="w-7 h-7 rounded-full bg-amber-700 text-white flex items-center justify-center font-bold text-xs">🥉</span>`;

    const div = document.createElement('div');
    div.className = "flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-white/5 hover:border-indigo-500/30 transition cursor-pointer";
    div.onclick = () => openStudentModal(s.id);
    div.innerHTML = `
      <div class="flex items-center gap-3">
        ${medal}
        <div>
          <h4 class="font-bold text-white text-sm">${s.full_name}</h4>
          <p class="text-xs text-slate-400">${s.class_name || 'Lớp'} - ${s.group_name} • KTTX: ${(s.avg_kttx || 0).toFixed(1)} • Cộng/Trừ: ${s.total_bonus_penalty >= 0 ? '+' : ''}${(s.total_bonus_penalty || 0).toFixed(1)}</p>
        </div>
      </div>
      <div class="text-right">
        <span class="text-lg font-extrabold text-cyan-400">${(s.final_score || 0).toFixed(1)}</span>
        <span class="block text-[10px] text-emerald-400 uppercase font-semibold">${s.academic_rank || 'Chưa xếp loại'}</span>
      </div>
    `;
    studentContainer.appendChild(div);
  });

  // --- RENDER KỶ LUẬT / CẢNH BÁO ---
  const disciplineTitle = document.getElementById('leaderboard-discipline-title');
  if (disciplineTitle) {
    disciplineTitle.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-rose-500 text-xl"></i> ${classVal === 'ALL' ? 'Top 10 Học Sinh Cần Chú Ý (Kỷ Luật)' : `Học Sinh Cần Chú Ý - ${className}`}`;
  }

  // Get distinct scores ascending to handle ties correctly
  const distinctScoresAsc = [...new Set(filtered.map(s => s.final_score))].sort((a, b) => a - b);
  let cutoffScoreAsc = 999;
  if (distinctScoresAsc.length > 0) {
    if (distinctScoresAsc.length <= limit) {
      cutoffScoreAsc = distinctScoresAsc[distinctScoresAsc.length - 1];
    } else {
      cutoffScoreAsc = distinctScoresAsc[limit - 1];
    }
  }

  const disciplineRoll = filtered.filter(s => s.final_score <= cutoffScoreAsc).sort((a, b) => a.final_score - b.final_score);

  disciplineRoll.forEach((s, idx) => {
    let warningIcon = `<span class="w-7 h-7 rounded-full bg-rose-950 text-rose-400 flex items-center justify-center font-bold text-xs border border-rose-500/20">${idx + 1}</span>`;
    if (idx === 0) warningIcon = `<span class="w-7 h-7 rounded-full bg-rose-600 text-white flex items-center justify-center font-bold text-xs shadow-lg shadow-rose-500/40">⚠️</span>`;

    let warnStatus = "Nhắc nhở thi đua";
    if ((s.final_score || 0) < 5.0) warnStatus = "Cảnh báo học lực Yếu!";
    else if ((s.final_score || 0) < 6.5) warnStatus = "Cần cố gắng học tập!";

    const div = document.createElement('div');
    div.className = "flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-white/5 hover:border-rose-500/30 transition cursor-pointer";
    div.onclick = () => openStudentModal(s.id);
    div.innerHTML = `
      <div class="flex items-center gap-3">
        ${warningIcon}
        <div>
          <h4 class="font-bold text-white text-sm">${s.full_name}</h4>
          <p class="text-xs text-slate-400">${s.class_name || 'Lớp'} - ${s.group_name} • KTTX: ${(s.avg_kttx || 0).toFixed(1)} • Cộng/Trừ: ${s.total_bonus_penalty >= 0 ? '+' : ''}${(s.total_bonus_penalty || 0).toFixed(1)}</p>
        </div>
      </div>
      <div class="text-right">
        <span class="text-lg font-extrabold text-rose-400">${(s.final_score || 0).toFixed(1)}</span>
        <span class="block text-[10px] text-rose-500 uppercase font-semibold">${warnStatus}</span>
      </div>
    `;
    disciplineContainer.appendChild(div);
  });
}

// Render Chart.js
function renderCharts(rankDist) {
  // Rank Chart
  const ctxRank = document.getElementById('chart-rank');
  if (ctxRank) {
    if (rankChart) rankChart.destroy();
    rankChart = new Chart(ctxRank, {
      type: 'doughnut',
      data: {
        labels: Object.keys(rankDist),
        datasets: [{
          data: Object.values(rankDist),
          backgroundColor: ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#9ca3af', font: { family: 'Outfit' } } }
        }
      }
    });
  }

  // Group Performance Chart
  const ctxGroup = document.getElementById('chart-group');
  if (ctxGroup) {
    if (groupChart) groupChart.destroy();

    // Calc average per group dynamically (Group Numbers 1-8)
    const groupScores = {};
    const groupCounts = {};
    for (let i = 1; i <= 8; i++) {
      groupScores[i] = 0;
      groupCounts[i] = 0;
    }

    studentsData.forEach(s => {
      const gNum = s.group_number;
      if (gNum in groupScores) {
        groupScores[gNum] += (s.final_score || 0);
        groupCounts[gNum] += 1;
      }
    });

    const labels = [];
    const avgScores = [];
    const colors = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#14b8a6']; // 8 colors
    
    for (let i = 1; i <= 8; i++) {
      labels.push(`Nhóm ${i}`);
      const tot = groupScores[i] || 0;
      const count = groupCounts[i] || 0;
      avgScores.push(count ? parseFloat((tot / count).toFixed(1)) : 0.0);
    }

    groupChart = new Chart(ctxGroup, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Điểm TB Nhóm KHTN',
          data: avgScores,
          backgroundColor: colors,
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: false, min: 0, max: 10, ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          x: { ticks: { color: '#9ca3af' }, grid: { display: false } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }
}

// Navigation Tab Switcher
function showTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));

  const target = document.getElementById(tabId);
  if (target) target.classList.remove('hidden');

  const btn = document.getElementById(`btn-${tabId}`);
  if (btn) btn.classList.add('active');

  if (tabId === 'tab-architecture') {
    fetchSystemMetrics();
  } else if (tabId === 'tab-report-card') {
    const sel = document.getElementById('report-card-student-select');
    if (sel && sel.value) loadReportCard(sel.value);
  }
}

// --- RENDER CLASSES / STUDENTS / GROUPS TAB ---
function applyFilters() {
  const searchVal = document.getElementById('filter-search-input')?.value.trim().toLowerCase() || '';
  const classVal = document.getElementById('filter-class-select')?.value || 'ALL';
  const groupVal = document.getElementById('filter-group-select')?.value || 'ALL';

  let filtered = studentsData;

  if (searchVal) {
    filtered = filtered.filter(s => 
      s.full_name.toLowerCase().includes(searchVal) || 
      s.student_code.toLowerCase().includes(searchVal)
    );
  }

  if (classVal !== 'ALL') {
    const classId = parseInt(classVal);
    filtered = filtered.filter(s => s.class_id === classId);
  }

  if (groupVal !== 'ALL') {
    const groupId = parseInt(groupVal);
    filtered = filtered.filter(s => s.group_id === groupId);
  }

  renderClassesTable(filtered);
}

function renderClassesTable(list = null) {
  const tbody = document.getElementById('table-classes-students-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const displayList = list !== null ? list : studentsData;

  if (displayList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400">Không tìm thấy học sinh phù hợp!</td></tr>`;
    return;
  }

  displayList.forEach((s, index) => {
    const tr = document.createElement('tr');
    tr.className = "hover:bg-white/5 transition";

    tr.innerHTML = `
      <td class="p-3 text-center text-slate-400 font-bold font-mono">${s.student_code}</td>
      <td class="p-3 font-semibold text-white">
        <div class="flex items-center gap-2">
          <span>${s.avatar_gender === 'female' ? '👩‍🎓' : '👨‍🎓'}</span>
          <span>${s.full_name}</span>
        </div>
      </td>
      <td class="p-3 text-slate-300 font-medium">${s.class_name || 'Lớp'}</td>
      <td class="p-3 text-slate-300 font-medium">${s.group_name}</td>
      <td class="p-3 text-center">
        ${s.is_group_leader ? '<span class="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-bold px-2 py-0.5 rounded-full">👑 Nhóm Trưởng</span>' : '<span class="text-slate-400 text-[11px]">Thành viên</span>'}
      </td>
      <td class="p-3 text-center">
        <button onclick="openStudentModal(${s.id})" class="bg-indigo-900/60 hover:bg-indigo-800 text-indigo-300 border border-indigo-500/30 px-2.5 py-1 rounded-lg text-xs font-medium transition ${currentRole === 'TEACHER' ? 'mr-1' : ''}">
          <i class="fa-solid fa-eye mr-1"></i> Hồ sơ
        </button>
        ${currentRole === 'TEACHER' ? `
        <button onclick="openEditStudentModal(${s.id})" class="bg-amber-900/40 hover:bg-amber-800 text-amber-300 border border-amber-500/30 px-2 py-1 rounded-lg text-xs transition mr-1" title="Sửa học sinh">
          <i class="fa-solid fa-pen mr-1"></i> Sửa
        </button>
        <button onclick="confirmDeleteStudent(${s.id}, '${s.full_name}')" class="bg-rose-900/40 hover:bg-rose-800 text-rose-300 border border-rose-500/30 px-2 py-1 rounded-lg text-xs transition" title="Xóa học sinh">
          <i class="fa-solid fa-trash"></i>
        </button>
        ` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// --- LOGIN MODAL & AUTHENTICATION HANDLERS ---
function openLoginModal() {
  const modal = document.getElementById('modal-login');
  if (modal) modal.classList.remove('hidden');
}

function closeLoginModal() {
  const modal = document.getElementById('modal-login');
  if (modal) modal.classList.add('hidden');
}

function quickFillLogin(username, password) {
  document.getElementById('login-username').value = username;
  document.getElementById('login-password').value = password;
}

async function submitLogin(event) {
  event.preventDefault();

  const u = document.getElementById('login-username').value;
  const p = document.getElementById('login-password').value;

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      showToast(`✅ ${data.message} Chào mừng ${data.name}!`, "success");
      closeLoginModal();
      document.getElementById('role-select').value = data.role;
      switchRole(data.role);
      showTab('tab-overview');
    } else {
      showToast(`❌ ${data.message || 'Đăng nhập không thành công!'}`, "error");
    }
  } catch (err) {
    console.error("Login fetch error:", err);
    showToast("ĐĂNG NHẬP KHÔNG THÀNH CÔNG! Không kết nối được tới server.", "error");
  }
}

function testLoginFail() {
  openLoginModal();
  quickFillLogin('sai_taikhoan', '000000');
  showToast("❌ [Luồng Minh Họa]: Hãy bấm 'Đăng Nhập Ngay' để xem thông báo Đăng nhập không thành công!", "info");
}

// --- REPORT CARD HANDLERS ---
function populateReportCardStudentSelect() {
  const select = document.getElementById('report-card-student-select');
  if (!select) return;
  select.innerHTML = '';

  const classSelect = document.getElementById('report-card-class-select');
  const classVal = classSelect ? classSelect.value : 'ALL';

  let filtered = studentsData;
  if (classVal !== 'ALL') {
    const classId = parseInt(classVal);
    filtered = studentsData.filter(s => s.class_id === classId);
  }

  filtered.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    const stt = getStudentSTT(s);
    opt.innerText = `${stt}- ${s.full_name} (${s.class_name} - ${s.group_name})`;
    select.appendChild(opt);
  });

  if (filtered.length > 0) {
    select.value = filtered[0].id;
    loadReportCard(filtered[0].id);
  } else {
    document.getElementById('rc-name').innerText = '--';
    document.getElementById('rc-code').innerText = '--';
    document.getElementById('rc-group').innerText = '--';
    document.getElementById('rc-class').innerText = '--';
    document.getElementById('rc-role').innerText = 'Thành viên';
    document.getElementById('rc-kttx').innerText = '0.0';
    document.getElementById('rc-bp').innerText = '+0.0';
    document.getElementById('rc-final').innerText = '0.0';
    document.getElementById('rc-teacher-comment').innerText = '"..."';
    const badgeBox = document.getElementById('rc-badges-list');
    if (badgeBox) badgeBox.innerHTML = '';
  }
}

let rcChart = null;

async function loadReportCard(studentId) {
  try {
    const res = await fetch(`/api/student/${studentId}?period=${selectedKttxPeriod}`);
    if (!res.ok) return;
    const data = await res.json();

    const stt = getStudentSTT(data);
    document.getElementById('rc-name').innerText = `${stt}- ${data.full_name}`;
    document.getElementById('rc-code').innerText = data.student_code;
    document.getElementById('rc-group').innerText = data.group_name;
    document.getElementById('rc-class').innerText = data.class_name || 'Lớp';
    document.getElementById('rc-role').innerText = data.is_group_leader ? "👑 Nhóm Trưởng" : "Thành viên";
    document.getElementById('rc-kttx').innerText = (data.avg_kttx || 0).toFixed(1);
    const kttxLabelEl = document.getElementById('rc-kttx-label');
    if (kttxLabelEl) {
      kttxLabelEl.innerText = `Điểm KTTX ${selectedKttxPeriod}`;
    }
    document.getElementById('rc-bp').innerText = `${data.total_bonus_penalty >= 0 ? '+' : ''}${(data.total_bonus_penalty || 0).toFixed(1)}`;
    document.getElementById('rc-final').innerText = (data.final_score || 0).toFixed(1);

    // Comment
    const latestComm = (data.teacher_comments && data.teacher_comments.length > 0) ? data.teacher_comments[0].comment : "Học sinh có tiến bộ tốt trong các giờ học KHTN, hăng hái tham gia hoạt động nhóm.";
    document.getElementById('rc-teacher-comment').innerText = `"${latestComm}"`;

    // Populate editor inputs
    const textEditor = document.getElementById('rc-comment-textarea');
    const badgeEditor = document.getElementById('rc-badge-input');
    if (textEditor) textEditor.value = latestComm;
    if (badgeEditor) {
      const latestBadge = (data.teacher_comments && data.teacher_comments.length > 0) ? data.teacher_comments[0].badge : "Học Viên Tích Cực KHTN";
      badgeEditor.value = latestBadge;
    }
    toggleEditComment(false);

    // Badges
    const badgeBox = document.getElementById('rc-badges-list');
    badgeBox.innerHTML = '';
    let hasBadge = false;
    if (data.teacher_comments && data.teacher_comments.length > 0) {
      data.teacher_comments.forEach(c => {
        if (c.badge && c.badge.trim() !== '') {
          hasBadge = true;
          const span = document.createElement('span');
          span.className = "bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3 py-1 rounded-full text-xs font-bold";
          span.innerText = c.badge;
          badgeBox.appendChild(span);
        }
      });
    }
    if (!hasBadge) {
      if ((data.final_score || 0) >= 9.0) {
        badgeBox.innerHTML = `<span class="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-3 py-1 rounded-full text-xs font-bold">🌟 Học Viên Xuất Sắc KHTN</span>`;
      } else {
        badgeBox.innerHTML = `<span class="text-xs text-slate-500 italic">Không có danh hiệu</span>`;
      }
    }

    // Render Radar Chart for Report Card
    const ctx = document.getElementById('chart-rc-subject');
    if (ctx) {
      if (rcChart) rcChart.destroy();
      rcChart = new Chart(ctx, {
        type: 'radar',
        data: {
          labels: ['Vật Lý KHTN', 'Hóa Học KHTN', 'Sinh Học KHTN', 'Thực Hành Thí Nghiệm'],
          datasets: [{
            label: 'Năng Lực Môn Học',
            data: [
              (data.final_score * 0.95).toFixed(1),
              (data.final_score * 1.0).toFixed(1),
              (data.final_score * 0.9).toFixed(1),
              (data.final_score * 1.02 > 10 ? 10 : data.final_score * 1.02).toFixed(1)
            ],
            backgroundColor: 'rgba(236, 72, 153, 0.25)',
            borderColor: '#ec4899',
            borderWidth: 2,
            pointBackgroundColor: '#38bdf8'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            r: {
              angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
              grid: { color: 'rgba(255, 255, 255, 0.1)' },
              pointLabels: { color: '#cbd5e1', font: { family: 'Outfit', size: 10 } },
              ticks: { backdropColor: 'transparent', color: '#94a3b8', stepSize: 2, min: 0, max: 10 }
            }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
  } catch (err) {
    console.error("Report card load error:", err);
  }
}

function toggleEditComment(show) {
  const editor = document.getElementById('rc-comment-editor');
  if (editor) {
    if (show) {
      editor.classList.remove('hidden');
    } else {
      editor.classList.add('hidden');
    }
  }
}

async function saveRcComment() {
  const studentSelect = document.getElementById('report-card-student-select');
  if (!studentSelect) return;
  const studentId = parseInt(studentSelect.value);
  if (!studentId) {
    showToast("Vui lòng chọn học sinh!", "warning");
    return;
  }

  const commentText = document.getElementById('rc-comment-textarea').value.trim();
  const badgeText = document.getElementById('rc-badge-input').value.trim();

  if (!commentText) {
    showToast("Vui lòng nhập nội dung nhận xét!", "warning");
    return;
  }

  try {
    const res = await fetch(`/api/student/${studentId}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        comment: commentText,
        badge: badgeText,
        week_num: selectedKttxPeriod
      })
    });

    if (res.ok) {
      showToast("Đã lưu nhận xét và danh hiệu thành công!", "success");
      toggleEditComment(false);
      await loadReportCard(studentId);
    } else {
      const err = await res.json();
      showToast(err.error || "Không thể lưu nhận xét!", "error");
    }
  } catch (err) {
    console.error("Save comment error:", err);
    showToast("Lỗi kết nối khi lưu nhận xét!", "error");
  }
}

// --- STUDENT PROFILE MODAL ---
async function openStudentModal(studentId) {
  activeModalStudentId = studentId;
  const modal = document.getElementById('modal-student-detail');
  if (!modal) return;

  try {
    const res = await fetch(`/api/student/${studentId}`);
    if (!res.ok) return;
    const data = await res.json();

    document.getElementById('student-modal-name').innerText = data.full_name;
    document.getElementById('student-modal-sub').innerText = `Mã HS: ${data.student_code} • ${data.class_name} - ${data.group_name} ${data.is_group_leader ? '👑 (Nhóm trưởng)' : ''}`;
    document.getElementById('student-modal-kttx').innerText = (data.avg_kttx || 0).toFixed(1);
    document.getElementById('student-modal-bp').innerText = `${data.total_bonus_penalty >= 0 ? '+' : ''}${(data.total_bonus_penalty || 0).toFixed(1)}`;
    document.getElementById('student-modal-final').innerText = (data.final_score || 0).toFixed(1);

    // Avatar Icon
    const avatarBox = document.getElementById('student-modal-avatar');
    avatarBox.innerText = data.full_name.substring(0, 2).toUpperCase();

    // Render Student Radar Chart
    renderStudentSubjectChart(data.scores || []);

    // Render Comments & Badges
    const commentsList = document.getElementById('student-modal-comments-list');
    commentsList.innerHTML = '';
    if (data.teacher_comments && data.teacher_comments.length > 0) {
      data.teacher_comments.forEach(c => {
        const div = document.createElement('div');
        div.className = "bg-indigo-950/40 p-2.5 rounded-lg border border-indigo-500/20 text-xs flex justify-between items-start gap-2";
        div.innerHTML = `
          <div>
            <span class="inline-block bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded text-[11px] mb-1">${c.badge || 'Tuyên Dương KHTN'}</span>
            <p class="text-slate-200">${c.comment}</p>
          </div>
          <span class="text-[10px] text-slate-400 font-mono">${c.created_at.substring(0, 10)}</span>
        `;
        commentsList.appendChild(div);
      });
    } else {
      commentsList.innerHTML = `<p class="text-slate-400 text-xs italic">Chưa có nhận xét định kỳ từ giáo viên.</p>`;
    }

    // Render Bonus/Penalty Logs Timeline
    const logsBody = document.getElementById('student-modal-logs-body');
    logsBody.innerHTML = '';
    if (data.bonus_penalty_logs && data.bonus_penalty_logs.length > 0) {
      data.bonus_penalty_logs.forEach(l => {
        const tr = document.createElement('tr');
        const stBadge = l.status === 'APPROVED' ? '<span class="text-emerald-400 font-bold">✓ Đã duyệt</span>' : (l.status === 'REJECTED' ? '<span class="text-rose-400">✕ Từ chối</span>' : '<span class="text-amber-400">⏳ Chờ duyệt</span>');
        tr.innerHTML = `
          <td class="p-2">${l.category_type}</td>
          <td class="p-2 font-bold ${l.points >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${l.points >= 0 ? '+' : ''}${l.points}đ</td>
          <td class="p-2 text-slate-300">${l.reason}</td>
          <td class="p-2">${stBadge}</td>
        `;
        logsBody.appendChild(tr);
      });
    } else {
      logsBody.innerHTML = `<tr><td colspan="4" class="p-3 text-center text-slate-400">Chưa có lịch sử thi đua.</td></tr>`;
    }

    modal.classList.remove('hidden');
  } catch (err) {
    console.error("Open modal error:", err);
  }
}

function closeStudentModal() {
  const modal = document.getElementById('modal-student-detail');
  if (modal) modal.classList.add('hidden');
}

// Render Student KHTN Radar Chart
function renderStudentSubjectChart(scores) {
  const ctx = document.getElementById('chart-student-subject');
  if (!ctx) return;

  const scoreMap = { 1: 9.0, 2: 8.5, 3: 9.0, 4: 9.5 };
  scores.forEach(s => {
    scoreMap[s.score_type_id] = s.score;
  });

  const chartData = [
    scoreMap[1] || 8.0, // Miệng
    scoreMap[2] || 8.5, // 15P Vật Lý
    scoreMap[3] || 8.0, // 15P Hóa Học
    scoreMap[4] || 9.0  // TH Sinh Học
  ];

  if (studentSubjectChart) studentSubjectChart.destroy();

  studentSubjectChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['Kiểm Tra Miệng', '15P Vật Lý', '15P Hóa Học', 'Thực Hành Sinh Học'],
      datasets: [{
        label: 'Điểm Số Thành Phần',
        data: chartData,
        backgroundColor: 'rgba(6, 182, 212, 0.25)',
        borderColor: '#06b6d4',
        borderWidth: 2,
        pointBackgroundColor: '#6366f1',
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
          pointLabels: { color: '#cbd5e1', font: { family: 'Outfit', size: 11 } },
          ticks: { backdropColor: 'transparent', color: '#94a3b8', stepSize: 2, min: 0, max: 10 }
        }
      },
      plugins: { legend: { display: false } }
    }
  });
}

// Submit Teacher Comment for Active Student
async function submitTeacherComment(event) {
  event.preventDefault();
  if (!activeModalStudentId) return;

  const commentText = document.getElementById('comment-text-input').value;
  const badgeVal = document.getElementById('comment-badge-select').value;

  try {
    const res = await fetch(`/api/student/${activeModalStudentId}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: commentText, badge: badgeVal, week_num: 1 })
    });

    if (res.ok) {
      showToast("Đã thêm nhận xét và tuyên dương thành công!", "success");
      document.getElementById('comment-text-input').value = '';
      openStudentModal(activeModalStudentId);
    }
  } catch (err) {
    console.error("Comment submit error:", err);
  }
}

// --- ADD STUDENT MODAL ---
function openAddStudentModal() {
  const modal = document.getElementById('modal-add-student');
  if (modal) {
    modal.classList.remove('hidden');
    populateAddStudentClasses();
  }
}

function closeAddStudentModal() {
  const modal = document.getElementById('modal-add-student');
  if (modal) modal.classList.add('hidden');
}

async function submitAddStudent(event) {
  event.preventDefault();

  const name = document.getElementById('add-name-input').value;
  const code = document.getElementById('add-code-input').value;
  const groupId = parseInt(document.getElementById('add-group-select').value);
  const gender = document.getElementById('add-gender-select').value;
  const isLeader = document.getElementById('add-is-leader-check').checked;

  try {
    const res = await fetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: name,
        student_code: code,
        group_id: groupId,
        avatar_gender: gender,
        is_group_leader: isLeader
      })
    });

    const resData = await res.json();
    if (res.ok) {
      showToast(resData.message, "success");
      closeAddStudentModal();
      document.getElementById('form-add-student').reset();
      await loadInitialData();
    } else {
      showToast(resData.error || "Có lỗi khi thêm học sinh", "error");
    }
  } catch (err) {
    console.error("Add student error:", err);
  }
}

// --- DELETE STUDENT ---
async function confirmDeleteStudent(studentId, studentName) {
  if (confirm(`Bạn có chắc chắn muốn xóa học sinh "${studentName}" khỏi hệ thống không?`)) {
    try {
      const res = await fetch(`/api/student/${studentId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message, "success");
        await loadInitialData();
      } else {
        showToast(data.error || "Xóa thất bại", "error");
      }
    } catch (err) {
      console.error("Delete error:", err);
    }
  }
}

// --- EXPORT SUMMARY DATA ---
async function exportDataSummary() {
  try {
    const scoreClassSelect = document.getElementById('score-class-select');
    const classId = scoreClassSelect ? scoreClassSelect.value : 'ALL';
    
    const url = `/api/export/summary?class_id=${classId}&period=${selectedKttxPeriod}`;
    const res = await fetch(url);
    const data = await res.json();

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `BaoCao_KHTN_Lop_${classId}_${data.export_date}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    showToast("Đã tải xuống file báo cáo tổng hợp KHTN!", "success");
  } catch (err) {
    console.error("Export error:", err);
  }
}

// --- DYNAMIC SELECT POPULATORS ---
function populateRoleSelect() {
  const roleSelect = document.getElementById('role-select');
  if (!roleSelect) return;
  
  const prevVal = roleSelect.value || currentRole;
  
  roleSelect.innerHTML = '';
  
  const optTeacher = document.createElement('option');
  optTeacher.value = 'TEACHER';
  optTeacher.innerText = '👩‍🏫 Quản Trị Viên (Cô Linh)';
  roleSelect.appendChild(optTeacher);
  
  // Sort groups by class_name, then by group_number
  const sortedGroups = [...groupsData].sort((a, b) => {
    if (a.class_name !== b.class_name) return a.class_name.localeCompare(b.class_name);
    return a.group_number - b.group_number;
  });
  
  sortedGroups.forEach(g => {
    const opt = document.createElement('option');
    opt.value = `LEADER_${g.id}`;
    opt.innerText = `🚩 Nhóm Trưởng - ${g.name} (${g.class_name})`;
    roleSelect.appendChild(opt);
  });
  
  const optStudent = document.createElement('option');
  optStudent.value = 'STUDENT';
  optStudent.innerText = '🎓 Học Sinh / Phụ Huynh';
  roleSelect.appendChild(optStudent);
  
  // Set value back, check if valid option first
  if (prevVal.startsWith('LEADER_')) {
    const matched = groupsData.find(g => `LEADER_${g.id}` === prevVal || `LEADER_${g.group_number}` === prevVal);
    if (matched) {
      roleSelect.value = `LEADER_${matched.id}`;
      currentRole = `LEADER_${matched.id}`;
      currentGroupId = matched.id;
    } else {
      roleSelect.value = 'TEACHER';
      currentRole = 'TEACHER';
    }
  } else if (Array.from(roleSelect.options).some(o => o.value === prevVal)) {
    roleSelect.value = prevVal;
  } else {
    roleSelect.value = 'TEACHER';
    currentRole = 'TEACHER';
  }
}

async function populateFilters() {
  const classSelect = document.getElementById('filter-class-select');
  if (classSelect) {
    classSelect.innerHTML = '<option value="ALL">Tất cả lớp học</option>';
    try {
      const res = await fetch('/api/classes');
      const classes = await res.json();
      classes.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.innerText = c.name;
        classSelect.appendChild(opt);
      });
    } catch (e) {
      console.error("Error fetching classes for filter:", e);
    }
  }

  const lbClassSelect = document.getElementById('leaderboard-class-select');
  if (lbClassSelect) {
    lbClassSelect.innerHTML = '<option value="ALL">Tất cả các lớp</option>';
    try {
      const res = await fetch('/api/classes');
      const classes = await res.json();
      classes.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.innerText = c.name;
        lbClassSelect.appendChild(opt);
      });
    } catch (e) {
      console.error("Error fetching classes for leaderboard filter:", e);
    }
  }

  updateGroupFilterOptions();
}

function updateGroupFilterOptions() {
  const classSelect = document.getElementById('filter-class-select');
  const groupSelect = document.getElementById('filter-group-select');
  if (!groupSelect) return;
  
  const prevVal = groupSelect.value;
  groupSelect.innerHTML = '<option value="ALL">Tất cả tổ nhóm</option>';
  
  const classVal = classSelect ? classSelect.value : 'ALL';
  let filteredGroups = groupsData;
  if (classVal !== 'ALL') {
    const classId = parseInt(classVal);
    filteredGroups = groupsData.filter(g => g.class_id === classId);
  }
  
  const sortedGroups = [...filteredGroups].sort((a, b) => a.group_number - b.group_number);
  sortedGroups.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.innerText = `${g.name} (${g.class_name})`;
    groupSelect.appendChild(opt);
  });
  
  if (Array.from(groupSelect.options).some(o => o.value === prevVal)) {
    groupSelect.value = prevVal;
  } else {
    groupSelect.value = 'ALL';
  }
}

function onFilterClassChange() {
  updateGroupFilterOptions();
  applyFilters();
}

async function populateAddStudentClasses() {
  const classSelect = document.getElementById('add-class-select');
  if (!classSelect) return;
  
  classSelect.innerHTML = '';
  
  try {
    const res = await fetch('/api/classes');
    const classes = await res.json();
    classes.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.innerText = c.name;
      classSelect.appendChild(opt);
    });
    
    onAddStudentClassChange();
  } catch (e) {
    console.error("Error fetching classes for add student:", e);
  }
}

function onAddStudentClassChange() {
  const classSelect = document.getElementById('add-class-select');
  const groupSelect = document.getElementById('add-group-select');
  if (!classSelect || !groupSelect) return;
  
  groupSelect.innerHTML = '';
  
  const classVal = classSelect.value;
  if (!classVal) return;
  const classId = parseInt(classVal);
  
  const classGroups = groupsData.filter(g => g.class_id === classId);
  classGroups.sort((a, b) => a.group_number - b.group_number);
  
  classGroups.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.innerText = g.name;
    groupSelect.appendChild(opt);
  });
}

async function populateDeclarationClasses() {
  const classSelect = document.getElementById('form-class-select');
  if (!classSelect) return;
  
  classSelect.innerHTML = '';
  
  try {
    const res = await fetch('/api/classes');
    let classes = await res.json();
    
    // Filter class list for group leaders
    if (currentRole.startsWith('LEADER_')) {
      const matchedGroup = groupsData.find(g => g.id === currentGroupId);
      if (matchedGroup) {
        classes = classes.filter(c => c.id === matchedGroup.class_id);
      }
    }

    classes.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.innerText = c.name;
      classSelect.appendChild(opt);
    });
    
    if (currentRole.startsWith('LEADER_')) {
      const matchedGroup = groupsData.find(g => g.id === currentGroupId);
      if (matchedGroup) {
        classSelect.value = matchedGroup.class_id;
      }
    }
    
    // Populate groups
    onDeclarationClassChange();
  } catch (e) {
    console.error("Error fetching classes for declaration:", e);
  }
}

function onDeclarationClassChange() {
  const classSelect = document.getElementById('form-class-select');
  const groupSelect = document.getElementById('form-group-select');
  if (!classSelect || !groupSelect) return;
  
  groupSelect.innerHTML = '';
  
  const classVal = classSelect.value;
  if (!classVal) return;
  const classId = parseInt(classVal);
  
  let classGroups = groupsData.filter(g => g.class_id === classId);
  
  // Filter group list for group leaders
  if (currentRole.startsWith('LEADER_')) {
    const currentGroup = groupsData.find(g => g.id === currentGroupId);
    if (currentGroup) {
      classGroups = classGroups.filter(g => g.id === currentGroup.id);
    }
  }
  
  classGroups.sort((a, b) => a.group_number - b.group_number);
  
  classGroups.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.innerText = g.name;
    groupSelect.appendChild(opt);
  });
  
  // Populate students
  populateLeaderStudentSelect();
}

async function populateScoreClasses() {
  const scoreClassSelect = document.getElementById('score-class-select');
  if (!scoreClassSelect) return;
  scoreClassSelect.innerHTML = '<option value="ALL">Tất cả lớp học</option>';
  try {
    const res = await fetch('/api/classes');
    const classes = await res.json();
    classes.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.innerText = c.name;
      scoreClassSelect.appendChild(opt);
    });
  } catch (e) {
    console.error("Error fetching classes for score filter:", e);
  }
}

function onScoreClassFilterChange() {
  renderScoresTable();
}

// --- EXCEL BULK IMPORT HANDLERS ---
let pendingImportStudents = [];

function normalizeHeader(str) {
  if (!str) return '';
  return str.toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove Vietnamese accents
    .replace(/\s+/g, "_") // Replace spaces with underscores
    .replace(/[^a-z0-9_]/g, ""); // Keep only alphanumeric and underscores
}

function downloadExcelTemplate() {
  const wb = XLSX.utils.book_new();
  const headers = ["Họ và Tên", "Lớp", "Nhóm", "Giới Tính", "Nhóm Trưởng"];
  
  const sampleData = [
    {
      "Họ và Tên": "Nguyễn Văn A",
      "Lớp": "8A",
      "Nhóm": "Nhóm 1",
      "Giới Tính": "Nam",
      "Nhóm Trưởng": "Không"
    },
    {
      "Họ và Tên": "Trần Thị B",
      "Lớp": "8A",
      "Nhóm": "Nhóm 2",
      "Giới Tính": "Nữ",
      "Nhóm Trưởng": "Có"
    },
    {
      "Họ và Tên": "Lê Văn C",
      "Lớp": "8A",
      "Nhóm": "Nhóm 1",
      "Giới Tính": "Nam",
      "Nhóm Trưởng": "Không"
    }
  ];
  
  const ws = XLSX.utils.json_to_sheet(sampleData, { header: headers });
  XLSX.utils.book_append_sheet(wb, ws, "Danh Sach Hoc Sinh");
  XLSX.writeFile(wb, "Mau_Danh_Sach_Hoc_Sinh.xlsx");
  showToast("Đã tải xuống file Excel mẫu thành công!", "success");
}

function triggerExcelInput() {
  const inp = document.getElementById('excel-file-input');
  if (inp) inp.click();
}

function closePreviewImportModal() {
  const modal = document.getElementById('modal-preview-import');
  if (modal) modal.classList.add('hidden');
  pendingImportStudents = [];
}

async function handleExcelUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const json = XLSX.utils.sheet_to_json(worksheet);

      if (json.length === 0) {
        showToast("File Excel rỗng hoặc không đúng định dạng!", "error");
        return;
      }

      // Detect and map headers
      const rawRow = json[0];
      const headerKeys = Object.keys(rawRow);
      
      let nameKey = '';
      let classKey = '';
      let groupKey = '';
      let genderKey = '';
      let leaderKey = '';

      headerKeys.forEach(k => {
        const norm = normalizeHeader(k);
        if (norm === 'ho_va_ten' || norm === 'ho_ten' || norm === 'ten' || norm === 'fullname' || norm === 'full_name') {
          nameKey = k;
        } else if (norm === 'lop' || norm === 'class' || norm === 'class_name') {
          classKey = k;
        } else if (norm === 'nhom' || norm === 'nhom_khtn' || norm === 'to' || norm === 'group' || norm === 'group_name') {
          groupKey = k;
        } else if (norm === 'gioi_tinh' || norm === 'gender' || norm === 'gioi') {
          genderKey = k;
        } else if (norm === 'nhom_truong' || norm === 'leader' || norm === 'truong_nhom' || norm === 'is_leader') {
          leaderKey = k;
        }
      });

      if (!nameKey || !classKey || !groupKey) {
        showToast("Không tìm thấy các cột bắt buộc: Họ và Tên, Lớp, Nhóm!", "error");
        return;
      }

      const errors = [];
      const validStudents = [];
      const seenExcelStudents = new Set();

      // Find current max student_code as integer to assign new ones sequentially
      const existingInts = studentsData
        .map(s => parseInt(s.student_code))
        .filter(num => !isNaN(num));
      const maxCode = existingInts.length > 0 ? Math.max(...existingInts) : 0;

      json.forEach((row, idx) => {
        const rowNum = idx + 2;

        const fullName = String(row[nameKey] || '').trim();
        const className = String(row[classKey] || '').trim();
        const groupName = String(row[groupKey] || '').trim();
        
        let gender = genderKey ? String(row[genderKey] || 'Nam').trim() : 'Nam';
        let isLeader = leaderKey ? (row[leaderKey] || false) : false;

        // Auto-generate Mã HS (STT) based on row index and maxCode
        const studentCode = String(maxCode + idx + 1);

        // 1. Họ và tên không được để trống
        if (!fullName) {
          errors.push(`Dòng ${rowNum}: Họ và tên không được để trống.`);
        }

        // 2. Lớp không được để trống
        if (!className) {
          errors.push(`Dòng ${rowNum}: Lớp không được để trống.`);
        }

        // 3. Nhóm KHTN phải là số nhóm hợp lệ (1-8)
        let groupNum = null;
        const match = groupName.match(/\d+/);
        if (match) {
          groupNum = parseInt(match[0]);
        }
        if (!groupName) {
          errors.push(`Dòng ${rowNum}: Nhóm không được để trống.`);
        } else if (groupNum === null || groupNum < 1 || groupNum > 8) {
          errors.push(`Dòng ${rowNum}: Nhóm KHTN không hợp lệ (Phải từ 1 đến 8, ví dụ: Nhóm 1, Nhóm 2...).`);
        }

        if (fullName && className) {
          const comboKey = `${fullName.toLowerCase()}||${className.toLowerCase()}`;

          // 4. Không cho nhập trùng học sinh trong file Excel
          if (seenExcelStudents.has(comboKey)) {
            errors.push(`Dòng ${rowNum}: Học sinh "${fullName}" lớp "${className}" bị trùng lặp trong file Excel.`);
          } else {
            seenExcelStudents.add(comboKey);
          }

          // 5. Không cho nhập trùng học sinh đã tồn tại trong DB
          const isDbDuplicate = studentsData.some(s => 
            s.full_name.toLowerCase().trim() === fullName.toLowerCase() && 
            s.class_name.toLowerCase().trim() === className.toLowerCase()
          );
          if (isDbDuplicate) {
            errors.push(`Dòng ${rowNum}: Học sinh "${fullName}" lớp "${className}" đã tồn tại trên hệ thống.`);
          }
        }

        // Standardize gender and isLeader
        gender = (gender.toLowerCase().includes('nữ') || gender.toLowerCase().includes('female')) ? 'female' : 'male';
        if (typeof isLeader === 'string') {
          isLeader = isLeader.toLowerCase().includes('có') || isLeader.toLowerCase().includes('yes') || isLeader.toLowerCase() === 'x' || isLeader.toLowerCase() === '1';
        } else if (typeof isLeader === 'number') {
          isLeader = isLeader === 1;
        }

        if (fullName && className && groupNum !== null && groupNum >= 1 && groupNum <= 8) {
          const hasError = errors.some(err => err.startsWith(`Dòng ${rowNum}:`));
          if (!hasError) {
            validStudents.push({
              student_code: studentCode,
              full_name: fullName,
              class_name: className,
              group_name: `Nhóm ${groupNum}`,
              avatar_gender: gender,
              is_group_leader: isLeader
            });
          }
        }
      });

      // Render errors
      const errBox = document.getElementById('import-errors-box');
      const errList = document.getElementById('import-errors-list');
      const btnConfirm = document.getElementById('btn-confirm-import');

      if (errors.length > 0) {
        errBox.classList.remove('hidden');
        errList.innerHTML = '';
        errors.forEach(err => {
          const li = document.createElement('li');
          li.innerText = err;
          errList.appendChild(li);
        });
        if (btnConfirm) {
          btnConfirm.disabled = true;
          btnConfirm.classList.add('opacity-50', 'cursor-not-allowed');
        }
      } else {
        errBox.classList.add('hidden');
        errList.innerHTML = '';
        if (btnConfirm) {
          btnConfirm.disabled = false;
          btnConfirm.classList.remove('opacity-50', 'cursor-not-allowed');
        }
      }

      // Render Preview Body
      const previewBody = document.getElementById('table-preview-import-body');
      previewBody.innerHTML = '';
      document.getElementById('import-preview-count').innerText = `Số học sinh hợp lệ để nhập: ${validStudents.length}`;

      validStudents.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="p-2.5 text-center text-slate-400 font-bold font-mono">${s.student_code}</td>
          <td class="p-2.5 font-semibold text-white">${s.full_name}</td>
          <td class="p-2.5 text-slate-300">${s.class_name}</td>
          <td class="p-2.5 text-center text-slate-300">${s.group_name}</td>
          <td class="p-2.5 text-center text-slate-300">${s.avatar_gender === 'female' ? 'Nữ' : 'Nam'}</td>
          <td class="p-2.5 text-center">${s.is_group_leader ? '<span class="text-amber-400 font-bold">👑 Nhóm Trưởng</span>' : 'Thành viên'}</td>
        `;
        previewBody.appendChild(tr);
      });

      pendingImportStudents = validStudents;
      
      const modal = document.getElementById('modal-preview-import');
      if (modal) modal.classList.remove('hidden');

    } catch (err) {
      console.error("Excel parse error:", err);
      showToast("Lỗi khi giải mã file Excel!", "error");
    }
    event.target.value = '';
  };
  reader.readAsArrayBuffer(file);
}

async function confirmExcelImport() {
  if (pendingImportStudents.length === 0) {
    showToast("Không có học sinh nào hợp lệ để nhập!", "warning");
    return;
  }

  showToast(`Đang tải lên ${pendingImportStudents.length} học sinh...`, "info");

  try {
    const res = await fetch('/api/students/bulk-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pendingImportStudents)
    });
    const resData = await res.json();
    
    if (res.ok) {
      showToast(`Đã nhập thành công ${resData.success_count} học sinh!`, "success");
      closePreviewImportModal();
      await loadInitialData();
    } else {
      showToast(resData.error || "Nhập danh sách học sinh thất bại!", "error");
    }
  } catch (err) {
    console.error("Import submit error:", err);
    showToast("Lỗi hệ thống khi gửi yêu cầu nhập!", "error");
  }
}

function triggerExcelScoreInput() {
  const input = document.getElementById('excel-score-input');
  if (input) input.click();
}

async function handleExcelScoreUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const json = XLSX.utils.sheet_to_json(worksheet);

      if (json.length === 0) {
        showToast("File Excel rỗng hoặc không đúng định dạng!", "error");
        return;
      }

      let successCount = 0;
      let matchedCount = 0;

      json.forEach(row => {
        // Find score column
        const scoreKey = Object.keys(row).find(key => 
          key.toLowerCase().includes('điểm') || 
          key.toLowerCase().includes('diem') || 
          key.toLowerCase().includes('score') || 
          key.toLowerCase().includes('kttx')
        );
        
        if (scoreKey === undefined) return;
        const rawScore = row[scoreKey];
        if (rawScore === undefined || rawScore === null || rawScore === '') return;
        const score = parseFloat(rawScore);
        if (isNaN(score) || score < 0 || score > 10) return;

        // Find name or code columns
        const nameKey = Object.keys(row).find(key => 
          key.toLowerCase().includes('họ') || 
          key.toLowerCase().includes('ho') || 
          key.toLowerCase().includes('tên') || 
          key.toLowerCase().includes('ten') || 
          key.toLowerCase().includes('name')
        );
        const nameVal = nameKey ? String(row[nameKey] || '').trim() : '';

        const codeKey = Object.keys(row).find(key => 
          key.toLowerCase().includes('mã') || 
          key.toLowerCase().includes('ma') || 
          key.toLowerCase().includes('code')
        );
        const codeVal = codeKey ? String(row[codeKey] || '').trim() : '';

        let matchedStudent = null;
        if (codeVal) {
          matchedStudent = studentsData.find(s => s.student_code.toLowerCase() === codeVal.toLowerCase());
        }
        if (!matchedStudent && nameVal) {
          const normName = nameVal.toLowerCase().replace(/\s+/g, ' ').trim();
          matchedStudent = studentsData.find(s => s.full_name.toLowerCase().replace(/\s+/g, ' ').trim() === normName);
        }

        if (matchedStudent) {
          const inputEl = document.querySelector(`.score-input[data-sid="${matchedStudent.id}"]`);
          if (inputEl) {
            inputEl.value = score.toFixed(1);
            // Highlight successfully loaded input on the UI
            inputEl.style.borderColor = '#10b981';
            inputEl.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
            matchedCount++;
          }
          successCount++;
        }
      });

      if (successCount === 0) {
        showToast("Không tìm thấy học sinh trùng khớp hoặc điểm số không hợp lệ!", "error");
      } else {
        showToast(`Đã nạp thành công ${matchedCount}/${successCount} điểm học sinh lên bảng điểm! Hãy kiểm tra lại và bấm 'Lưu Điểm & Chốt'.`, "success");
      }
    } catch (err) {
      console.error("Excel score parse error:", err);
      showToast("Lỗi khi giải mã file Excel!", "error");
    }
    event.target.value = '';
  };
  reader.readAsArrayBuffer(file);
}

// --- EDIT STUDENT PROFILE HANDLERS ---
function closeEditStudentModal() {
  const modal = document.getElementById('modal-edit-student');
  if (modal) modal.classList.add('hidden');
}

async function openEditStudentModal(studentId) {
  const s = studentsData.find(st => st.id === studentId);
  if (!s) {
    showToast("Không tìm thấy dữ liệu học sinh!", "error");
    return;
  }

  document.getElementById('edit-student-id').value = s.id;
  document.getElementById('edit-name-input').value = s.full_name;
  document.getElementById('edit-code-input').value = s.student_code;
  document.getElementById('edit-gender-select').value = s.avatar_gender || 'male';
  document.getElementById('edit-is-leader-check').checked = !!s.is_group_leader;

  const classSelect = document.getElementById('edit-class-select');
  if (classSelect) {
    classSelect.innerHTML = '';
    try {
      const res = await fetch('/api/classes');
      const classes = await res.json();
      classes.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.innerText = c.name;
        classSelect.appendChild(opt);
      });
      classSelect.value = s.class_id;
    } catch (err) {
      console.error("Error populating edit classes:", err);
    }
  }

  await updateEditStudentGroupOptions(s.class_id, s.group_id);

  const modal = document.getElementById('modal-edit-student');
  if (modal) modal.classList.remove('hidden');
}

async function updateEditStudentGroupOptions(classId, selectedGroupId = null) {
  const groupSelect = document.getElementById('edit-group-select');
  if (!groupSelect) return;
  groupSelect.innerHTML = '';

  const classGroups = groupsData.filter(g => g.class_id === classId);
  classGroups.sort((a, b) => a.group_number - b.group_number);

  classGroups.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.innerText = g.name;
    groupSelect.appendChild(opt);
  });

  if (selectedGroupId && classGroups.some(g => g.id === selectedGroupId)) {
    groupSelect.value = selectedGroupId;
  } else if (classGroups.length > 0) {
    groupSelect.value = classGroups[0].id;
  }
}

function onEditStudentClassChange() {
  const classSelect = document.getElementById('edit-class-select');
  if (!classSelect) return;
  const classId = parseInt(classSelect.value);
  updateEditStudentGroupOptions(classId);
}

async function submitEditStudent(event) {
  event.preventDefault();
  const studentId = parseInt(document.getElementById('edit-student-id').value);
  
  const payload = {
    full_name: document.getElementById('edit-name-input').value.trim(),
    student_code: document.getElementById('edit-code-input').value.trim().toUpperCase(),
    group_id: parseInt(document.getElementById('edit-group-select').value),
    avatar_gender: document.getElementById('edit-gender-select').value,
    is_group_leader: document.getElementById('edit-is-leader-check').checked
  };

  try {
    const res = await fetch(`/api/student/${studentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    
    if (res.ok) {
      showToast(data.message || "Cập nhật hồ sơ học sinh thành công!", "success");
      closeEditStudentModal();
      await loadInitialData();
    } else {
      showToast(data.error || "Cập nhật thất bại!", "error");
    }
  } catch (err) {
    console.error("Edit student submit error:", err);
    showToast("Lỗi hệ thống khi cập nhật hồ sơ!", "error");
  }
}

async function populateReportCardClasses() {
  const select = document.getElementById('report-card-class-select');
  if (!select) return;
  select.innerHTML = '<option value="ALL">Tất cả các lớp</option>';
  try {
    const res = await fetch('/api/classes');
    const classes = await res.json();
    classes.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.innerText = c.name;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Error populating report card classes:", err);
  }
}

function onReportCardClassChange() {
  populateReportCardStudentSelect();
}

async function printAllFiltered() {
  const classSelect = document.getElementById('report-card-class-select');
  const classVal = classSelect ? classSelect.value : 'ALL';
  
  let filtered = studentsData;
  if (classVal !== 'ALL') {
    const classId = parseInt(classVal);
    filtered = studentsData.filter(s => s.class_id === classId);
  }
  
  if (filtered.length === 0) {
    showToast("Không có học sinh nào để in!", "error");
    return;
  }

  // Create temporary container for printable cards
  let printContainer = document.getElementById('print-bulk-container');
  if (!printContainer) {
    printContainer = document.createElement('div');
    printContainer.id = 'print-bulk-container';
    document.body.appendChild(printContainer);
  }
  printContainer.innerHTML = '';

  showToast(`Đang chuẩn bị dữ liệu cho ${filtered.length} phiếu báo điểm...`, "info");

  // Fetch full details of all students and build the DOM
  for (let i = 0; i < filtered.length; i++) {
    const s = filtered[i];
    try {
      const res = await fetch(`/api/student/${s.id}?period=${selectedKttxPeriod}`);
      if (!res.ok) continue;
      const data = await res.json();
      
      const stt = getStudentSTT(data);
      const totalBpVal = data.total_bonus_penalty || 0;
      const bpText = `${totalBpVal >= 0 ? '+' : ''}${totalBpVal.toFixed(1)}`;
      
      const latestComm = (data.teacher_comments && data.teacher_comments.length > 0) 
        ? data.teacher_comments[0].comment 
        : "Học sinh có tiến bộ tốt trong các giờ học KHTN, hăng hái tham gia hoạt động nhóm.";
      
      let badgesHtml = '';
      let hasBadge = false;
      if (data.teacher_comments && data.teacher_comments.length > 0) {
        data.teacher_comments.forEach(c => {
          if (c.badge && c.badge.trim() !== '') {
            hasBadge = true;
            badgesHtml += `<span style="border: 1px solid #333; color: #000; padding: 0.25rem 0.75rem; border-radius: 9999px; font-weight: bold; font-size: 0.75rem; margin-right: 0.5rem; display: inline-block;">${c.badge}</span>`;
          }
        });
      }
      if (!hasBadge) {
        if ((data.final_score || 0) >= 9.0) {
          badgesHtml = `<span style="border: 1px solid #333; color: #000; padding: 0.25rem 0.75rem; border-radius: 9999px; font-weight: bold; font-size: 0.75rem; display: inline-block;">🌟 Học Viên Xuất Sắc KHTN</span>`;
        } else {
          badgesHtml = `<span style="color: #666; font-size: 0.75rem; font-style: italic;">Không có danh hiệu</span>`;
        }
      }

      const cardDiv = document.createElement('div');
      // Force avoid page split inside and A4 page break after
      cardDiv.className = 'print-card-item print-page-break';
      cardDiv.style.cssText = `
        background: #ffffff !important;
        color: #000000 !important;
        border: 2px solid #333333 !important;
        border-radius: 12px !important;
        padding: 2.5rem !important;
        margin-bottom: 2rem !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        page-break-after: always !important;
        break-after: page !important;
        font-family: Arial, sans-serif !important;
      `;
      
      cardDiv.innerHTML = `
        <div style="text-center; text-align: center; border-b: 1px solid #333; border-bottom: 1px solid #333; padding-bottom: 1rem; margin-bottom: 1.5rem;">
          <h3 style="font-size: 1.5rem; font-weight: 800; color: #000; margin: 0; margin-bottom: 0.25rem; text-transform: uppercase;">TRƯỜNG THCS HOÀNG DIỆU</h3>
          <h4 style="font-size: 1.1rem; font-weight: 700; color: #000; margin: 0; margin-bottom: 0.5rem; text-transform: uppercase;">PHIẾU BÁO ĐIỂM VÀ NHẬN XÉT MÔN KHTN - CÔ LINH</h4>
          <p style="font-size: 0.75rem; color: #000; margin: 0;">Năm học 2026 - 2027 • Học kỳ I</p>
        </div>

        <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
          <div style="line-height: 1.8;">
            <p style="margin: 0; font-size: 0.9rem; color: #000;"><strong>Họ và tên học sinh:</strong> <span style="font-weight: bold; font-size: 1rem;">${stt}- ${data.full_name}</span></p>
            <p style="margin: 0; font-size: 0.9rem; color: #000;"><strong>Lớp học:</strong> <span style="font-weight: bold;">${data.class_name || 'Lớp'}</span></p>
            <p style="margin: 0; font-size: 0.9rem; color: #000;"><strong>Nhóm thi đua:</strong> <span style="font-weight: bold;">${data.group_name}</span></p>
            <p style="margin: 0; font-size: 0.9rem; color: #000;"><strong>Chức vụ:</strong> <span style="font-weight: bold;">${data.is_group_leader ? "👑 Nhóm Trưởng" : "Thành viên"}</span></p>
          </div>

          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; text-align: center;">
            <div style="border: 1px solid #333; border-radius: 8px; padding: 0.75rem;">
              <p style="margin: 0; font-size: 0.7rem; color: #555; text-transform: uppercase; font-weight: bold;">KTTX ${selectedKttxPeriod}</p>
              <p style="margin: 0; font-size: 1.6rem; font-weight: 800; color: #000; margin-top: 0.25rem;">${(data.avg_kttx || 0).toFixed(1)}</p>
            </div>
            <div style="border: 1px solid #333; border-radius: 8px; padding: 0.75rem;">
              <p style="margin: 0; font-size: 0.7rem; color: #555; text-transform: uppercase; font-weight: bold;">Thi Đua</p>
              <p style="margin: 0; font-size: 1.6rem; font-weight: 800; color: #000; margin-top: 0.25rem;">${bpText}</p>
            </div>
            <div style="border: 1px solid #333; border-radius: 8px; padding: 0.75rem; background-color: #f3f4f6;">
              <p style="margin: 0; font-size: 0.7rem; color: #555; text-transform: uppercase; font-weight: bold;">Điểm Chốt</p>
              <p style="margin: 0; font-size: 1.6rem; font-weight: 800; color: #000; margin-top: 0.25rem;">${(data.final_score || 0).toFixed(1)}</p>
            </div>
          </div>
        </div>

        <div style="border-top: 1px solid #333; padding-top: 1.25rem; margin-top: 1rem; line-height: 1.6;">
          <div style="border: 1px solid #333; border-radius: 8px; padding: 1rem; margin-bottom: 1rem;">
            <h5 style="margin: 0; font-size: 0.75rem; font-weight: bold; color: #000; text-transform: uppercase; margin-bottom: 0.5rem;">💬 Nhận xét từ Cô Linh</h5>
            <p style="margin: 0; font-size: 0.875rem; color: #000; font-style: italic;">"${latestComm}"</p>
          </div>

          <div style="border: 1px solid #333; border-radius: 8px; padding: 1rem;">
            <h5 style="margin: 0; font-size: 0.75rem; font-weight: bold; color: #000; text-transform: uppercase; margin-bottom: 0.5rem;">🏅 Danh hiệu & Badge Tuyên Dương</h5>
            <div style="margin-top: 0.25rem;">
              ${badgesHtml}
            </div>
          </div>
        </div>
      `;
      printContainer.appendChild(cardDiv);
    } catch (err) {
      console.error(`Error loading print card for student ${s.id}:`, err);
    }
  }

  // Trigger print
  document.body.classList.add('print-bulk');
  window.print();
  
  // Cleanup
  document.body.classList.remove('print-bulk');
  printContainer.innerHTML = '';
}

function populateLoginDropdown() {
  const select = document.getElementById('login-username');
  if (!select) return;
  
  select.innerHTML = `
    <option value="admin">👩‍🏫 Quản Trị Viên (Cô Linh)</option>
    <option value="student">🎓 Học Sinh</option>
  `;
  
  const classes = [];
  groupsData.forEach(g => {
    if (!classes.some(c => c.id === g.class_id)) {
      classes.push({ id: g.class_id, name: g.class_name || 'Lớp' });
    }
  });

  classes.sort((a, b) => a.name.localeCompare(b.name));

  classes.forEach(c => {
    const classGroups = groupsData.filter(g => g.class_id === c.id);
    classGroups.sort((a, b) => a.group_number - b.group_number);
    classGroups.forEach(g => {
      const opt = document.createElement('option');
      opt.value = `leader_${g.id}`;
      const shortClassName = c.name.replace('Lớp ', '').trim();
      opt.innerText = `🚩 NT${g.group_number} lớp ${shortClassName}`;
      select.appendChild(opt);
    });
  });
}
