/**
 * PulseWatch — Observability Console Client Script
 * Handles real-time monitoring UI, REST API fetch calls, Chart.js rendering, and browser auto-checks.
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- Application State ---
    let state = {
        websites: [],
        summary: { total_websites: 0, online_count: 0, degraded_count: 0, offline_count: 0 },
        activeView: 'overview',
        searchQuery: '',
        statusFilter: 'ALL',
        sortBy: 'latest',
        autoCheckIntervalId: null,
        autoCheckSeconds: 60,
        activeDetailsWebsiteId: null
    };

    // --- Chart instances ---
    let modalChartInstance = null;
    let overviewChartInstance = null;

    // --- DOM Elements ---
    const navButtons = document.querySelectorAll('.sidebar-nav .nav-item');
    const viewSections = {
        overview: document.getElementById('viewWebsites'),
        websites: document.getElementById('viewWebsites'),
        history: document.getElementById('viewHistory'),
        performance: document.getElementById('viewPerformance')
    };

    const metricTotal = document.getElementById('metricTotal');
    const metricOnline = document.getElementById('metricOnline');
    const metricDegraded = document.getElementById('metricDegraded');
    const metricOffline = document.getElementById('metricOffline');

    const searchInput = document.getElementById('searchInput');
    const statusFilterSelect = document.getElementById('statusFilter');
    const sortBySelect = document.getElementById('sortBy');

    const websitesGrid = document.getElementById('websitesGrid');
    const emptyWebsitesState = document.getElementById('emptyWebsitesState');

    const refreshAllBtn = document.getElementById('refreshAllBtn');
    const openAddModalBtn = document.getElementById('openAddModalBtn');
    const autoCheckSelect = document.getElementById('autoCheckSelect');

    // Modal elements: Add Website
    const addWebsiteModal = document.getElementById('addWebsiteModal');
    const closeAddModalBtn = document.getElementById('closeAddModalBtn');
    const cancelAddBtn = document.getElementById('cancelAddBtn');
    const addWebsiteForm = document.getElementById('addWebsiteForm');
    const siteNameInput = document.getElementById('siteNameInput');
    const siteUrlInput = document.getElementById('siteUrlInput');
    const submitAddBtn = document.getElementById('submitAddBtn');
    const addModalError = document.getElementById('addModalError');

    // Modal elements: Details & History
    const detailsModal = document.getElementById('detailsModal');
    const closeDetailsModalBtn = document.getElementById('closeDetailsModalBtn');
    const closeDetailsModalBottomBtn = document.getElementById('closeDetailsModalBottomBtn');
    const modalSiteName = document.getElementById('modalSiteName');
    const modalSiteUrl = document.getElementById('modalSiteUrl');
    const modalSiteStatus = document.getElementById('modalSiteStatus');
    const modalSiteHttp = document.getElementById('modalSiteHttp');
    const modalSiteTime = document.getElementById('modalSiteTime');
    const modalSiteSize = document.getElementById('modalSiteSize');
    const modalSiteLastCheck = document.getElementById('modalSiteLastCheck');
    const modalHistoryTableBody = document.getElementById('modalHistoryTableBody');
    const modalRecheckBtn = document.getElementById('modalRecheckBtn');
    const modalChartEmptyState = document.getElementById('modalChartEmptyState');

    // Views elements
    const globalHistoryTableBody = document.getElementById('globalHistoryTableBody');
    const perfWebsiteSelect = document.getElementById('perfWebsiteSelect');
    const perfChartEmptyState = document.getElementById('perfChartEmptyState');

    // Toast Container
    const toastContainer = document.getElementById('toastContainer');

    // --- Helper Utilities ---
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let icon = '✓';
        if (type === 'error') icon = '✕';
        
        toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function timeAgo(dateString) {
        if (!dateString) return 'Never checked';
        const date = new Date(dateString.replace(' ', 'T') + 'Z');
        if (isNaN(date.getTime())) return dateString;
        
        const seconds = Math.floor((new Date() - date) / 1000);
        if (seconds < 5) return 'Just now';
        if (seconds < 60) return `${seconds}s ago`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    }

    function formatTimestamp(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString.replace(' ', 'T') + 'Z');
        if (isNaN(date.getTime())) return dateString;
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    // --- API Data Fetching ---
    async function loadWebsites() {
        try {
            const response = await fetch('/api/websites');
            const data = await response.json();
            if (data.success) {
                state.websites = data.websites || [];
                state.summary = data.summary || { total_websites: 0, online_count: 0, degraded_count: 0, offline_count: 0 };
                updateMetricsUI();
                renderCurrentView();
            } else {
                showToast(data.error || 'Failed to fetch websites', 'error');
            }
        } catch (err) {
            console.error('Error fetching websites:', err);
            showToast('Unable to connect to Flask server', 'error');
        }
    }

    function updateMetricsUI() {
        metricTotal.textContent = state.summary.total_websites;
        metricOnline.textContent = state.summary.online_count;
        metricDegraded.textContent = state.summary.degraded_count;
        metricOffline.textContent = state.summary.offline_count;
    }

    // --- View Navigation ---
    function switchView(viewName) {
        state.activeView = viewName;

        navButtons.forEach(btn => {
            if (btn.dataset.view === viewName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Hide all views
        document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));

        // Show target view
        if (viewName === 'overview' || viewName === 'websites') {
            document.getElementById('viewWebsites').classList.add('active');
            renderWebsitesGrid();
        } else if (viewName === 'history') {
            document.getElementById('viewHistory').classList.add('active');
            loadGlobalHistory();
        } else if (viewName === 'performance') {
            document.getElementById('viewPerformance').classList.add('active');
            renderPerformanceView();
        }
    }

    function renderCurrentView() {
        if (state.activeView === 'overview' || state.activeView === 'websites') {
            renderWebsitesGrid();
        } else if (state.activeView === 'history') {
            loadGlobalHistory();
        } else if (state.activeView === 'performance') {
            renderPerformanceView();
        }
    }

    // --- Render Websites Grid & Cards ---
    function renderWebsitesGrid() {
        websitesGrid.innerHTML = '';

        // Filter websites
        let filtered = state.websites.filter(site => {
            // Search query filter
            const query = state.searchQuery.toLowerCase();
            const matchesSearch = site.name.toLowerCase().includes(query) || site.url.toLowerCase().includes(query);

            // Status filter
            let matchesStatus = true;
            if (state.statusFilter !== 'ALL') {
                matchesStatus = (site.latest_status || 'UNCHECKED') === state.statusFilter;
            }

            return matchesSearch && matchesStatus;
        });

        // Sort websites
        filtered.sort((a, b) => {
            if (state.sortBy === 'name') {
                return a.name.localeCompare(b.name);
            } else if (state.sortBy === 'time') {
                const tA = a.latest_response_time !== null ? a.latest_response_time : 999999;
                const tB = b.latest_response_time !== null ? b.latest_response_time : 999999;
                return tA - tB;
            } else {
                // Latest check / ID
                return b.id - a.id;
            }
        });

        if (state.websites.length === 0) {
            emptyWebsitesState.classList.remove('hidden');
            websitesGrid.classList.add('hidden');
            return;
        }

        emptyWebsitesState.classList.add('hidden');
        websitesGrid.classList.remove('hidden');

        if (filtered.length === 0) {
            websitesGrid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <h3>No websites match search or filter criteria</h3>
                    <p>Try adjusting your search keywords or status filter.</p>
                </div>
            `;
            return;
        }

        filtered.forEach(site => {
            const card = document.createElement('div');
            card.className = 'site-card';
            card.dataset.id = site.id;

            const status = site.latest_status || 'UNCHECKED';
            const httpCode = site.latest_http_status ? `HTTP ${site.latest_http_status}` : (site.latest_status === 'OFFLINE' ? 'CONN_ERR' : 'Pending');
            const respTime = site.latest_response_time !== null ? `${site.latest_response_time} ms` : '-';
            const respSize = site.latest_response_size || 'Not available';
            const lastChecked = timeAgo(site.last_checked_at);

            card.innerHTML = `
                <div class="site-card-header">
                    <div class="site-name-wrap">
                        <span class="site-name" title="${escapeHtml(site.name)}">${escapeHtml(site.name)}</span>
                        <a href="${escapeHtml(site.url)}" target="_blank" class="site-url-link" title="${escapeHtml(site.url)}">${escapeHtml(site.url)}</a>
                    </div>
                    <span class="status-pill ${status}">
                        <span class="status-pill-dot"></span>
                        ${status}
                    </span>
                </div>

                <div class="site-metrics-grid">
                    <div class="metric-box">
                        <span class="metric-box-label">HTTP Code</span>
                        <span class="metric-box-val">${httpCode}</span>
                    </div>
                    <div class="metric-box">
                        <span class="metric-box-label">Response</span>
                        <span class="metric-box-val">${respTime}</span>
                    </div>
                    <div class="metric-box">
                        <span class="metric-box-label">Size</span>
                        <span class="metric-box-val" title="${respSize}">${respSize}</span>
                    </div>
                </div>

                <div class="site-card-footer">
                    <span class="last-checked-tag">Last: ${lastChecked}</span>
                    <div class="card-actions">
                        <button class="btn btn-secondary btn-sm check-now-btn" data-id="${site.id}" title="Check Website Now">
                            <span>Check</span>
                        </button>
                        <button class="btn btn-secondary btn-sm history-btn" data-id="${site.id}" title="View History & Performance Chart">
                            <span>History</span>
                        </button>
                        <button class="btn btn-danger-outline btn-sm delete-btn" data-id="${site.id}" title="Remove Website">
                            <span>Remove</span>
                        </button>
                    </div>
                </div>
            `;

            websitesGrid.appendChild(card);
        });

        // Attach event listeners for card action buttons
        document.querySelectorAll('.check-now-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.dataset.id);
                triggerSingleCheck(id, e.currentTarget);
            });
        });

        document.querySelectorAll('.history-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.dataset.id);
                openDetailsModal(id);
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.dataset.id);
                deleteWebsite(id);
            });
        });
    }

    // --- Action: Check Single Website ---
    async function triggerSingleCheck(websiteId, btnElement) {
        if (btnElement) {
            btnElement.disabled = true;
            btnElement.innerHTML = `<span class="btn-spinner"></span> Checking...`;
        }

        try {
            const response = await fetch(`/api/websites/${websiteId}/check`, { method: 'POST' });
            const data = await response.json();

            if (data.success) {
                const check = data.latest_check;
                const statusStr = check.status;
                const codeStr = check.http_status ? `HTTP ${check.http_status}` : 'Connection Fail';
                const timeStr = check.response_time !== null ? `${check.response_time} ms` : '-';
                
                showToast(`✓ Check completed: ${statusStr} (${codeStr}, ${timeStr})`, statusStr === 'OFFLINE' ? 'error' : 'success');
                await loadWebsites();

                // If details modal is open for this site, update modal content
                if (state.activeDetailsWebsiteId === websiteId) {
                    openDetailsModal(websiteId);
                }
            } else {
                showToast(data.error || 'Check failed', 'error');
            }
        } catch (err) {
            console.error('Error checking website:', err);
            showToast('Failed to contact server for website check', 'error');
        } finally {
            if (btnElement) {
                btnElement.disabled = false;
                btnElement.innerHTML = `<span>Check</span>`;
            }
        }
    }

    // --- Action: Add Website ---
    async function handleAddWebsiteSubmit(e) {
        e.preventDefault();
        const name = siteNameInput.value.trim();
        const url = siteUrlInput.value.trim();

        if (!url) {
            showAddModalError('Please enter a website URL.');
            return;
        }

        // Show spinner
        submitAddBtn.disabled = true;
        submitAddBtn.querySelector('.btn-text').textContent = 'Validating & Checking...';
        submitAddBtn.querySelector('.btn-spinner').classList.remove('hidden');
        addModalError.classList.add('hidden');

        try {
            const response = await fetch('/api/websites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, url })
            });

            const data = await response.json();

            if (data.success) {
                showToast(data.message || 'Website added successfully!', 'success');
                closeAddModal();
                siteNameInput.value = '';
                siteUrlInput.value = '';
                await loadWebsites();
            } else {
                showAddModalError(data.error || 'Failed to add website.');
            }
        } catch (err) {
            console.error('Error adding website:', err);
            showAddModalError('Network error while adding website.');
        } finally {
            submitAddBtn.disabled = false;
            submitAddBtn.querySelector('.btn-text').textContent = 'Add & Check Now';
            submitAddBtn.querySelector('.btn-spinner').classList.add('hidden');
        }
    }

    function showAddModalError(msg) {
        addModalError.textContent = msg;
        addModalError.classList.remove('hidden');
    }

    function openAddModal() {
        addModalError.classList.add('hidden');
        siteNameInput.value = '';
        siteUrlInput.value = '';
        addWebsiteModal.classList.remove('hidden');
        siteUrlInput.focus();
    }

    function closeAddModal() {
        addWebsiteModal.classList.add('hidden');
    }

    // --- Action: Delete Website ---
    async function deleteWebsite(websiteId) {
        const site = state.websites.find(s => s.id === websiteId);
        const name = site ? site.name : 'this website';
        
        if (!confirm(`Are you sure you want to remove '${name}' from monitoring?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/websites/${websiteId}`, { method: 'DELETE' });
            const data = await response.json();

            if (data.success) {
                showToast(`Removed '${name}' from monitoring.`, 'success');
                await loadWebsites();
            } else {
                showToast(data.error || 'Failed to delete website.', 'error');
            }
        } catch (err) {
            console.error('Error deleting website:', err);
            showToast('Server error while deleting website.', 'error');
        }
    }

    // --- Action: Refresh All ---
    async function refreshAll() {
        const refreshIcon = refreshAllBtn.querySelector('.icon-refresh');
        refreshAllBtn.disabled = true;
        if (refreshIcon) refreshIcon.classList.add('spin-icon');

        showToast('Running HTTP checks for all websites...', 'info');

        try {
            const response = await fetch('/api/check-all', { method: 'POST' });
            const data = await response.json();

            if (data.success) {
                showToast(`Refreshed ${data.checked_count} website(s) cleanly.`, 'success');
                state.websites = data.websites || [];
                state.summary = data.summary || state.summary;
                updateMetricsUI();
                renderCurrentView();
            } else {
                showToast(data.error || 'Refresh all failed.', 'error');
            }
        } catch (err) {
            console.error('Error refreshing all websites:', err);
            showToast('Network error during refresh all.', 'error');
        } finally {
            refreshAllBtn.disabled = false;
            if (refreshIcon) refreshIcon.classList.remove('spin-icon');
        }
    }

    // --- Action: Open Details Modal & Chart ---
    async function openDetailsModal(websiteId) {
        state.activeDetailsWebsiteId = websiteId;
        detailsModal.classList.remove('hidden');

        try {
            const response = await fetch(`/api/websites/${websiteId}/history`);
            const data = await response.json();

            if (!data.success) {
                showToast(data.error || 'Failed to fetch history.', 'error');
                return;
            }

            const site = data.website;
            const history = data.history || [];

            // Populate header details
            modalSiteName.textContent = site.name;
            modalSiteUrl.textContent = site.url;
            modalSiteUrl.href = site.url;

            const latestStatus = site.latest_status || 'UNCHECKED';
            modalSiteStatus.className = `status-pill ${latestStatus}`;
            modalSiteStatus.innerHTML = `<span class="status-pill-dot"></span> ${latestStatus}`;

            modalSiteHttp.textContent = site.latest_http_status ? `HTTP ${site.latest_http_status}` : '-';
            modalSiteTime.textContent = site.latest_response_time !== null ? `${site.latest_response_time} ms` : '-';
            modalSiteSize.textContent = site.latest_response_size || 'Not available';
            modalSiteLastCheck.textContent = timeAgo(site.last_checked_at);

            // Render History Table
            renderModalHistoryTable(history);

            // Render Response Time Chart
            renderModalChart(history);

        } catch (err) {
            console.error('Error loading details modal:', err);
            showToast('Error loading website history.', 'error');
        }
    }

    function renderModalHistoryTable(history) {
        modalHistoryTableBody.innerHTML = '';
        if (history.length === 0) {
            modalHistoryTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No checks recorded yet.</td></tr>`;
            return;
        }

        history.forEach(item => {
            const tr = document.createElement('tr');
            const st = item.status;
            const httpCode = item.http_status ? `HTTP ${item.http_status}` : '-';
            const timeVal = item.response_time !== null ? `${item.response_time} ms` : '-';
            const sizeVal = item.response_size || 'Not available';
            const errMsg = item.error_message ? escapeHtml(item.error_message) : '-';

            tr.innerHTML = `
                <td>${escapeHtml(item.checked_at)}</td>
                <td><span class="status-pill ${st}"><span class="status-pill-dot"></span>${st}</span></td>
                <td>${httpCode}</td>
                <td><strong>${timeVal}</strong></td>
                <td>${sizeVal}</td>
                <td style="color:#64748b; font-size:0.8rem;">${errMsg}</td>
            `;
            modalHistoryTableBody.appendChild(tr);
        });
    }

    function renderModalChart(history) {
        const ctx = document.getElementById('modalHistoryChart').getContext('2d');
        const canvas = document.getElementById('modalHistoryChart');

        // Filter valid check records with response times (chronological order)
        const validChecks = [...history].reverse().filter(item => item.response_time !== null);

        if (validChecks.length < 2) {
            canvas.style.display = 'none';
            modalChartEmptyState.classList.remove('hidden');
            if (modalChartInstance) {
                modalChartInstance.destroy();
                modalChartInstance = null;
            }
            return;
        }

        canvas.style.display = 'block';
        modalChartEmptyState.classList.add('hidden');

        const labels = validChecks.map(c => formatTimestamp(c.checked_at));
        const responseTimes = validChecks.map(c => c.response_time);

        if (modalChartInstance) {
            modalChartInstance.destroy();
        }

        modalChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Response Time (ms)',
                    data: responseTimes,
                    borderColor: '#4f46e5',
                    backgroundColor: 'rgba(79, 70, 229, 0.08)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.35,
                    pointBackgroundColor: '#4f46e5',
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Response Time: ${context.parsed.y} ms`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false }
                    },
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Response Time (ms)', color: '#64748b' },
                        grid: { color: '#f1f5f9' }
                    }
                }
            }
        });
    }

    function closeDetailsModal() {
        detailsModal.classList.add('hidden');
        state.activeDetailsWebsiteId = null;
    }

    // --- Action: Load Global History View ---
    async function loadGlobalHistory() {
        try {
            const response = await fetch('/api/summary');
            const data = await response.json();

            if (data.success) {
                const checks = data.recent_checks || [];
                globalHistoryTableBody.innerHTML = '';

                if (checks.length === 0) {
                    globalHistoryTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No checks recorded in database yet.</td></tr>`;
                    return;
                }

                checks.forEach(item => {
                    const tr = document.createElement('tr');
                    const st = item.status;
                    const httpCode = item.http_status ? `HTTP ${item.http_status}` : '-';
                    const timeVal = item.response_time !== null ? `${item.response_time} ms` : '-';
                    const sizeVal = item.response_size || 'Not available';
                    const errMsg = item.error_message ? escapeHtml(item.error_message) : '-';

                    tr.innerHTML = `
                        <td>${escapeHtml(item.checked_at)}</td>
                        <td><strong>${escapeHtml(item.website_name)}</strong></td>
                        <td><span class="status-pill ${st}"><span class="status-pill-dot"></span>${st}</span></td>
                        <td>${httpCode}</td>
                        <td>${timeVal}</td>
                        <td>${sizeVal}</td>
                        <td style="color:#64748b; font-size:0.8rem;">${errMsg}</td>
                    `;
                    globalHistoryTableBody.appendChild(tr);
                });
            }
        } catch (err) {
            console.error('Error loading global history:', err);
        }
    }

    // --- Action: Performance Comparative Chart View ---
    async function renderPerformanceView() {
        // Populate dropdown
        perfWebsiteSelect.innerHTML = '';
        if (state.websites.length === 0) {
            perfWebsiteSelect.innerHTML = `<option value="">No websites available</option>`;
            return;
        }

        state.websites.forEach(site => {
            const opt = document.createElement('option');
            opt.value = site.id;
            opt.textContent = `${site.name} (${site.url})`;
            perfWebsiteSelect.appendChild(opt);
        });

        const selectedId = parseInt(perfWebsiteSelect.value) || state.websites[0].id;
        loadPerformanceChartForSite(selectedId);
    }

    async function loadPerformanceChartForSite(websiteId) {
        if (!websiteId) return;

        try {
            const response = await fetch(`/api/websites/${websiteId}/history`);
            const data = await response.json();
            if (!data.success) return;

            const history = data.history || [];
            const ctx = document.getElementById('overviewPerfChart').getContext('2d');
            const canvas = document.getElementById('overviewPerfChart');

            const validChecks = [...history].reverse().filter(item => item.response_time !== null);

            if (validChecks.length < 2) {
                canvas.style.display = 'none';
                perfChartEmptyState.classList.remove('hidden');
                if (overviewChartInstance) {
                    overviewChartInstance.destroy();
                    overviewChartInstance = null;
                }
                return;
            }

            canvas.style.display = 'block';
            perfChartEmptyState.classList.add('hidden');

            const labels = validChecks.map(c => formatTimestamp(c.checked_at));
            const responseTimes = validChecks.map(c => c.response_time);

            if (overviewChartInstance) {
                overviewChartInstance.destroy();
            }

            overviewChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Response Time (ms)',
                        data: responseTimes,
                        borderColor: '#6366f1',
                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.35,
                        pointBackgroundColor: '#4f46e5',
                        pointRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { grid: { display: false } },
                        y: {
                            beginAtZero: true,
                            title: { display: true, text: 'Response Time (ms)' }
                        }
                    }
                }
            });
        } catch (err) {
            console.error('Error rendering performance view chart:', err);
        }
    }

    // --- Auto Monitoring Timer ---
    function setupAutoCheck(seconds) {
        if (state.autoCheckIntervalId) {
            clearInterval(state.autoCheckIntervalId);
            state.autoCheckIntervalId = null;
        }

        state.autoCheckSeconds = parseInt(seconds);

        if (state.autoCheckSeconds > 0) {
            state.autoCheckIntervalId = setInterval(() => {
                console.log(`Auto check triggered (${state.autoCheckSeconds}s interval)...`);
                refreshAll();
            }, state.autoCheckSeconds * 1000);
            showToast(`Auto monitoring active (${state.autoCheckSeconds}s interval)`, 'info');
        } else {
            showToast('Auto monitoring paused (Manual check mode)', 'info');
        }
    }

    // --- Event Listeners Setup ---
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    document.querySelectorAll('.open-add-modal-trigger').forEach(btn => {
        btn.addEventListener('click', openAddModal);
    });

    openAddModalBtn.addEventListener('click', openAddModal);
    closeAddModalBtn.addEventListener('click', closeAddModal);
    cancelAddBtn.addEventListener('click', closeAddModal);
    addWebsiteForm.addEventListener('submit', handleAddWebsiteSubmit);

    closeDetailsModalBtn.addEventListener('click', closeDetailsModal);
    closeDetailsModalBottomBtn.addEventListener('click', closeDetailsModal);
    modalRecheckBtn.addEventListener('click', () => {
        if (state.activeDetailsWebsiteId) {
            triggerSingleCheck(state.activeDetailsWebsiteId, modalRecheckBtn);
        }
    });

    refreshAllBtn.addEventListener('click', refreshAll);

    searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.trim();
        renderWebsitesGrid();
    });

    statusFilterSelect.addEventListener('change', (e) => {
        state.statusFilter = e.target.value;
        renderWebsitesGrid();
    });

    sortBySelect.addEventListener('change', (e) => {
        state.sortBy = e.target.value;
        renderWebsitesGrid();
    });

    autoCheckSelect.addEventListener('change', (e) => {
        setupAutoCheck(e.target.value);
    });

    perfWebsiteSelect.addEventListener('change', (e) => {
        loadPerformanceChartForSite(parseInt(e.target.value));
    });

    // Close modals on ESC key or background click
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAddModal();
            closeDetailsModal();
        }
    });

    addWebsiteModal.addEventListener('click', (e) => {
        if (e.target === addWebsiteModal) closeAddModal();
    });

    detailsModal.addEventListener('click', (e) => {
        if (e.target === detailsModal) closeDetailsModal();
    });

    // --- Initial Load ---
    loadWebsites();
    setupAutoCheck(state.autoCheckSeconds);
});
