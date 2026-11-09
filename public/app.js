// CourtChain Management Portal - Frontend Application
// Connects to REST APIs for UC48, UC49, UC50, UC62, UC63

let currentUserId = 'owner-1';
let currentRole = 'OWNER';
let currentFacilityId = null;
let currentTab = 'tab-uc48';
let selectedStaffForDeactivation = null;
let systemMeta = null;

// Helpers
function formatVnd(value) {
  const num = Math.round(Number(value) || 0);
  return new Intl.NumberFormat('vi-VN').format(num) + ' đ';
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

async function apiRequest(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-user-id': currentUserId,
    ...(options.headers || {}),
  };

  try {
    const res = await fetch(endpoint, { ...options, headers });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message || `HTTP ${res.status}: ${res.statusText}`);
    }
    return data;
  } catch (err) {
    showToast(err.message, 'error');
    throw err;
  }
}

// 1. Initial Setup & Persona Switching
async function initApp() {
  setupTabs();
  setupEventListeners();
  await loadMetadata();
  applyPersonaRules();
  loadCurrentTab();
}

async function loadMetadata() {
  try {
    const res = await fetch('/api/v1/meta');
    systemMeta = await res.json();
  } catch (err) {
    console.warn('Metadata fetch failed, fallback to defaults', err);
  }
}

function setupTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      // Role check for owner-only tabs
      if ((targetTab === 'tab-uc62' || targetTab === 'tab-uc63') && currentRole !== 'OWNER') {
        showToast('Chỉ Court Owner mới có quyền truy cập tab này.', 'error');
        return;
      }
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));
      document.getElementById(targetTab)?.classList.add('active');
      currentTab = targetTab;
      loadCurrentTab();
    });
  });
}

function applyPersonaRules() {
  const roleBadge = document.getElementById('roleBadge');
  roleBadge.className = 'role-badge';

  if (currentRole === 'OWNER') {
    roleBadge.textContent = 'OWNER';
    roleBadge.classList.add('badge-owner');
    document.getElementById('tabNavUc62').classList.remove('disabled');
    document.getElementById('tabNavUc63').classList.remove('disabled');
    document.getElementById('ownerNoticeUc62').style.display = 'none';
    document.getElementById('ownerContentUc62').style.display = 'block';
    document.getElementById('ownerNoticeUc63').style.display = 'none';
    document.getElementById('ownerContentUc63').style.display = 'block';
  } else if (currentRole === 'FACILITY_MANAGER') {
    roleBadge.textContent = 'FACILITY MANAGER';
    roleBadge.classList.add('badge-manager');
    document.getElementById('tabNavUc62').classList.add('disabled');
    document.getElementById('tabNavUc63').classList.add('disabled');
    document.getElementById('ownerNoticeUc62').style.display = 'block';
    document.getElementById('ownerContentUc62').style.display = 'none';
    document.getElementById('ownerNoticeUc63').style.display = 'block';
    document.getElementById('ownerContentUc63').style.display = 'none';
  } else {
    roleBadge.textContent = 'STAFF';
    roleBadge.classList.add('badge-staff');
    document.getElementById('tabNavUc62').classList.add('disabled');
    document.getElementById('tabNavUc63').classList.add('disabled');
  }
}

function setupEventListeners() {
  // Persona switcher
  const personaSelect = document.getElementById('personaSelect');
  personaSelect.addEventListener('change', (e) => {
    currentUserId = e.target.value;
    if (currentUserId === 'owner-1') {
      currentRole = 'OWNER';
      currentFacilityId = null;
    } else if (currentUserId === 'manager-1') {
      currentRole = 'FACILITY_MANAGER';
      currentFacilityId = 'facility-1';
    } else if (currentUserId === 'manager-2') {
      currentRole = 'FACILITY_MANAGER';
      currentFacilityId = 'facility-2';
    } else {
      currentRole = 'STAFF';
      currentFacilityId = 'facility-1';
    }
    applyPersonaRules();
    showToast(`Đã chuyển sang vai trò: ${currentRole}`, 'info');

    // If currently on Owner tab and switched to manager, fallback to UC48
    if ((currentTab === 'tab-uc62' || currentTab === 'tab-uc63') && currentRole !== 'OWNER') {
      document.querySelector('[data-tab="tab-uc48"]').click();
    } else {
      loadCurrentTab();
    }
  });

  // UC48 Refresh
  document.getElementById('btnRefreshStaff')?.addEventListener('click', loadStaffManagement);

  // Modal actions
  document.getElementById('btnModalClose')?.addEventListener('click', closeModal);
  document.getElementById('btnModalCancel')?.addEventListener('click', closeModal);
  document.getElementById('btnModalConfirm')?.addEventListener('click', confirmDeactivateStaff);

  // UC49 Filter
  document.getElementById('btnFilterOccupancy')?.addEventListener('click', loadOccupancy);

  // UC50 Filter
  document.getElementById('btnFilterRevenue')?.addEventListener('click', loadRevenue);

  // UC62 Filter
  document.getElementById('btnFilterChain')?.addEventListener('click', loadChainPerformance);

  // UC63 Filter
  document.getElementById('btnFilterInventory')?.addEventListener('click', loadChainInventory);
}

