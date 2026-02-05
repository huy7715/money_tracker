// --- Constants & Shared RegExps (js-hoist-regexp) ---
const WHITESPACE_REGEX = /\s+/g;
const DOT_REGEX = /\./g;
const COMMA_REGEX = /,/g;

document.addEventListener('DOMContentLoaded', () => {
    // --- Socket.IO Real-time Sync ---
    const socket = io();
    socket.on('data_updated', (data) => {
        console.log('Real-time update received:', data);
        if (data.type === 'diary') {
            const currentDiaryDate = EL.diaryDate ? EL.diaryDate.value : null;
            if (data.date === currentDiaryDate) {
                loadDiary(data.date);
            }
            loadDiaryHistory();
        } else {
            const selectedMonth = EL.monthSelector ? EL.monthSelector.value : null;
            fetchData(selectedMonth);
        }
    });

    // --- Cached DOM Elements (js-cache-property-access inspired) ---
    const EL = {
        form: document.getElementById('transaction-form'),
        balanceAmount: document.getElementById('balance-amount'),
        monthSelector: document.getElementById('month-selector'),
        transactionList: document.getElementById('transaction-list'),
        aiBtn: document.getElementById('ai-btn'),
        aiInput: document.getElementById('ai-input'),
        aiLoading: document.getElementById('ai-loading'),
        amount: document.getElementById('amount'),
        category: document.getElementById('category'),
        type: document.getElementById('type'),
        description: document.getElementById('description'),
        assetSelect: document.getElementById('transaction-asset'),
        budgetCategory: document.getElementById('budget-category'),
        budgetLimit: document.getElementById('budget-limit'),
        budgetList: document.getElementById('budget-list'),
        setBudgetBtn: document.getElementById('set-budget-btn'),
        diaryDate: document.getElementById('diary-date'),
        diaryContent: document.getElementById('diary-content'),
        diaryTitle: document.getElementById('diary-title'),
        saveDiaryBtn: document.getElementById('save-diary-btn'),
        diaryHistoryList: document.getElementById('diary-history-list'),
        noteSearch: document.getElementById('note-search'),
        aiModelBadge: document.getElementById('ai-model-badge'),
        modelSelector: document.getElementById('model-selector'),
        bgBtn: document.getElementById('bg-btn'),
        resetBgBtn: document.getElementById('reset-bg-btn'),
        bgInput: document.getElementById('bg-input'),
        assetsLoading: document.getElementById('assets-loading'),
        assetsContent: document.getElementById('assets-content'),
        assetCash: document.getElementById('asset-cash'),
        assetBank: document.getElementById('asset-bank'),
        savingsList: document.getElementById('savings-list'),
        editModal: document.getElementById('edit-modal'),
        editForm: document.getElementById('edit-form'),
        editId: document.getElementById('edit-id'),
        editAmount: document.getElementById('edit-amount'),
        editCategory: document.getElementById('edit-category'),
        editType: document.getElementById('edit-type'),
        editDescription: document.getElementById('edit-description'),
        editDate: document.getElementById('edit-date'),
        monthSpentStat: document.getElementById('month-spent-stat'),
        txCountStat: document.getElementById('tx-count-stat'),
        totalIncomeStat: document.getElementById('total-income-stat'),
        totalExpenseStat: document.getElementById('total-expense-stat'),
        bulkModal: document.getElementById('bulk-modal'),
        bulkInputStep: document.getElementById('bulk-input-step'),
        bulkReviewStep: document.getElementById('bulk-review-step'),
        bulkLoading: document.getElementById('bulk-loading'),
        bulkTableBody: document.getElementById('bulk-review-table-body'),
        bulkCountBadge: document.getElementById('bulk-count-badge'),
        bulkTextInput: document.getElementById('bulk-text-input'),
        bulkExtractBtn: document.getElementById('bulk-extract-btn'),
        bulkConfirmBtn: document.getElementById('bulk-confirm-btn')
    };

    // Utility: Debounce function
    function debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    }

    // Chart instance
    let expenseChart = null;

    // Helper: Parse string with dots/commas to number
    function parseVND(str) {
        if (!str) return 0;
        let s = str.toString().toLowerCase().trim().replace(WHITESPACE_REGEX, '');
        let multiplier = 1;

        if (s.endsWith('tỷ')) {
            multiplier = 1000000000;
            s = s.slice(0, -2);
        } else if (s.endsWith('triệu') || s.endsWith('tr') || s.endsWith('m')) {
            if (s.endsWith('triệu')) s = s.slice(0, -5);
            else if (s.endsWith('tr')) s = s.slice(0, -2);
            else s = s.slice(0, -1);
            multiplier = 1000000;
        } else if (s.endsWith('ngàn') || s.endsWith('nghìn') || s.endsWith('k')) {
            if (s.endsWith('ngàn') || s.endsWith('nghìn')) s = s.slice(0, -4);
            else s = s.slice(0, -1);
            multiplier = 1000;
        }

        // Replace dots (thousands separators in VN) with nothing
        // Replace comma (decimal separator in VN) with dot
        let clean = s.replace(DOT_REGEX, '').replace(COMMA_REGEX, '.');
        let val = parseFloat(clean);
        return isNaN(val) ? 0 : val * multiplier;
    }

    // Helper: Format number with dots (VN locale)
    function formatVND(num) {
        if (!num && num !== 0) return '';
        // Use 'vi-VN' locale which uses dots for thousands
        return Number(num).toLocaleString('vi-VN');
    }

    // Helper: Clean and process amount for storage
    function getFullAmount(input) {
        const raw = input.value.toLowerCase().trim().replace(WHITESPACE_REGEX, '');
        if (!raw) return 0;

        const hasSuffix = raw.endsWith('k') || raw.endsWith('m') || raw.endsWith('tr') ||
            raw.endsWith('triệu') || raw.endsWith('ngàn') ||
            raw.endsWith('nghìn') || raw.endsWith('tỷ');

        // If it already has dots or commas or a suffix, parseVND handles or preserves it
        if (raw.includes('.') || raw.includes(',') || hasSuffix) {
            return parseVND(raw);
        }

        const val = parseVND(raw);
        // If it's a plain number < 10000, assume it's "thousands" (e.g. 50 -> 50.000, 5000 -> 5.000.000 NO, 5000 is 5000)
        // Usually, users don't enter 5,000,000 as 5000. They enter 5000 for 5,000,000? 
        // Actually, in the old logic: "50 -> 50.000". "500 -> 500.000". "5000 -> 5.000.000".
        // Let's stick to: if it's < 10000 and no dots, multiply by 1000.
        if (val < 10000) {
            return val * 1000;
        }
        return val;
    }

    // Smart Input Logic: Format on Blur, Revert on Focus
    function setupSmartInput(input) {
        if (!input) return;

        input.addEventListener('focus', function () {
            // Revert to editable format without dots
            const val = parseVND(this.value);
            if (val !== 0) {
                this.value = val.toString();
            } else {
                this.value = '';
            }
        });

        input.addEventListener('blur', function () {
            const val = getFullAmount(this);
            if (val > 0) {
                this.value = formatVND(val);
            }
        });
    }

    setupSmartInput(EL.amount);
    setupSmartInput(EL.editAmount);
    setupSmartInput(EL.budgetLimit);

    // Fetch AI Model Info
    async function fetchAIInfo() {
        if (!EL.aiModelBadge) return;
        try {
            const response = await fetch('/api/ai-info');
            const data = await response.json();
            if (data.provider && data.model) {
                EL.aiModelBadge.textContent = `${data.provider} (${data.model})`;
                if (EL.modelSelector) EL.modelSelector.value = data.provider.toLowerCase();
            } else {
                EL.aiModelBadge.textContent = 'AI Ready';
            }
        } catch (error) {
            console.error('Error fetching AI info:', error);
            EL.aiModelBadge.textContent = 'AI Offline';
        }
    }
    fetchAIInfo();

    // Model Selector Change Logic
    EL.modelSelector?.addEventListener('change', async (e) => {
        const provider = e.target.value;
        if (EL.aiModelBadge) EL.aiModelBadge.textContent = 'Switching...';

        try {
            const response = await fetch('/api/switch-model', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider })
            });
            const result = await response.json();
            if (result.success) {
                fetchAIInfo();
            } else {
                alert('Switch failed: ' + result.error);
                fetchAIInfo();
            }
        } catch (error) {
            console.error('Error switching model:', error);
            alert('Failed to switch model');
            fetchAIInfo();
        }
    });

    // AI Assistant Logic
    const aiBtn = document.getElementById('ai-btn');
    const aiInput = document.getElementById('ai-input');
    const aiLoading = document.getElementById('ai-loading');

    EL.aiBtn.addEventListener('click', async () => {
        const text = EL.aiInput.value.trim();
        if (!text) return;

        EL.aiBtn.style.display = 'none';
        EL.aiLoading.style.display = 'flex';

        try {
            const response = await fetch('/api/magic-assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });
            const result = await response.json();

            if (result.error) {
                alert('AI Error: ' + result.error);
            } else if (result.intent === 'budget') {
                // Populate Budget Form
                if (result.category && EL.budgetCategory) {
                    let match = Array.from(EL.budgetCategory.options).find(opt => opt.value && opt.value.toLowerCase() === result.category.toLowerCase());
                    if (match) {
                        EL.budgetCategory.value = match.value;
                    } else {
                        // Attempt partial match or default to Other
                        match = Array.from(EL.budgetCategory.options).find(opt => opt.value && result.category.toLowerCase().includes(opt.value.toLowerCase()));
                        EL.budgetCategory.value = match ? match.value : 'Other';
                    }
                }

                if (result.monthly_limit) {
                    EL.budgetLimit.value = formatVND(result.monthly_limit);
                    EL.budgetLimit.dataset.adjustment = result.adjustment || '';
                    if (result.adjustment) {
                        const adjText = result.adjustment === 'increase' ? ' (Tăng thêm)' : ' (Giảm bớt)';
                        // Show visual feedback for adjustment
                        const label = EL.budgetLimit.parentElement.querySelector('label');
                        if (label) label.textContent = 'Monthly Limit' + adjText;
                    } else {
                        const label = EL.budgetLimit.parentElement.querySelector('label');
                        if (label) label.textContent = 'Monthly Limit';
                    }
                    EL.budgetLimit.style.backgroundColor = '#dcfce7'; // Light green flash
                    setTimeout(() => EL.budgetLimit.style.backgroundColor = '', 500);
                }

                EL.aiInput.value = '';

                // Scroll to budget manager safely
                const budgetSection = document.querySelector('.budget-manager');
                if (budgetSection) {
                    budgetSection.scrollIntoView({ behavior: 'smooth' });
                }

                // Visual feedback safely
                if (EL.budgetLimit) EL.budgetLimit.focus();

            } else {
                // Populate Transaction Form
                if (result.amount) {
                    const amountInput = document.getElementById('amount');
                    if (amountInput) {
                        amountInput.value = formatVND(result.amount);
                        amountInput.style.backgroundColor = '#e0e7ff';
                        setTimeout(() => amountInput.style.backgroundColor = '', 500);
                    }
                }

                if (result.category) {
                    const catSelect = document.getElementById('category');
                    if (catSelect) {
                        let match = Array.from(catSelect.options).find(opt => opt.value && opt.value.toLowerCase() === result.category.toLowerCase());
                        if (match) {
                            catSelect.value = match.value;
                        } else {
                            match = Array.from(catSelect.options).find(opt => opt.value && result.category.toLowerCase().includes(opt.value.toLowerCase()));
                            catSelect.value = match ? match.value : 'Other';
                        }
                    }
                }

                if (result.type) {
                    const typeSelect = document.getElementById('type');
                    if (typeSelect) typeSelect.value = result.type.toLowerCase();
                }

                if (result.description) {
                    if (EL.description) EL.description.value = result.description;
                }

                // Auto-select Payment Source based on AI
                if (result.payment_source && EL.assetSelect) {
                    for (let i = 0; i < EL.assetSelect.options.length; i++) {
                        const opt = EL.assetSelect.options[i];
                        if (opt.text.toLowerCase().includes(result.payment_source.toLowerCase())) {
                            EL.assetSelect.selectedIndex = i;
                            break;
                        }
                    }
                }

                // Clear AI input
                EL.aiInput.value = '';

                // Scroll to form safely
                if (EL.form) {
                    EL.form.scrollIntoView({ behavior: 'smooth' });
                }
            }
        } catch (error) {
            console.error('AI Assistant Error:', error);
            alert('AI Assistant Error: ' + error.message);
        } finally {
            aiBtn.style.display = 'block';
            aiLoading.style.display = 'none';
        }
    });

    // Allow Enter key in AI input
    EL.aiInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') EL.aiBtn.click();
    });

    // Add Transaction
    EL.form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const category = EL.category.value;
        const type = EL.type.value;
        const description = EL.description.value;
        const assetId = EL.assetSelect.value; // New

        let amountIndex = getFullAmount(EL.amount);

        const data = {
            amount: amountIndex,
            category: category,
            type: type,
            description: description,
            date: EL.form.querySelector('#date').value,
            asset_id: assetId // New
        };

        try {
            const response = await fetch('/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                EL.form.reset();
                const selectedMonth = EL.monthSelector ? EL.monthSelector.value : null;
                fetchData(selectedMonth);
            } else {
                alert('Failed to add transaction');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('An error occurred');
        }
    });

    const diaryDateInput = document.getElementById('diary-date');
    const diaryContent = document.getElementById('diary-content');
    const saveDiaryBtn = document.getElementById('save-diary-btn');
    const diaryHistoryList = document.getElementById('diary-history-list');

    // Set today's date as default
    if (EL.diaryDate) {
        const today = new Date().toISOString().split('T')[0];
        EL.diaryDate.value = today;
        loadDiary(today);
        loadDiaryHistory();

        EL.diaryDate.addEventListener('change', (e) => {
            loadDiary(e.target.value);
        });
    }

    async function loadDiary(date) {
        if (!EL.diaryContent) return;
        EL.diaryContent.innerHTML = "";
        if (EL.diaryTitle) EL.diaryTitle.value = "";

        try {
            const response = await fetch(`/api/diary?date=${date}`);
            const data = await response.json();
            EL.diaryContent.innerHTML = data.content || "";
            if (EL.diaryTitle) EL.diaryTitle.value = data.title || "";
        } catch (error) {
            console.error('Error loading diary:', error);
            EL.diaryContent.innerHTML = "Failed to load thoughts.";
        }
    }

    async function loadDiaryHistory() {
        if (!EL.diaryHistoryList) return;

        if (EL.noteSearch && !EL.noteSearch.dataset.listenerAdded) {
            const debouncedLoad = debounce(() => loadDiaryHistory(), 250);
            EL.noteSearch.addEventListener('input', debouncedLoad);
            EL.noteSearch.dataset.listenerAdded = 'true';
        }

        const searchTerm = EL.noteSearch ? EL.noteSearch.value.toLowerCase() : "";

        try {
            const response = await fetch('/api/diary/history');
            const data = await response.json();

            if (data.history && data.history.length > 0) {
                // Filter history if search term is present
                // item is now {date, title}
                const filteredHistory = data.history.filter(item => {
                    const dateMatch = item.date.includes(searchTerm);
                    const titleMatch = item.title && item.title.toLowerCase().includes(searchTerm);
                    return dateMatch || titleMatch;
                });

                if (filteredHistory.length === 0) {
                    EL.diaryHistoryList.innerHTML = '<p style="font-size: 0.75rem; color: #9ca3af; text-align: center;">No matching notes</p>';
                    return;
                }

                EL.diaryHistoryList.innerHTML = '';

                // Group by Month/Year
                const groups = {};
                filteredHistory.forEach(item => {
                    const dateStr = item.date;
                    const [year, month, day] = dateStr.split('-');
                    const groupKey = `${year}-${month}`;
                    if (!groups[groupKey]) groups[groupKey] = [];
                    groups[groupKey].push(item);
                });

                // Sort Years/Months Descending
                const sortedGroupKeys = Object.keys(groups).sort().reverse();

                sortedGroupKeys.forEach(groupKey => {
                    const [year, month] = groupKey.split('-');
                    const dateObj = new Date(year, month - 1, 1);
                    const groupLabel = dateObj.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });

                    // Add group header
                    const header = document.createElement('div');
                    header.className = 'note-group-header';
                    header.textContent = groupLabel;
                    EL.diaryHistoryList.appendChild(header);

                    // Add items in this group
                    groups[groupKey].forEach(item => {
                        const date = item.date;
                        const title = item.title;
                        const day = date.split('-')[2];
                        const btn = document.createElement('button');
                        btn.className = 'note-item';

                        // Use title if provided, otherwise default to "Note for [Date]"
                        const displayTitle = title && title.trim() ? title : `Note for ${date}`;

                        btn.innerHTML = `
                            <span style="font-weight: 500;">${displayTitle}</span>
                            <span class="day-chip">Day ${day}</span>
                        `;
                        btn.onclick = () => {
                            EL.diaryDate.value = date;
                            loadDiary(date);
                        };
                        EL.diaryHistoryList.appendChild(btn);
                    });
                });
            } else {
                EL.diaryHistoryList.innerHTML = '<p style="font-size: 0.75rem; color: #9ca3af; text-align: center;">No notes recorded yet</p>';
            }
        } catch (error) {
            console.error('Error loading history:', error);
        }
    }

    async function saveDiary(isAuto = false) {
        const date = EL.diaryDate.value;
        const content = EL.diaryContent.innerHTML;
        const title = EL.diaryTitle ? EL.diaryTitle.value : "";
        if (!date || !content.trim()) return;

        if (EL.saveDiaryBtn) {
            EL.saveDiaryBtn.textContent = isAuto ? "Auto-saving..." : "Saving...";
            if (!isAuto) EL.saveDiaryBtn.disabled = true;
        }

        try {
            const response = await fetch('/api/diary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, content, title })
            });
            if (response.ok) {
                if (EL.saveDiaryBtn) EL.saveDiaryBtn.textContent = isAuto ? "Auto-saved! ✓" : "Saved! ✓";
                loadDiaryHistory();
                setTimeout(() => {
                    if (EL.saveDiaryBtn) {
                        EL.saveDiaryBtn.textContent = "Save Note";
                        EL.saveDiaryBtn.disabled = false;
                    }
                }, 2000);
            } else if (!isAuto) {
                alert('Failed to save note');
            }
        } catch (error) {
            console.error('Error saving diary:', error);
            if (!isAuto) alert('An error occurred while saving');
        } finally {
            if (!isAuto && EL.saveDiaryBtn) {
                EL.saveDiaryBtn.disabled = false;
            }
        }
    }

    const debouncedAutoSave = debounce(() => saveDiary(true), 2000);

    EL.saveDiaryBtn?.addEventListener('click', () => saveDiary(false));
    EL.diaryTitle?.addEventListener('input', debouncedAutoSave);
    EL.diaryContent?.addEventListener('input', debouncedAutoSave);

    // ========== SIDEBAR STATS ==========
    async function updateSidebarStats(transactions, monthOverride = null) {
        if (!EL.monthSpentStat || !EL.txCountStat) return;

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const currentMonthPrefix = monthOverride || `${year}-${month}`;

        console.log("Filtering for month:", currentMonthPrefix);

        const monthTxs = transactions.filter(t => {
            if (!t.date) return false;
            // Handle both 'YYYY-MM-DD' and 'YYYY-MM-DD HH:MM:SS' and 'YYYY-MM-DDTHH:MM'
            const txDate = t.date.toString();
            return txDate.startsWith(currentMonthPrefix);
        });

        console.log("Found monthly transactions:", monthTxs.length);

        const totalSpent = monthTxs
            .filter(t => t.type === 'expense')
            .reduce((sum, t) => sum + Number(t.amount || 0), 0);

        EL.monthSpentStat.textContent = `${totalSpent.toLocaleString('vi-VN')} ₫`;
        EL.txCountStat.textContent = monthTxs.length;
    }

    // ========== MAIN DATA FETCHING ==========
    async function fetchData(month = null) {
        // If no month provided, use current month as default
        const currentMonth = new Date().toISOString().substring(0, 7);
        const effectiveMonth = month || currentMonth;

        console.log(`Fetching data for month: ${effectiveMonth}...`);
        try {
            const url = `/api/data?month=${effectiveMonth}`;
            const response = await fetch(url);
            const data = await response.json();

            if (!data) return;

            // Fetch assets for the selected month
            fetchAssets(effectiveMonth);

            // Update balance
            if (EL.balanceAmount) {
                EL.balanceAmount.textContent = `${(data.balance || 0).toLocaleString('vi-VN')} ₫`;
            }

            // Update All-Time Stats in Sidebar
            if (data.all_time) {
                if (EL.totalIncomeStat) EL.totalIncomeStat.textContent = `${Number(data.all_time.income || 0).toLocaleString('vi-VN')} ₫`;
                if (EL.totalExpenseStat) EL.totalExpenseStat.textContent = `${Number(data.all_time.expense || 0).toLocaleString('vi-VN')} ₫`;
            }

            // Update Stats in Sidebar (Selected Month)
            if (Array.isArray(data.transactions)) {
                updateSidebarStats(data.transactions, effectiveMonth);

                // Process data for Chart
                const chartData = {};
                data.transactions.forEach(t => {
                    const amount = Number(t.amount || 0);
                    if (chartData[t.category]) {
                        chartData[t.category].amount += amount;
                    } else {
                        chartData[t.category] = { amount: amount, type: t.type };
                    }
                });
                updateChart(chartData);

                // Update Transaction List using DocumentFragment (js-batch-dom-updates)
                if (EL.transactionList) {
                    const fragment = document.createDocumentFragment();
                    data.transactions.forEach(t => {
                        const li = document.createElement('li');
                        li.className = `transaction-item ${t.type}`;
                        li.innerHTML = `
                            <div class="info">
                                <span class="category">${t.category}</span>
                                <span class="date">${t.date}</span>
                            </div>
                            <div class="right-section">
                                <div class="amount">
                                    ${t.type === 'expense' ? '-' : '+'}${Number(t.amount || 0).toLocaleString('vi-VN')} ₫
                                </div>
                                <div class="actions">
                                    <button class="edit-btn" onclick="editTransaction(${t.id}, ${t.amount}, '${t.category}', '${t.type}', '${t.description}', '${t.date}')">Edit</button>
                                    <button class="delete-btn" onclick="deleteTransaction(${t.id})">Delete</button>
                                </div>
                            </div>
                        `;
                        fragment.appendChild(li);
                    });
                    EL.transactionList.innerHTML = '';
                    EL.transactionList.appendChild(fragment);
                }
            }

            // Refresh budget status
            if (typeof fetchBudgetStatus === 'function') {
                await fetchBudgetStatus(effectiveMonth);
            }
        } catch (error) {
            console.error('Error in fetchData:', error);
        }
    }

    // Initial fetch to load data on page start
    // We will call this AFTER populating the month selector to ensure consistency
    // fetchData();

    // Populate Month Selector and handle change
    if (EL.monthSelector) {
        async function updateAvailableMonths() {
            try {
                const response = await fetch('/api/available-months');
                const months = await response.json();

                // Always ensure current month is in the list
                const currentMonth = new Date().toISOString().substring(0, 7);
                if (!months.includes(currentMonth)) {
                    months.unshift(currentMonth);
                    // Sort again to maintain order
                    months.sort().reverse();
                }

                // Clear and repopulate
                EL.monthSelector.innerHTML = '';
                months.forEach(monthVal => {
                    const [year, month] = monthVal.split('-');
                    const date = new Date(year, month - 1, 1);
                    const monthLabel = date.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });

                    const opt = document.createElement('option');
                    opt.value = monthVal;
                    opt.textContent = monthLabel;
                    EL.monthSelector.appendChild(opt);
                });

                // Set default value to saved month OR current month
                const savedMonth = localStorage.getItem('selectedMonth');
                if (savedMonth && months.includes(savedMonth)) {
                    EL.monthSelector.value = savedMonth;
                } else {
                    EL.monthSelector.value = currentMonth;
                    localStorage.setItem('selectedMonth', currentMonth);
                }

                // Initial fetch for the settled month
                fetchData(EL.monthSelector.value);

            } catch (e) {
                console.error('Error fetching months:', e);
                // Fallback initial fetch if selector fails
                fetchData();
            }
        }

        updateAvailableMonths();

        EL.monthSelector.addEventListener('change', (e) => {
            const selectedMonth = e.target.value;
            localStorage.setItem('selectedMonth', selectedMonth);
            fetchData(selectedMonth);
        });
    }

    function updateChart(dataMap) {
        const ctxElement = document.getElementById('expenseChart');
        if (!ctxElement) return;

        const ctx = ctxElement.getContext('2d');
        const labels = Object.keys(dataMap);
        const dataValues = [];
        const backgroundColors = [];

        // predefined palettes
        const expenseColors = ['#ef4444', '#f59e0b', '#ec4899', '#8b5cf6', '#6366f1', '#3b82f6']; // Red, Orange, Pink, Purple, Indigo, Blue
        const incomeColors = ['#10b981', '#059669', '#34d399', '#6ee7b7']; // Green Shades

        let expIdx = 0;
        let incIdx = 0;

        labels.forEach(category => {
            const item = dataMap[category];
            dataValues.push(item.amount);

            if (item.type === 'income') {
                // Assign a green color
                backgroundColors.push(incomeColors[incIdx % incomeColors.length]);
                incIdx++;
            } else {
                // Assign an expense color
                backgroundColors.push(expenseColors[expIdx % expenseColors.length]);
                expIdx++;
            }
        });

        if (expenseChart) {
            expenseChart.data.labels = labels;
            expenseChart.data.datasets[0].data = dataValues;
            expenseChart.data.datasets[0].backgroundColor = backgroundColors;
            expenseChart.update();
        } else {
            expenseChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: dataValues,
                        backgroundColor: backgroundColors,
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                        }
                    }
                }
            });
        }
    }

    // Expose functions to global scope
    window.deleteTransaction = async (id) => {
        if (!confirm('Are you sure you want to delete this transaction?')) return;

        try {
            const response = await fetch(`/delete/${id}`, { method: 'DELETE' });
            if (response.ok) {
                const selectedMonth = EL.monthSelector ? EL.monthSelector.value : null;
                fetchData(selectedMonth);
            }
            else alert('Failed to delete');
        } catch (error) {
            console.error('Error deleting:', error);
        }
    };


    window.editTransaction = (id, amount, category, type, description, date) => {
        if (EL.editId) EL.editId.value = id;

        // Display as Formatted Full Value (e.g. 1.000). 
        // Focus handler will convert to '1'.
        if (EL.editAmount) EL.editAmount.value = formatVND(amount);

        if (EL.editCategory) EL.editCategory.value = category;
        if (EL.editType) EL.editType.value = type;
        if (EL.editDescription) EL.editDescription.value = description;

        // Preserve date
        if (date && EL.editDate) {
            // datetime-local expects YYYY-MM-DDTHH:MM
            // SQL might store as YYYY-MM-DD HH:MM:SS
            const formattedDate = date.replace(' ', 'T').substring(0, 16);
            EL.editDate.value = formattedDate;
        }

        if (EL.editModal) EL.editModal.style.display = 'block';
    };

    window.closeModal = () => {
        if (EL.editModal) EL.editModal.style.display = 'none';
    };

    window.onclick = (event) => {
        if (event.target == EL.editModal) {
            EL.editModal.style.display = "none";
        }
    };

    EL.editForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = EL.editId.value;

        let amount = getFullAmount(EL.editAmount);

        const data = {
            amount: amount,
            category: EL.editCategory.value,
            type: EL.editType.value,
            description: EL.editDescription.value,
            date: EL.editDate.value
        };

        try {
            const response = await fetch(`/update/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (response.ok) {
                closeModal();
                const selectedMonth = EL.monthSelector ? EL.monthSelector.value : null;
                fetchData(selectedMonth);
            } else {
                alert('Failed to update');
            }
        } catch (error) {
            console.error('Error updating:', error);
        }
    });

    // Initial fetch handled by updateAvailableMonths() or monthSelector logic
    // Removing redundant global call


    // Load saved background
    const savedBg = localStorage.getItem('custom_bg');
    if (savedBg) {
        document.body.style.backgroundImage = `url(${savedBg})`;
    }

    EL.bgBtn?.addEventListener('click', () => {
        EL.bgInput.click();
    });

    EL.resetBgBtn?.addEventListener('click', () => {
        if (confirm('Remove custom background?')) {
            localStorage.removeItem('custom_bg');
            document.body.style.backgroundImage = '';
        }
    });

    EL.bgInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (event) {
                const bgUrl = event.target.result;
                document.body.style.backgroundImage = `url(${bgUrl})`;
                try {
                    localStorage.setItem('custom_bg', bgUrl);
                } catch (err) {
                    alert('Image too large to save! Try a smaller image.');
                }
            };
            reader.readAsDataURL(file);
        }
    });





    // Set Budget
    EL.setBudgetBtn?.addEventListener('click', async () => {
        const category = EL.budgetCategory.value;
        let limit = parseVND(EL.budgetLimit.value);

        // If currently focused, treat as "thousands" unless it has suffix
        if (document.activeElement === EL.budgetLimit) {
            const raw = EL.budgetLimit.value.toLowerCase().trim();
            if (!raw.endsWith('k') && !raw.endsWith('m')) {
                limit = limit * 1000;
            }
        }

        if (!category || !limit || limit <= 0) {
            alert('Please select a category and enter a valid limit');
            return;
        }

        try {
            const adjustment = EL.budgetLimit.dataset.adjustment || null;
            const response = await fetch('/api/budget', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    category: category,
                    monthly_limit: limit,
                    adjustment: adjustment
                })
            });

            if (response.ok) {
                EL.budgetCategory.value = '';
                EL.budgetLimit.value = '';
                delete EL.budgetLimit.dataset.adjustment;
                // Reset label text if it was changed
                const label = EL.budgetLimit.parentElement.querySelector('label');
                if (label) label.textContent = 'Monthly Limit';
                const selectedMonth = EL.monthSelector ? EL.monthSelector.value : null;
                fetchData(selectedMonth); // Refresh everything including budget status
            } else {
                alert('Failed to set budget');
            }
        } catch (error) {
            console.error('Error setting budget:', error);
            alert('An error occurred');
        }
    });

    // Fetch and Display Budget Status
    async function fetchBudgetStatus(month = null) {
        try {
            const url = month ? `/api/budget-status?month=${month}` : '/api/budget-status';
            const response = await fetch(url);
            const budgets = await response.json();

            if (!EL.budgetList) return;

            if (budgets.length === 0) {
                EL.budgetList.innerHTML = '<p style="text-align: center; opacity: 0.7;">No budgets set yet. Add one above!</p>';
                return;
            }

            const fragment = document.createDocumentFragment();
            budgets.forEach(budget => {
                const percentage = Math.min(budget.percentage, 100);

                // Determine color based on level
                let barColor, bgColor, statusText;
                if (budget.level === 'danger') {
                    barColor = '#ef4444';
                    bgColor = 'rgba(239, 68, 68, 0.1)';
                    statusText = '⚠️ Over Budget!';
                } else if (budget.level === 'warning') {
                    barColor = '#f59e0b';
                    bgColor = 'rgba(245, 158, 11, 0.1)';
                    statusText = '⚡ Close to limit';
                } else {
                    barColor = '#10b981';
                    bgColor = 'rgba(16, 185, 129, 0.1)';
                    statusText = '✓ On track';
                }

                const item = document.createElement('div');
                item.className = 'budget-card';
                item.style.cssText = `
                    background: rgba(255, 255, 255, 0.95);
                    padding: 1.25rem;
                    border-radius: 1rem;
                    border-left: 6px solid ${barColor};
                    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
                    color: #1f2937;
                    position: relative;
                    overflow: hidden;
                `;

                item.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                        <div>
                            <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; color: #6b7280; margin-bottom: 0.25rem;">Category</div>
                            <strong style="font-size: 1.25rem; color: #111827;">${budget.category}</strong>
                        </div>
                        <div style="text-align: right;">
                            <span style="display: inline-block; padding: 0.25rem 0.75rem; border-radius: 2rem; font-size: 0.75rem; font-weight: 700; background: ${bgColor}; color: ${barColor}; border: 1px solid ${barColor}44;">
                                ${statusText}
                            </span>
                        </div>
                    </div>
                    
                    <div style="background: #f3f4f6; height: 1rem; border-radius: 0.5rem; overflow: hidden; margin-bottom: 1rem; position: relative;">
                        <div style="background: ${barColor}; height: 100%; width: ${percentage}%; transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1); border-radius: 0.5rem;"></div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                        <div style="background: #f9fafb; padding: 0.75rem; border-radius: 0.5rem;">
                            <div style="font-size: 0.7rem; color: #6b7280; font-weight: 600; text-transform: uppercase;">Spent</div>
                            <div style="font-size: 1rem; font-weight: 700;">${formatVND(budget.spent)} ₫</div>
                        </div>
                        <div style="background: #f9fafb; padding: 0.75rem; border-radius: 0.5rem;">
                            <div style="font-size: 0.7rem; color: #6b7280; font-weight: 600; text-transform: uppercase;">Limit</div>
                            <div style="font-size: 1rem; font-weight: 700;">${formatVND(budget.limit)} ₫</div>
                        </div>
                    </div>
                    
                    <div style="margin-top: 1rem; display: flex; justify-content: space-between; align-items: center;">
                        <div style="font-size: 0.875rem; font-weight: 600;">
                            ${budget.remaining >= 0 ?
                        `Remaining: <span style="color: #10b981;">${formatVND(budget.remaining)} ₫</span>` :
                        `Over by: <span style="color: #ef4444;">${formatVND(Math.abs(budget.remaining))} ₫</span>`}
                        </div>
                        <div style="display: flex; gap: 0.5rem;">
                            <button onclick="editBudget('${budget.category}', ${budget.limit})" style="background: #10b981; border: none; color: white; font-size: 0.75rem; font-weight: 700; cursor: pointer; padding: 0.4rem 0.8rem; border-radius: 0.5rem; transition: all 0.2s;">
                                Edit
                            </button>
                            <button onclick="deleteBudget('${budget.category}')" style="background: none; border: none; color: #ef4444; font-size: 0.75rem; font-weight: 700; cursor: pointer; text-decoration: underline; padding: 0.5rem;">
                                Remove
                            </button>
                        </div>
                    </div>
                    
                    <div style="position: absolute; right: -10px; top: -10px; font-size: 4rem; opacity: 0.05; pointer-events: none; transform: rotate(15deg);">
                        ${budget.category.split(' ')[0]}
                    </div>
                `;
                fragment.appendChild(item);
            });
            EL.budgetList.innerHTML = '';
            EL.budgetList.appendChild(fragment);
        } catch (error) {
            console.error('Error fetching budget status:', error);
        }
    }

    // Edit Budget
    window.editBudget = (category, limit) => {
        if (!EL.budgetCategory || !EL.budgetLimit) return;

        EL.budgetCategory.value = category;
        // Format the limit using VND system so it's readable
        EL.budgetLimit.value = formatVND(limit);

        // Scroll to form
        document.querySelector('.budget-form-wrapper')?.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Brief highlight effect on the input
        EL.budgetLimit.focus();
    };

    // Delete Budget
    window.deleteBudget = async (category) => {
        if (!confirm(`Delete budget for ${category}?`)) return;

        try {
            const response = await fetch(`/api/budget/${encodeURIComponent(category)}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                const selectedMonth = EL.monthSelector ? EL.monthSelector.value : null;
                fetchBudgetStatus(selectedMonth);
            } else {
                alert('Failed to delete budget');
            }
        } catch (error) {
            console.error('Error deleting budget:', error);
        }
    };

    // Fetch budget status on load
    fetchBudgetStatus();

    // ========== ASSETS & SAVINGS LOGIC ==========
    async function fetchAssets(month = null) {
        if (!EL.assetsLoading || !EL.assetsContent) return;

        try {
            const url = month ? `/api/assets?month=${month}` : '/api/assets';
            const response = await fetch(url);
            const assets = await response.json();

            EL.assetsLoading.style.display = 'none';
            EL.assetsContent.style.display = 'block';

            let cash = 0;
            let bank = 0;
            const savings = [];

            assets.forEach(a => {
                if (a.type === 'Cash') cash += a.amount;
                else if (a.type === 'Bank') bank += a.amount;
                else if (a.type === 'Savings' || a.type === 'Cumulative') savings.push(a);
            });

            // Populate Payment Source Dropdown (Liquid only)
            if (EL.assetSelect) {
                // Clear existing options except default "None"
                while (EL.assetSelect.options.length > 1) {
                    EL.assetSelect.remove(1);
                }

                assets.forEach(a => {
                    if (a.type === 'Cash' || a.type === 'Bank') {
                        const opt = document.createElement('option');
                        opt.value = a.id;
                        opt.textContent = `${a.name} (${formatVND(a.amount)})`;
                        EL.assetSelect.appendChild(opt);
                    }
                });
            }

            // Update Liquid Cards
            if (EL.assetCash) EL.assetCash.textContent = formatVND(cash) + ' ₫';
            if (EL.assetBank) EL.assetBank.textContent = formatVND(bank) + ' ₫';

            // Render Savings List with Calculations
            if (EL.savingsList) {
                EL.savingsList.innerHTML = '';
            } else {
                return;
            }

            savings.forEach(s => {
                // Calculate Interest
                // Formula: Principal * Rate% * Days / 365
                // Or simplified: Principal * Rate% * Months / 12

                let matureDateObj = null;
                let startDateObj = s.start_date ? new Date(s.start_date) : new Date(); // Fallback if missing
                const now = new Date();

                if (s.end_date) {
                    matureDateObj = new Date(s.end_date);
                } else if (s.term_months) {
                    // Start date + months
                    // We need a stable start date. For the user's specific items we seeded 2024-01-30.
                    matureDateObj = new Date(startDateObj);
                    matureDateObj.setMonth(matureDateObj.getMonth() + s.term_months);
                }

                // If we know maturity, we can calculate expected full return
                let expectedInterest = 0;
                let progress = 0;

                // Interest Calculation Logic based on Term or Date
                if (s.term_months && s.interest_rate) {
                    // Term Deposit: Interest = Principal * Rate% * (Months/12)
                    expectedInterest = s.amount * (s.interest_rate / 100) * (s.term_months / 12);
                } else if (s.type === 'Cumulative') {
                    // Cumulative Fund logic: 
                    // Principal increases by 'auto_contribution' monthly.
                    // Total invested = StartAmount + Monthly * Months

                    if (matureDateObj && startDateObj) {
                        const diffTime = Math.abs(matureDateObj - startDateObj);
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        const months = Math.floor(diffDays / 30); // Approx

                        // Approx total principal at end
                        const totalPrincipal = s.amount + (s.auto_contribution || 0) * months;
                        const avgBalance = (s.amount + totalPrincipal) / 2;
                        const years = diffDays / 365.0;
                        expectedInterest = avgBalance * (s.interest_rate / 100) * years;
                    }
                } else if (matureDateObj && startDateObj) {
                    // Date diff based: Interest = Principal * Rate% * (Years)
                    const diffTime = Math.abs(matureDateObj - startDateObj);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    const years = diffDays / 365.0;
                    expectedInterest = s.amount * (s.interest_rate / 100) * years;
                }

                if (matureDateObj) {
                    // Progress Bar
                    const totalDuration = matureDateObj.getTime() - startDateObj.getTime();
                    const elapsed = now.getTime() - startDateObj.getTime();
                    // Clamp 0-100
                    progress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
                }

                const finalValue = s.amount + expectedInterest;

                // Create Card
                const item = document.createElement('div');
                item.style.cssText = `
                    background: rgba(255,255,255,0.1); 
                    padding: 1rem; 
                    border-radius: 0.75rem; 
                    border: 1px solid rgba(255,255,255,0.2);
                    position: relative;
                    overflow: hidden;
                `;

                // Progress Bar Background Layer
                const progressBar = document.createElement('div');
                progressBar.style.cssText = `
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    height: 4px;
                    background: #34d399; /* Emerald 400 */
                    width: ${progress}%;
                    transition: width 1s ease-in-out;
                    opacity: 0.8;
                `;

                item.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem; position: relative; z-index: 1;">
                        <div>
                            <div style="font-size: 0.95rem; font-weight: 700;">${s.name}</div>
                            <div style="font-size: 0.75rem; opacity: 0.7;">
                                Ends: ${matureDateObj ? matureDateObj.toLocaleDateString('vi-VN') : 'Unknown'} 
                                (${progress.toFixed(0)}% elapsed)
                            </div>
                        </div>
                        <div style="background: rgba(52, 211, 153, 0.2); color: #6ee7b7; padding: 0.2rem 0.6rem; border-radius: 1rem; font-size: 0.75rem; font-weight: 600;">
                            ${s.interest_rate}% / year
                        </div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; position: relative; z-index: 1;">
                        <div>
                            <div style="font-size: 0.75rem; opacity: 0.8; margin-bottom: 0.1rem;">Dep. Amount</div>
                            <div style="font-size: 1.1rem; font-weight: 600;">${formatVND(s.amount)} ₫</div>
                        </div>
                        <div style="text-align: right;">
                             <div style="font-size: 0.75rem; opacity: 0.8; margin-bottom: 0.1rem;">Est. Profit</div>
                             <div style="font-size: 1.1rem; font-weight: 600; color: #6ee7b7;">+${formatVND(expectedInterest.toFixed(0))} ₫</div>
                        </div>
                    </div>
                `;

                item.appendChild(progressBar);
                EL.savingsList.appendChild(item);
            });

        } catch (e) {
            console.error('Error fetching assets:', e);
            if (loading) loading.textContent = 'Failed to load assets.';
        }
    }

    // --- Bulk AI Import Logic ---

    window.openBulkModal = () => {
        if (EL.bulkModal) EL.bulkModal.style.display = 'block';
        backToBulkInput();
    };

    window.closeBulkModal = () => {
        if (EL.bulkModal) EL.bulkModal.style.display = 'none';
    };

    window.backToBulkInput = () => {
        if (EL.bulkInputStep) EL.bulkInputStep.style.display = 'block';
        if (EL.bulkReviewStep) EL.bulkReviewStep.style.display = 'none';
        if (EL.bulkLoading) EL.bulkLoading.style.display = 'none';
    };

    document.getElementById('bulk-ai-btn')?.addEventListener('click', openBulkModal);

    document.getElementById('bulk-extract-btn')?.addEventListener('click', async () => {
        const text = document.getElementById('bulk-text-input').value;
        if (!text.trim()) return alert("Please paste some text first!");

        if (text.length > 50000) {
            if (!confirm("This is a very long text. Analysis might take longer or hit limits. Continue?")) return;
        }

        EL.bulkInputStep.style.display = 'none';
        EL.bulkLoading.style.display = 'block';

        try {
            const response = await fetch('/api/ai/bulk-extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });
            const data = await response.json();

            if (data.transactions) {
                EL.detectedTransactions = data.transactions;
                renderBulkReview();
                EL.bulkLoading.style.display = 'none';
                EL.bulkReviewStep.style.display = 'block';
            } else {
                alert(data.error || "Could not extract transactions.");
                backToBulkInput();
            }
        } catch (error) {
            console.error('Bulk extraction failed:', error);
            alert("An error occurred during scanning.");
            backToBulkInput();
        }
    });

    function renderBulkReview() {
        if (!EL.bulkTableBody) return;
        EL.bulkTableBody.innerHTML = '';
        if (EL.detectedTransactions.length === 0) {
            EL.bulkTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color: #94a3b8;">No transactions found in this text.</td></tr>';
            return;
        }

        const standardCats = ["Food", "Rent", "Utilities", "Transport", "Groceries", "Shopping", "Entertainment", "Travel", "Health", "Salary", "Bonus", "Investment", "Other Income", "Other"];

        EL.detectedTransactions.forEach((t, index) => {
            const row = document.createElement('tr');
            row.style.borderBottom = '1px solid #f1f5f9';

            // Normalize category if AI hallucinated
            const cat = standardCats.includes(t.category) ? t.category : "Other";

            row.innerHTML = `
                <td style="padding: 0.75rem;"><input type="checkbox" class="bulk-item-check" data-index="${index}" checked></td>
                <td style="padding: 0.5rem;"><input type="date" class="bulk-edit-date" data-index="${index}" value="${t.date}" style="border:1px solid #e2e8f0; padding:0.2rem; border-radius:0.3rem; font-size:0.8rem;"></td>
                <td style="padding: 0.5rem;">
                    <input type="text" class="bulk-edit-desc" data-index="${index}" value="${t.description}" style="width:100%; border:1px solid #e2e8f0; padding:0.2rem; border-radius:0.3rem; font-size:0.8rem;">
                    <div style="font-size:0.7rem; color:#94a3b8; margin-top:0.2rem; font-style:italic;">Source: "${t.original_snippet || 'N/A'}"</div>
                </td>
                <td style="padding: 0.5rem;">
                    <select class="bulk-edit-cat" data-index="${index}" style="border:1px solid #e2e8f0; padding:0.2rem; border-radius:0.3rem; font-size:0.8rem;">
                        ${standardCats.map(c => `<option value="${c}" ${cat === c ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                </td>
                <td style="padding: 0.5rem; text-align: right;">
                    <div style="display:flex; align-items:center; justify-content:flex-end; gap:0.2rem;">
                        <span style="font-weight:700; color: ${t.type === 'expense' ? '#ef4444' : '#10b981'};">${t.type === 'expense' ? '-' : '+'}</span>
                        <input type="number" class="bulk-edit-amount" data-index="${index}" value="${t.amount}" style="width:80px; border:1px solid #e2e8f0; padding:0.2rem; border-radius:0.3rem; font-size:0.8rem; text-align:right;">
                    </div>
                </td>
            `;
            EL.bulkTableBody.appendChild(row);
        });
        updateBulkCount();
    }

    function updateBulkCount() {
        const checked = document.querySelectorAll('.bulk-item-check:checked').length;
        if (EL.bulkCountBadge) EL.bulkCountBadge.textContent = checked;
    }

    document.getElementById('bulk-select-all')?.addEventListener('change', (e) => {
        document.querySelectorAll('.bulk-item-check').forEach(cb => cb.checked = e.target.checked);
        updateBulkCount();
    });

    EL.bulkTableBody?.addEventListener('change', (e) => {
        if (e.target.classList.contains('bulk-item-check')) updateBulkCount();
    });

    document.getElementById('bulk-confirm-btn')?.addEventListener('click', async () => {
        const checks = document.querySelectorAll('.bulk-item-check:checked');
        if (checks.length === 0) return alert("No transactions selected!");

        const btn = document.getElementById('bulk-confirm-btn');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.textContent = "Saving...";

        const toSave = [];
        checks.forEach(cb => {
            const idx = cb.dataset.index;
            const row = cb.closest('tr');
            toSave.push({
                date: row.querySelector('.bulk-edit-date').value,
                description: row.querySelector('.bulk-edit-desc').value,
                category: row.querySelector('.bulk-edit-cat').value,
                amount: parseFloat(row.querySelector('.bulk-edit-amount').value),
                type: EL.detectedTransactions[idx].type // Keep original type
            });
        });

        try {
            let successCount = 0;
            for (const t of toSave) {
                const res = await fetch('/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(t)
                });
                if (res.ok) successCount++;
            }
            alert(`Successfully imported ${successCount} transactions!`);
            closeBulkModal();
            fetchData(); // Refresh main list
        } catch (error) {
            console.error('Error saving bulk:', error);
            alert("Error while saving transactions.");
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });

    window.onclick = (event) => {
        if (event.target == EL.bulkModal) closeBulkModal();
        if (event.target == EL.editModal) closeModal();
    };

    // ========== RICH TEXT EDITOR ==========
    let savedSelection = null;

    function saveSelection() {
        if (window.getSelection) {
            const sel = window.getSelection();
            if (sel.getRangeAt && sel.rangeCount) {
                return sel.getRangeAt(0);
            }
        }
        return null;
    }

    function restoreSelection(range) {
        if (range) {
            if (window.getSelection) {
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }
    }

    window.formatDoc = (command, value = null) => {
        document.execCommand(command, false, value);
        if (EL.diaryContent) EL.diaryContent.focus();
    };

    // Color picker fix: save selection on click, restore on change
    const colorPicker = document.getElementById('diary-color-picker');
    colorPicker?.addEventListener('mousedown', () => {
        savedSelection = saveSelection();
    });

    colorPicker?.addEventListener('input', (e) => {
        restoreSelection(savedSelection);
        formatDoc('foreColor', e.target.value);
    });

    // Add Checklist Function
    window.addChecklist = () => {
        if (!EL.diaryContent) return;
        EL.diaryContent.focus();

        const timestamp = Date.now();
        const checkboxId = `check-${timestamp}`;

        // Insert a new checklist item at the cursor
        // Added: logic to sync 'checked' attribute in the onchange handler
        const checklistHtml = `
            <div class="checklist-item" contenteditable="false">
                <input type="checkbox" id="${checkboxId}" onchange="this.parentElement.classList.toggle('completed', this.checked); if(this.checked) this.setAttribute('checked', ''); else this.removeAttribute('checked');">
                <span class="checklist-text" contenteditable="true" style="margin-left: 5px;">New task</span>
            </div>
            <div><br></div>
        `;

        document.execCommand('insertHTML', false, checklistHtml);
    };

    // Event delegation to catch checkbox changes if they are loaded from history
    EL.diaryContent?.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') {
            const item = e.target.closest('.checklist-item');
            if (item) {
                const isChecked = e.target.checked;
                item.classList.toggle('completed', isChecked);

                // CRITICAL: Synchronize the 'checked' attribute so innerHTML captures it for saving
                if (isChecked) {
                    e.target.setAttribute('checked', '');
                } else {
                    e.target.removeAttribute('checked');
                }

                saveDiary(true); // Trigger auto-save immediately on state change
            }
        }
    });

    // Handle Enter key in checklist text to create new item
    EL.diaryContent?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const selection = window.getSelection();
            const anchorNode = selection.anchorNode;
            const checklistText = anchorNode?.parentElement?.closest('.checklist-text');

            if (checklistText) {
                e.preventDefault();
                addChecklist();
            }
        }
    });

});
