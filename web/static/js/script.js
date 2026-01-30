document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('transaction-form');
    const balanceAmount = document.getElementById('balance-amount');
    const monthSelector = document.getElementById('month-selector');
    const transactionList = document.getElementById('transaction-list');

    // Chart instance
    let expenseChart = null;

    // Helper: Parse string with dots/commas to number
    function parseVND(str) {
        if (!str) return 0;
        let s = str.toString().toLowerCase().trim().replace(/\s+/g, '');
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
        let clean = s.replace(/\./g, '').replace(/,/g, '.');
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
        const raw = input.value.toLowerCase().trim().replace(/\s+/g, '');
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
    function setupSmartInput(inputId) {
        const input = document.getElementById(inputId);
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

    setupSmartInput('amount');
    setupSmartInput('edit-amount');
    setupSmartInput('budget-limit');

    // Fetch AI Model Info
    async function fetchAIInfo() {
        const badge = document.getElementById('ai-model-badge');
        const selector = document.getElementById('model-selector');
        if (!badge) return;
        try {
            const response = await fetch('/api/ai-info');
            const data = await response.json();
            if (data.provider && data.model) {
                badge.textContent = `${data.provider} (${data.model})`;
                if (selector) selector.value = data.provider.toLowerCase();
            } else {
                badge.textContent = 'AI Ready';
            }
        } catch (error) {
            console.error('Error fetching AI info:', error);
            badge.textContent = 'AI Offline';
        }
    }
    fetchAIInfo();

    // Model Selector Change Logic
    document.getElementById('model-selector')?.addEventListener('change', async (e) => {
        const provider = e.target.value;
        const badge = document.getElementById('ai-model-badge');
        badge.textContent = 'Switching...';

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

    aiBtn.addEventListener('click', async () => {
        const text = aiInput.value.trim();
        if (!text) return;

        aiBtn.style.display = 'none';
        aiLoading.style.display = 'flex';

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
                if (result.category && budgetCategory) {
                    let match = Array.from(budgetCategory.options).find(opt => opt.value && opt.value.toLowerCase() === result.category.toLowerCase());
                    if (match) {
                        budgetCategory.value = match.value;
                    } else {
                        // Attempt partial match or default to Other
                        match = Array.from(budgetCategory.options).find(opt => opt.value && result.category.toLowerCase().includes(opt.value.toLowerCase()));
                        budgetCategory.value = match ? match.value : 'Other';
                    }
                }

                if (result.monthly_limit) {
                    budgetLimit.value = formatVND(result.monthly_limit);
                    budgetLimit.dataset.adjustment = result.adjustment || '';
                    if (result.adjustment) {
                        const adjText = result.adjustment === 'increase' ? ' (Tăng thêm)' : ' (Giảm bớt)';
                        // Show visual feedback for adjustment
                        const label = budgetLimit.parentElement.querySelector('label');
                        if (label) label.textContent = 'Monthly Limit' + adjText;
                    } else {
                        const label = budgetLimit.parentElement.querySelector('label');
                        if (label) label.textContent = 'Monthly Limit';
                    }
                    budgetLimit.style.backgroundColor = '#dcfce7'; // Light green flash
                    setTimeout(() => budgetLimit.style.backgroundColor = '', 500);
                }

                aiInput.value = '';

                // Scroll to budget manager safely
                const budgetSection = document.querySelector('.budget-manager');
                if (budgetSection) {
                    budgetSection.scrollIntoView({ behavior: 'smooth' });
                }

                // Visual feedback safely
                if (budgetLimit) budgetLimit.focus();

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
                    const descInput = document.getElementById('description');
                    if (descInput) descInput.value = result.description;
                }

                // Auto-select Payment Source based on AI
                const assetSelect = document.getElementById('transaction-asset');
                if (result.payment_source && assetSelect) {
                    for (let i = 0; i < assetSelect.options.length; i++) {
                        const opt = assetSelect.options[i];
                        if (opt.text.toLowerCase().includes(result.payment_source.toLowerCase())) {
                            assetSelect.selectedIndex = i;
                            break;
                        }
                    }
                }

                // Clear AI input
                aiInput.value = '';

                // Scroll to form safely
                const transForm = document.getElementById('transaction-form');
                if (transForm) {
                    transForm.scrollIntoView({ behavior: 'smooth' });
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
    aiInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') aiBtn.click();
    });

    // Add Transaction
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const amountInput = document.getElementById('amount');
        const category = document.getElementById('category').value;
        const type = document.getElementById('type').value;
        const description = document.getElementById('description').value;
        const assetId = document.getElementById('transaction-asset').value; // New

        let amountIndex = getFullAmount(amountInput);

        const data = {
            amount: amountIndex,
            category: category,
            type: type,
            description: description,
            date: document.getElementById('date').value,
            asset_id: assetId // New
        };

        try {
            const response = await fetch('/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                form.reset();
                fetchData();
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
    if (diaryDateInput) {
        const today = new Date().toISOString().split('T')[0];
        diaryDateInput.value = today;
        loadDiary(today);
        loadDiaryHistory();

        diaryDateInput.addEventListener('change', (e) => {
            loadDiary(e.target.value);
        });
    }

    async function loadDiary(date) {
        if (!diaryContent) return;
        diaryContent.placeholder = "Loading your thoughts...";
        try {
            const response = await fetch(`/api/diary?date=${date}`);
            const data = await response.json();
            diaryContent.value = data.content || "";
            diaryContent.placeholder = "Share your thoughts for today...";
        } catch (error) {
            console.error('Error loading diary:', error);
            diaryContent.placeholder = "Failed to load thoughts.";
        }
    }

    async function loadDiaryHistory() {
        if (!diaryHistoryList) return;

        const searchInput = document.getElementById('note-search');
        if (searchInput && !searchInput.dataset.listenerAdded) {
            searchInput.addEventListener('input', () => loadDiaryHistory());
            searchInput.dataset.listenerAdded = 'true';
        }

        const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";

        try {
            const response = await fetch('/api/diary/history');
            const data = await response.json();

            if (data.history && data.history.length > 0) {
                // Filter history if search term is present
                const filteredHistory = data.history.filter(date => date.includes(searchTerm));

                if (filteredHistory.length === 0) {
                    diaryHistoryList.innerHTML = '<p style="font-size: 0.75rem; color: #9ca3af; text-align: center;">No matching notes</p>';
                    return;
                }

                diaryHistoryList.innerHTML = '';

                // Group by Month/Year
                const groups = {};
                filteredHistory.forEach(dateStr => {
                    const [year, month, day] = dateStr.split('-');
                    const groupKey = `${year}-${month}`;
                    if (!groups[groupKey]) groups[groupKey] = [];
                    groups[groupKey].push(dateStr);
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
                    diaryHistoryList.appendChild(header);

                    // Add items in this group
                    groups[groupKey].forEach(date => {
                        const day = date.split('-')[2];
                        const btn = document.createElement('button');
                        btn.className = 'note-item';
                        btn.innerHTML = `
                            <span>Note for ${date}</span>
                            <span class="day-chip">Day ${day}</span>
                        `;
                        btn.onclick = () => {
                            diaryDateInput.value = date;
                            loadDiary(date);
                        };
                        diaryHistoryList.appendChild(btn);
                    });
                });
            } else {
                diaryHistoryList.innerHTML = '<p style="font-size: 0.75rem; color: #9ca3af; text-align: center;">No notes recorded yet</p>';
            }
        } catch (error) {
            console.error('Error loading history:', error);
        }
    }

    saveDiaryBtn?.addEventListener('click', async () => {
        const date = diaryDateInput.value;
        const content = diaryContent.value;
        if (!date) return;

        saveDiaryBtn.textContent = "Saving...";
        saveDiaryBtn.disabled = true;

        try {
            const response = await fetch('/api/diary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, content })
            });
            if (response.ok) {
                saveDiaryBtn.textContent = "Saved! ✓";
                loadDiaryHistory(); // Refresh history list
                setTimeout(() => {
                    saveDiaryBtn.textContent = "Save Note";
                    saveDiaryBtn.disabled = false;
                }, 2000);
            } else {
                alert('Failed to save note');
                saveDiaryBtn.textContent = "Save Note";
                saveDiaryBtn.disabled = false;
            }
        } catch (error) {
            console.error('Error saving diary:', error);
            alert('An error occurred while saving');
            saveDiaryBtn.textContent = "Save Note";
            saveDiaryBtn.disabled = false;
        }
    });

    // ========== SIDEBAR STATS ==========
    async function updateSidebarStats(transactions) {
        const spentStat = document.getElementById('month-spent-stat');
        const countStat = document.getElementById('tx-count-stat');
        if (!spentStat || !countStat) return;

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const currentMonthPrefix = `${year}-${month}`;

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

        spentStat.textContent = `${totalSpent.toLocaleString('vi-VN')} ₫`;
        countStat.textContent = monthTxs.length;
    }

    // ========== MAIN DATA FETCHING ==========
    async function fetchData(month = null) {
        console.log(`Fetching data for month: ${month || 'current'}...`);
        try {
            const url = month ? `/api/data?month=${month}` : '/api/data';
            const response = await fetch(url);
            const data = await response.json();

            if (!data) return;

            // Fetch assets
            fetchAssets();

            // Update balance
            if (balanceAmount) {
                balanceAmount.textContent = `${(data.balance || 0).toLocaleString('vi-VN')} ₫`;
            }

            // Update Stats in Sidebar
            if (Array.isArray(data.transactions)) {
                updateSidebarStats(data.transactions);

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

                // Update Transaction List
                if (transactionList) {
                    transactionList.innerHTML = '';
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
                        transactionList.appendChild(li);
                    });
                }
            }

            // Refresh budget status
            if (typeof fetchBudgetStatus === 'function') {
                await fetchBudgetStatus();
            }
        } catch (error) {
            console.error('Error in fetchData:', error);
        }
    }

    // Initial fetch to load data on page start
    fetchData();

    // Populate Month Selector and handle change
    if (monthSelector) {
        async function updateAvailableMonths() {
            try {
                const response = await fetch('/api/available-months');
                const months = await response.json();

                // Always ensure current month is in the list
                const currentMonth = new Date().toISOString().substring(0, 7);
                if (!months.includes(currentMonth)) {
                    months.unshift(currentMonth);
                }

                // Clear and repopulate
                monthSelector.innerHTML = '';
                months.forEach(monthVal => {
                    const [year, month] = monthVal.split('-');
                    const date = new Date(year, month - 1, 1);
                    const monthLabel = date.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });

                    const opt = document.createElement('option');
                    opt.value = monthVal;
                    opt.textContent = monthLabel;
                    monthSelector.appendChild(opt);
                });
            } catch (e) {
                console.error('Error fetching months:', e);
            }
        }

        updateAvailableMonths();

        monthSelector.addEventListener('change', (e) => {
            fetchData(e.target.value);
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
            expenseChart.destroy();
        }

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

    // Expose functions to global scope
    window.deleteTransaction = async (id) => {
        if (!confirm('Are you sure you want to delete this transaction?')) return;

        try {
            const response = await fetch(`/delete/${id}`, { method: 'DELETE' });
            if (response.ok) fetchData();
            else alert('Failed to delete');
        } catch (error) {
            console.error('Error deleting:', error);
        }
    };

    // Edit Logic
    const modal = document.getElementById('edit-modal');
    const editForm = document.getElementById('edit-form');
    const editAmountInput = document.getElementById('edit-amount');

    window.editTransaction = (id, amount, category, type, description, date) => {
        document.getElementById('edit-id').value = id;

        // Display as Formatted Full Value (e.g. 1.000). 
        // Focus handler will convert to '1'.
        editAmountInput.value = formatVND(amount);

        document.getElementById('edit-category').value = category;
        document.getElementById('edit-type').value = type;
        document.getElementById('edit-description').value = description;

        // Preserve date
        if (date) {
            // datetime-local expects YYYY-MM-DDTHH:MM
            // SQL might store as YYYY-MM-DD HH:MM:SS
            const formattedDate = date.replace(' ', 'T').substring(0, 16);
            document.getElementById('edit-date').value = formattedDate;
        }

        modal.style.display = 'block';
    };

    window.closeModal = () => {
        modal.style.display = 'none';
    };

    window.onclick = (event) => {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    };

    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-id').value;
        const editAmountInput = document.getElementById('edit-amount');

        let amount = getFullAmount(editAmountInput);

        const data = {
            amount: amount,
            category: document.getElementById('edit-category').value,
            type: document.getElementById('edit-type').value,
            description: document.getElementById('edit-description').value,
            date: document.getElementById('edit-date').value
        };

        try {
            const response = await fetch(`/update/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (response.ok) {
                closeModal();
                fetchData();
            } else {
                alert('Failed to update');
            }
        } catch (error) {
            console.error('Error updating:', error);
        }
    });

    // Initial fetch
    fetchData();

    // Background Image Logic
    const bgBtn = document.getElementById('bg-btn');
    const resetBgBtn = document.getElementById('reset-bg-btn');
    const bgInput = document.getElementById('bg-input');

    // Load saved background
    const savedBg = localStorage.getItem('custom_bg');
    if (savedBg) {
        document.body.style.backgroundImage = `url(${savedBg})`;
    }

    bgBtn.addEventListener('click', () => {
        bgInput.click();
    });

    resetBgBtn.addEventListener('click', () => {
        if (confirm('Remove custom background?')) {
            localStorage.removeItem('custom_bg');
            document.body.style.backgroundImage = '';
        }
    });

    bgInput.addEventListener('change', (e) => {
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



    window.onclick = (event) => {
        if (event.target == document.getElementById('edit-modal')) {
            document.getElementById('edit-modal').style.display = "none";
        }
    };

    // ========== BUDGET MANAGEMENT ==========
    const setBudgetBtn = document.getElementById('set-budget-btn');
    const budgetCategory = document.getElementById('budget-category');
    const budgetLimit = document.getElementById('budget-limit');
    const budgetList = document.getElementById('budget-list');

    // Set Budget
    setBudgetBtn?.addEventListener('click', async () => {
        const category = budgetCategory.value;
        let limit = parseVND(budgetLimit.value);

        // If currently focused, treat as "thousands" unless it has suffix
        if (document.activeElement === budgetLimit) {
            const raw = budgetLimit.value.toLowerCase().trim();
            if (!raw.endsWith('k') && !raw.endsWith('m')) {
                limit = limit * 1000;
            }
        }

        if (!category || !limit || limit <= 0) {
            alert('Please select a category and enter a valid limit');
            return;
        }

        try {
            const adjustment = budgetLimit.dataset.adjustment || null;
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
                budgetCategory.value = '';
                budgetLimit.value = '';
                delete budgetLimit.dataset.adjustment;
                // Reset label text if it was changed
                const label = budgetLimit.parentElement.querySelector('label');
                if (label) label.textContent = 'Monthly Limit';
                fetchBudgetStatus();
            } else {
                alert('Failed to set budget');
            }
        } catch (error) {
            console.error('Error setting budget:', error);
            alert('An error occurred');
        }
    });

    // Fetch and Display Budget Status
    async function fetchBudgetStatus() {
        try {
            const response = await fetch('/api/budget-status');
            const budgets = await response.json();

            if (!budgetList) return;

            if (budgets.length === 0) {
                budgetList.innerHTML = '<p style="text-align: center; opacity: 0.7;">No budgets set yet. Add one above!</p>';
                return;
            }

            budgetList.innerHTML = '';
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
                budgetList.appendChild(item);
            });
        } catch (error) {
            console.error('Error fetching budget status:', error);
        }
    }

    // Edit Budget
    window.editBudget = (category, limit) => {
        if (!budgetCategory || !budgetLimit) return;

        budgetCategory.value = category;
        // Format the limit using VND system so it's readable
        budgetLimit.value = formatVND(limit);

        // Scroll to form
        document.querySelector('.budget-form-wrapper')?.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Brief highlight effect on the input
        budgetLimit.focus();
    };

    // Delete Budget
    window.deleteBudget = async (category) => {
        if (!confirm(`Delete budget for ${category}?`)) return;

        try {
            const response = await fetch(`/api/budget/${encodeURIComponent(category)}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                fetchBudgetStatus();
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
    async function fetchAssets() {
        const loading = document.getElementById('assets-loading');
        const content = document.getElementById('assets-content');
        if (!loading || !content) return;

        try {
            const response = await fetch('/api/assets');
            const assets = await response.json();

            loading.style.display = 'none';
            content.style.display = 'block';

            let cash = 0;
            let bank = 0;
            const savings = [];

            assets.forEach(a => {
                if (a.type === 'Cash') cash += a.amount;
                else if (a.type === 'Bank') bank += a.amount;
                else if (a.type === 'Savings' || a.type === 'Cumulative') savings.push(a);
            });

            // Populate Payment Source Dropdown (Liquid only)
            const assetSelect = document.getElementById('transaction-asset');
            if (assetSelect) {
                // Clear existing options except default "None"
                while (assetSelect.options.length > 1) {
                    assetSelect.remove(1);
                }

                assets.forEach(a => {
                    if (a.type === 'Cash' || a.type === 'Bank') {
                        const opt = document.createElement('option');
                        opt.value = a.id;
                        opt.textContent = `${a.name} (${formatVND(a.amount)})`;
                        assetSelect.appendChild(opt);
                    }
                });
            }

            // Update Liquid Cards
            document.getElementById('asset-cash').textContent = formatVND(cash) + ' ₫';
            document.getElementById('asset-bank').textContent = formatVND(bank) + ' ₫';

            // Render Savings List with Calculations
            const list = document.getElementById('savings-list');
            list.innerHTML = '';

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
                list.appendChild(item);
            });

        } catch (e) {
            console.error('Error fetching assets:', e);
            if (loading) loading.textContent = 'Failed to load assets.';
        }
    }
});