function loadCurrentTab() {
  if (currentTab === 'tab-uc48') loadStaffManagement();
  else if (currentTab === 'tab-uc49') loadOccupancy();
  else if (currentTab === 'tab-uc50') loadRevenue();
  else if (currentTab === 'tab-uc62') loadChainPerformance();
  else if (currentTab === 'tab-uc63') loadChainInventory();
}

// ===================================================
// UC48: Staff Management & Deactivation
// ===================================================
async function loadStaffManagement() {
  try {
    const data = await apiRequest('/api/v1/context');
    const users = data.users || [];
    const shifts = data.shifts || [];
    const facilities = data.facilities || [];
    const facilityMap = new Map(facilities.map((f) => [f.id, f.name]));

    // Filter staff for current facility if manager
    let staffMembers = users.filter((u) => u.role === 'STAFF');
    if (currentRole === 'FACILITY_MANAGER') {
      staffMembers = staffMembers.filter((u) => u.facilityId === currentFacilityId);
    }

    const tbody = document.getElementById('staffTableBody');
    tbody.innerHTML = '';

    if (staffMembers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-dim);">Không có nhân viên nào trong phạm vi chi nhánh.</td></tr>`;
      return;
    }

    staffMembers.forEach((staff) => {
      const openShift = shifts.find((s) => s.staffId === staff.id && s.status === 'OPEN');
      const tr = document.createElement('tr');

      const statusBadge =
        staff.status === 'ACTIVE'
          ? '<span class="badge badge-active">ACTIVE</span>'
          : staff.status === 'LOCKED'
          ? '<span class="badge badge-locked">LOCKED</span>'
          : '<span class="badge badge-inactive">INACTIVE</span>';

      const shiftBadge = openShift
        ? `<span class="badge badge-open-shift">⚠️ Ca Đang Mở (${openShift.id})</span>`
        : '<span style="color: var(--text-dim); font-size: 0.8rem;">Không có</span>';

      const isDeactivated = staff.status === 'INACTIVE';
      const canDeactivate = !isDeactivated;

      tr.innerHTML = `
        <td><strong>${staff.id}</strong></td>
        <td>${staff.name}</td>
        <td>${facilityMap.get(staff.facilityId) || staff.facilityId}</td>
        <td><span class="badge" style="background:#334155">${staff.role}</span></td>
        <td>${statusBadge}</td>
        <td>${shiftBadge}</td>
        <td>v${staff.tokenVersion || 1}</td>
        <td>
          <button class="btn btn-sm ${isDeactivated ? 'btn-secondary' : 'btn-danger'}" 
            ${!canDeactivate ? 'disabled' : ''} 
            data-staff-id="${staff.id}">
            ${isDeactivated ? 'Đã vô hiệu hóa' : 'Vô hiệu hóa (UC48)'}
          </button>
        </td>
      `;

      if (canDeactivate) {
        tr.querySelector('button').addEventListener('click', () => {
          openDeactivateModal(staff, openShift, facilityMap.get(staff.facilityId) || staff.facilityId);
        });
      }

      tbody.appendChild(tr);
    });

    // Render Audit logs
    renderAuditLogs(data.auditLogs || []);
  } catch (err) {
    console.error(err);
  }
}

function renderAuditLogs(logs) {
  const tbody = document.getElementById('auditTableBody');
  tbody.innerHTML = '';

  if (!logs || logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim);">Chưa có nhật ký vô hiệu hóa nào.</td></tr>`;
    return;
  }

  // Show latest first
  [...logs].reverse().forEach((log) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${log.id}</code></td>
      <td><span class="badge badge-inactive">${log.action}</span></td>
      <td><strong>${log.performedBy}</strong></td>
      <td>${log.targetUserId}</td>
      <td style="color: #fbbf24">${log.reason}</td>
      <td>${log.revokedSessionsCount || 0} session</td>
      <td>${new Date(log.timestamp).toLocaleString('vi-VN')}</td>
    `;
    tbody.appendChild(tr);
  });
}

function openDeactivateModal(staff, openShift, branchName) {
  selectedStaffForDeactivation = { staff, openShift };
  document.getElementById('modalStaffName').textContent = staff.name;
  document.getElementById('modalStaffId').textContent = staff.id;
  document.getElementById('modalStaffBranch').textContent = branchName;
  document.getElementById('modalReasonInput').value = '';

  const warningBox = document.getElementById('modalShiftWarning');
  const confirmBtn = document.getElementById('btnModalConfirm');

  if (openShift) {
    warningBox.style.display = 'flex';
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Bị chặn: Còn ca mở (BR193)';
  } else {
    warningBox.style.display = 'none';
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Xác nhận Vô hiệu hóa';
  }

  document.getElementById('deactivateModal').classList.add('open');
}

function closeModal() {
  document.getElementById('deactivateModal').classList.remove('open');
  selectedStaffForDeactivation = null;
}

async function confirmDeactivateStaff() {
  if (!selectedStaffForDeactivation) return;
  const staffId = selectedStaffForDeactivation.staff.id;
  const reason = document.getElementById('modalReasonInput').value.trim();

  if (!reason) {
    showToast('Vui lòng nhập lý do vô hiệu hóa (Bắt buộc).', 'error');
    return;
  }

  try {
    const result = await apiRequest(`/api/v1/staff/${staffId}/deactivate`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });

    closeModal();
    showToast(`Đã vô hiệu hóa thành công tài khoản ${staffId}! (BR209, BR210)`, 'success');
    loadStaffManagement();
  } catch (err) {
    console.error(err);
  }
}

// ===================================================
// UC49: Court Occupancy
// ===================================================
async function loadOccupancy() {
  const from = document.getElementById('occFrom').value;
  const to = document.getElementById('occTo').value;
  const sport = document.getElementById('occSport').value;
  const timePeriod = document.getElementById('occPeriod').value;

  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (sport) params.set('sport', sport);
  if (timePeriod) params.set('timePeriod', timePeriod);

  try {
    const res = await apiRequest(`/api/v1/analytics/occupancy?${params.toString()}`);
    const data = res.data;

    // KPIs
    document.getElementById('occUtilization').textContent = `${data.kpis.utilizationRate}%`;
    document.getElementById('occProgressBar').style.width = `${Math.min(100, data.kpis.utilizationRate)}%`;
    document.getElementById('occHoursComparison').textContent = `${data.kpis.totalUsedHours}h thực dùng / ${data.kpis.totalAvailableHours}h khả dụng`;
    document.getElementById('occPeakRate').textContent = `${data.kpis.peakUtilizationRate}%`;
    document.getElementById('occOffPeakRate').textContent = `${data.kpis.offPeakUtilizationRate}%`;
    document.getElementById('occCourtsCount').textContent = data.kpis.activeCourtCount;
    document.getElementById('occBranchName').textContent = data.facility.name;

    // Court Breakdown
    const courtTbody = document.getElementById('occCourtTableBody');
    courtTbody.innerHTML = '';
    data.courts.forEach((c) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${c.courtName}</strong> (${c.courtId})</td>
        <td><span class="badge" style="background:#334155">${c.sport}</span></td>
        <td>${c.availableMinutes} phút</td>
        <td style="color:#60a5fa">${c.usedMinutes} phút</td>
        <td><strong>${c.utilizationRate}%</strong></td>
        <td style="color:#fbbf24">${c.peakMetrics.utilizationRate}%</td>
        <td style="color:#34d399">${c.offPeakMetrics.utilizationRate}%</td>
      `;
      courtTbody.appendChild(tr);
    });

    // Daily Timeline
    const timeTbody = document.getElementById('occTimelineTableBody');
    timeTbody.innerHTML = '';
    data.dailyTimeline.forEach((t) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${t.date}</strong></td>
        <td>${t.availableMinutes} phút</td>
        <td>${t.usedMinutes} phút</td>
        <td><strong>${t.utilizationRate}%</strong></td>
        <td>
          <div class="progress-bar-bg" style="width: 150px;">
            <div class="progress-bar-fill" style="width: ${Math.min(100, t.utilizationRate)}%"></div>
          </div>
        </td>
      `;
      timeTbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
  }
}

// ===================================================
// UC50: Branch Revenue
// ===================================================
async function loadRevenue() {
  const from = document.getElementById('revFrom').value;
  const to = document.getElementById('revTo').value;
  const category = document.getElementById('revCategory').value;
  const channel = document.getElementById('revChannel').value;

  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (category) params.set('category', category);
  if (channel) params.set('channel', channel);

  try {
    const res = await apiRequest(`/api/v1/analytics/branch-revenue?${params.toString()}`);
    const data = res.data;
    const kpis = data.kpis;
    const liabilities = data.liabilities;

    // KPIs
    document.getElementById('revGross').textContent = formatVnd(kpis.grossRevenue);
    document.getElementById('revRefunds').textContent = formatVnd(kpis.totalRefunds);
    document.getElementById('revNet').textContent = formatVnd(kpis.netRevenue);
    document.getElementById('revCogs').textContent = formatVnd(kpis.directCogs);
    document.getElementById('revProfit').textContent = formatVnd(kpis.grossOperatingProfit);
    document.getElementById('revMargin').textContent = `Biên lãi gộp: ${kpis.grossProfitMargin}%`;

    // Liabilities (BR217)
    document.getElementById('revPrepayments').textContent = formatVnd(liabilities.unservedPrepayments);
    document.getElementById('revDeposits').textContent = formatVnd(liabilities.activeDeposits);
    document.getElementById('revTotalLiabilities').textContent = formatVnd(liabilities.totalLiabilities);

    // Breakdown Category
    const catTbody = document.getElementById('revCategoryTableBody');
    catTbody.innerHTML = '';
    data.breakdowns.byCategory.forEach((c) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${c.category}</strong></td>
        <td style="color:#60a5fa">${formatVnd(c.netRevenue)}</td>
        <td style="color:#f87171">${formatVnd(c.directCogs)}</td>
        <td style="color:#34d399"><strong>${formatVnd(c.grossOperatingProfit)}</strong></td>
        <td>${c.grossProfitMargin}%</td>
      `;
      catTbody.appendChild(tr);
    });

    // Breakdown Channel
    const chTbody = document.getElementById('revChannelTableBody');
    chTbody.innerHTML = '';
    data.breakdowns.byChannel.forEach((ch) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${ch.channel}</strong></td>
        <td>${formatVnd(ch.grossRevenue)}</td>
        <td style="color:#f87171">${formatVnd(ch.refundAmount)}</td>
        <td style="color:#60a5fa"><strong>${formatVnd(ch.netRevenue)}</strong></td>
        <td>${ch.sharePercent}%</td>
      `;
      chTbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
  }
}

// ===================================================
// UC62: Chain Performance (Owner)
// ===================================================
async function loadChainPerformance() {
  if (currentRole !== 'OWNER') return;

  const from = document.getElementById('chainFrom').value;
  const to = document.getElementById('chainTo').value;
  const bookingType = document.getElementById('chainBookingType').value;

  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (bookingType) params.set('bookingType', bookingType);

  try {
    const res = await apiRequest(`/api/v1/analytics/chain-performance?${params.toString()}`);
    const data = res.data;
    const kpis = data.chainKpis;

    document.getElementById('chainNetRevenue').textContent = formatVnd(kpis.netRevenue);
    document.getElementById('chainProfit').textContent = formatVnd(kpis.grossOperatingProfit);
    document.getElementById('chainMargin').textContent = `Biên lãi gộp: ${kpis.grossProfitMargin}%`;
    document.getElementById('chainUtilization').textContent = `${kpis.occupancy.utilizationRate}%`;
    document.getElementById('chainHours').textContent = `${Math.round(kpis.occupancy.usedMinutes / 60)}h đã dùng`;
    document.getElementById('chainNoShowRate').textContent = `${kpis.operations.noShowRate}%`;
    document.getElementById('chainNoShowSessions').textContent = `${kpis.operations.noShowSessions} ca vắng mặt`;

    // Branch rankings table
    const tbody = document.getElementById('chainBranchTableBody');
    tbody.innerHTML = '';

    data.branchComparisons.forEach((b, idx) => {
      const rank = idx + 1;
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${medal} Hạng #${rank}</strong></td>
        <td><strong>${b.facilityName}</strong></td>
        <td style="color:#60a5fa"><strong>${formatVnd(b.financials.netRevenue)}</strong></td>
        <td style="color:#34d399">${formatVnd(b.financials.grossOperatingProfit)}</td>
        <td>${b.occupancy.utilizationRate}%</td>
        <td style="color:${b.operations.noShowRate > 0 ? '#f87171' : 'inherit'}">${b.operations.noShowRate}%</td>
        <td>${b.operations.totalSessions} ca</td>
        <td style="color:#f87171">${formatVnd(b.operations.cancellationRefundAmount)}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
  }
}

// ===================================================
// UC63: Chain Inventory (Owner)
// ===================================================
async function loadChainInventory() {
  if (currentRole !== 'OWNER') return;

  const facilityId = document.getElementById('invFacility').value;
  const category = document.getElementById('invCategory').value;
  const status = document.getElementById('invStatus').value;
  const search = document.getElementById('invSearch').value;

  const params = new URLSearchParams();
  if (facilityId) params.set('facilityId', facilityId);
  if (category) params.set('category', category);
  if (status) params.set('status', status);
  if (search) params.set('search', search);

  try {
    const res = await apiRequest(`/api/v1/analytics/chain-inventory?${params.toString()}`);
    const data = res.data;
    const kpis = data.kpis;

    document.getElementById('invTotalSkus').textContent = kpis.totalSkus;
    document.getElementById('invTotalValuation').textContent = formatVnd(kpis.totalInventoryValue);
    document.getElementById('invLowStock').textContent = kpis.lowStockCount;
    document.getElementById('invOutOfStock').textContent = kpis.outOfStockCount;
    document.getElementById('invInTransit').textContent = `${kpis.inTransitTotalQuantity} đơn vị`;

    // Transfer Suggestions (UC66 Support)
    const sugContainer = document.getElementById('transferSuggestionsContainer');
    sugContainer.innerHTML = '';

    if (data.transferSuggestions.length === 0) {
      sugContainer.innerHTML = `<div style="color: var(--text-dim); font-size: 0.85rem; padding: 0.5rem 0;">Hiện không có đề xuất điều chuyển cấp bách nào. Tồn kho giữa các cơ sở đang ở mức an toàn.</div>`;
    } else {
      data.transferSuggestions.forEach((sug) => {
        const card = document.createElement('div');
        card.className = 'transfer-card';
        card.innerHTML = `
          <div>
            <div class="transfer-title">🔄 Đề xuất chuyển ${sug.suggestedQuantity} ${sug.sku} (${sug.productName})</div>
            <div class="transfer-desc">
              Từ chi nhánh: <strong>${sug.sourceFacilityName}</strong> &rarr; Đến chi nhánh: <strong>${sug.destinationFacilityName}</strong>
            </div>
            <div style="font-size: 0.75rem; color: #fbbf24; margin-top: 0.2rem;">Lý do: ${sug.reason}</div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="alert('Đã tạo phiếu đề xuất điều chuyển kho UC65/UC66 thành công!')">
            ⚡ Tạo lệnh điều chuyển (UC66)
          </button>
        `;
        sugContainer.appendChild(card);
      });
    }

    // Inventory Table
    const tbody = document.getElementById('invTableBody');
    tbody.innerHTML = '';

    data.items.forEach((item) => {
      const tr = document.createElement('tr');
      const badgeClass =
        item.status === 'IN_STOCK'
          ? 'badge-in-stock'
          : item.status === 'LOW_STOCK'
          ? 'badge-low-stock'
          : 'badge-out-of-stock';

      const varianceColor =
        item.stocktake.varianceRatio < 0
          ? '#f87171'
          : item.stocktake.varianceRatio > 0
          ? '#34d399'
          : 'inherit';

      tr.innerHTML = `
        <td><strong>${item.sku}</strong></td>
        <td>${item.name}</td>
        <td>${item.facilityName}</td>
        <td><span class="badge" style="background:#334155">${item.category}</span></td>
        <td>${item.onHand}</td>
        <td style="color:#fbbf24">${item.held}</td>
        <td style="color:#f87171">${item.quarantined}</td>
        <td style="color:#34d399"><strong>${item.availableStock}</strong></td>
        <td style="color:#60a5fa">${item.inTransitIncoming > 0 ? `+${item.inTransitIncoming}` : '-'}</td>
        <td>${item.reorderThreshold}</td>
        <td><span class="badge ${badgeClass}">${item.status}</span></td>
        <td>${formatVnd(item.movingAverageCost)}</td>
        <td><strong>${formatVnd(item.totalValuation)}</strong></td>
        <td style="color:${varianceColor}">
          ${item.stocktake.varianceRatio !== 0 ? `${item.stocktake.varianceRatio}%` : '0%'}
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
  }
}

// Start application
window.addEventListener('DOMContentLoaded', initApp);
