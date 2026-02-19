// --- Constants & Shared RegExps (js-hoist-regexp) ---
const WHITESPACE_REGEX = /\s+/g;
const DOT_REGEX = /\./g;
const COMMA_REGEX = /,/g;

// --- Toast Notification System ---
function showToast(message, type = 'success', duration = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || '📌'}</span>
        <span>${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// --- Relative Date Formatter ---
function formatRelativeDate(dateStr) {
    if (!dateStr) return '';
    const now = new Date();
    const date = new Date(dateStr.replace(' ', 'T'));
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const time = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

    if (diffDays === 0) {
        // Check if actually today
        if (now.toDateString() === date.toDateString()) return `Hôm nay ${time}`;
        return `Hôm qua ${time}`;
    }
    if (diffDays === 1) return `Hôm qua ${time}`;
    if (diffDays < 7) return `${diffDays} ngày trước`;
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ` ${time}`;
}

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
        } else if (data.type === 'goal') {
            const year = EL.goalYearSelector ? parseInt(EL.goalYearSelector.value) : new Date().getFullYear();
            fetchGoals(year);
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
        bulkConfirmBtn: document.getElementById('bulk-confirm-btn'),
        // Goals elements
        goalsTrack: document.getElementById('goals-track'),
        goalsEmpty: document.getElementById('goals-empty'),
        goalYearSelector: document.getElementById('goal-year-selector'),
        addGoalBtn: document.getElementById('add-goal-btn'),
        goalPrevBtn: document.getElementById('goal-prev-btn'),
        goalNextBtn: document.getElementById('goal-next-btn'),
        goalsSummary: {
            completed: document.getElementById('goals-completed-stat'),
            progress: document.getElementById('goals-total-progress'),
            percent: document.getElementById('goals-percent-stat')
        },
        goalModal: document.getElementById('goal-modal'),
        goalForm: document.getElementById('goal-form'),
        goalId: document.getElementById('goal-id'),
        goalTitle: document.getElementById('goal-title'),
        goalType: document.getElementById('goal-type'),
        goalTarget: document.getElementById('goal-target'),
        goalCurrent: document.getElementById('goal-current'),
        goalModalTitle: document.getElementById('goal-modal-title'),
        goalIconPicker: document.getElementById('goal-icon-picker'),
        goalColorPicker: document.getElementById('goal-color-picker'),
        goalNotes: document.getElementById('goal-notes'),
        deleteGoalBtn: document.getElementById('delete-goal-btn')
    };

    // --- Interactive Cursor Glow ---
    const glow = document.getElementById('cursor-glow');
    if (glow) {
        document.addEventListener('mousemove', (e) => {
            const x = e.clientX;
            const y = e.clientY;

            // Using requestAnimationFrame for performance
            requestAnimationFrame(() => {
                glow.style.transform = `translate(calc(${x}px - 50%), calc(${y}px - 50%))`;
                glow.style.opacity = '1';
            });
        });

        // Hide when mouse leaves the window
        document.addEventListener('mouseleave', () => {
            glow.style.opacity = '0';
        });
    }

    // Event Delegation for Transaction List (Edit/Delete) - Replaces inline onclick
    if (EL.transactionList) {
        EL.transactionList.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.edit-btn');
            if (editBtn) {
                const d = editBtn.dataset;
                window.editTransaction(d.id, d.amount, d.category, d.type, d.description, d.date);
                return;
            }

            const deleteBtn = e.target.closest('.delete-btn');
            if (deleteBtn) {
                const id = deleteBtn.dataset.id;
                window.deleteTransaction(id);
                return;
            }
        });
    }

    // Event Delegation for Assets
    const liquidList = document.getElementById('liquid-assets-list');
    const savingsList = document.getElementById('savings-assets-list');
    [liquidList, savingsList].forEach(list => {
        if (list) {
            list.addEventListener('click', (e) => {
                const editBtn = e.target.closest('.edit-asset-btn');
                if (editBtn) {
                    try {
                        const asset = JSON.parse(editBtn.dataset.asset);
                        window.editAsset(asset);
                    } catch (err) {
                        console.error('Error parsing asset data:', err);
                    }
                }
            });
        }
    });

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
                EL.aiModelBadge.textContent = 'AI Sẵn sàng';
            }
        } catch (error) {
            console.error('Error fetching AI info:', error);
            EL.aiModelBadge.textContent = 'AI Ngoại tuyến';
        }
    }
    fetchAIInfo();

    // Model Selector Change Logic
    EL.modelSelector?.addEventListener('change', async (e) => {
        const provider = e.target.value;
        if (EL.aiModelBadge) EL.aiModelBadge.textContent = 'Đang chuyển đổi...';

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
                alert('Chuyển đổi thất bại: ' + result.error);
                fetchAIInfo();
            }
        } catch (error) {
            console.error('Error switching model:', error);
            alert('Không thể chuyển đổi mô hình');
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
                alert('Lỗi AI: ' + result.error);
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
            showToast('Lỗi AI: ' + error.message, 'error');
        } finally {
            aiBtn.style.display = 'block';
            aiLoading.style.display = 'none';
        }
    });

    // Allow Enter key in AI input
    EL.aiInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') EL.aiBtn.click();
    });

    // ========== VOICE INPUT FEATURE ==========
    const voiceBtn = document.getElementById('voice-btn');
    const voiceIcon = document.getElementById('voice-icon');
    const voiceStatus = document.getElementById('voice-status');
    const voiceStatusText = document.getElementById('voice-status-text');

    let recognition = null;
    let isListening = false;

    // Check for Web Speech API support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition && voiceBtn) {
        recognition = new SpeechRecognition();
        recognition.lang = 'vi-VN'; // Vietnamese
        recognition.interimResults = true;
        recognition.continuous = false;

        recognition.onstart = () => {
            isListening = true;
            voiceIcon.textContent = '🔴';
            voiceBtn.style.background = 'rgba(239, 68, 68, 0.5)';
            voiceBtn.style.animation = 'pulse 1s infinite';
            if (voiceStatus) {
                voiceStatus.style.display = 'block';
                voiceStatusText.textContent = '🎤 Đang lắng nghe...';
            }
        };

        recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            // Show interim results
            if (voiceStatusText) {
                if (interimTranscript) {
                    voiceStatusText.textContent = `🎧 "${interimTranscript}"`;
                }
            }

            // When we have final result
            if (finalTranscript) {
                EL.aiInput.value = finalTranscript;
                if (voiceStatusText) {
                    voiceStatusText.textContent = `✅ Đã nghe: "${finalTranscript}"`;
                }
                // Auto-submit after a short delay
                setTimeout(() => {
                    EL.aiBtn.click();
                    if (voiceStatus) voiceStatus.style.display = 'none';
                }, 500);
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            isListening = false;
            voiceIcon.textContent = '🎤';
            voiceBtn.style.background = 'rgba(255,255,255,0.2)';
            voiceBtn.style.animation = '';
            if (voiceStatusText) {
                let errorMsg = '❌ Lỗi nhận diện';
                if (event.error === 'no-speech') errorMsg = '❌ Không nghe thấy gì';
                else if (event.error === 'audio-capture') errorMsg = '❌ Không tìm thấy microphone';
                else if (event.error === 'not-allowed') errorMsg = '❌ Vui lòng cho phép sử dụng microphone';
                voiceStatusText.textContent = errorMsg;
            }
            setTimeout(() => {
                if (voiceStatus) voiceStatus.style.display = 'none';
            }, 3000);
        };

        recognition.onend = () => {
            isListening = false;
            voiceIcon.textContent = '🎤';
            voiceBtn.style.background = 'rgba(255,255,255,0.2)';
            voiceBtn.style.animation = '';
        };

        voiceBtn.addEventListener('click', () => {
            if (isListening) {
                recognition.stop();
            } else {
                try {
                    recognition.start();
                } catch (e) {
                    console.error('Recognition error:', e);
                }
            }
        });
    } else if (voiceBtn) {
        // Fallback: Browser doesn't support Web Speech API
        voiceBtn.addEventListener('click', () => {
            alert('Trình duyệt của bạn không hỗ trợ nhận diện giọng nói. Vui lòng sử dụng Chrome hoặc Edge.');
        });
    }

    // Add pulse animation if not exists
    if (!document.getElementById('voice-pulse-style')) {
        const style = document.createElement('style');
        style.id = 'voice-pulse-style';
        style.textContent = `
            @keyframes pulse {
                0% { transform: scale(1); }
                50% { transform: scale(1.1); }
                100% { transform: scale(1); }
            }
        `;
        document.head.appendChild(style);
    }

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
                showToast('Đã thêm giao dịch thành công!', 'success');
                const selectedMonth = EL.monthSelector ? EL.monthSelector.value : null;
                fetchData(selectedMonth);
            } else {
                showToast('Không thể thêm giao dịch', 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            showToast('Đã xảy ra lỗi', 'error');
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
            EL.diaryContent.innerHTML = "Không thể tải nội dung.";
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
                    EL.diaryHistoryList.innerHTML = '<p style="font-size: 0.75rem; color: #9ca3af; text-align: center;">Không tìm thấy ghi chú</p>';
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
                    const noteCount = groups[groupKey].length;
                    const header = document.createElement('div');
                    header.className = 'note-group-header';
                    header.innerHTML = `
                        <span>${groupLabel} <span style="opacity:0.5; font-weight:400;">(${noteCount})</span></span>
                        <span class="toggle-icon">▼</span>
                    `;

                    // Container for this month's notes
                    const groupContent = document.createElement('div');
                    groupContent.className = 'note-group-content';

                    // Add items in this group
                    groups[groupKey].forEach(item => {
                        const date = item.date;
                        const title = item.title;
                        const day = date.split('-')[2];
                        const btn = document.createElement('button');
                        btn.className = 'note-item';

                        // Use title if provided, otherwise default to "Note for [Date]"
                        const displayTitle = title && title.trim() ? title : `Bút ký ngày ${date}`;

                        btn.innerHTML = `
                            <span style="font-weight: 500;">${displayTitle}</span>
                            <span class="day-chip">Ngày ${day}</span>
                        `;
                        btn.onclick = () => {
                            EL.diaryDate.value = date;
                            loadDiary(date);
                        };
                        groupContent.appendChild(btn);
                    });

                    // Append header and content to wrapper
                    const groupWrapper = document.createElement('div');
                    groupWrapper.className = 'note-group-wrapper';
                    groupWrapper.appendChild(header);
                    groupWrapper.appendChild(groupContent);
                    EL.diaryHistoryList.appendChild(groupWrapper);

                    // Add toggle event
                    header.addEventListener('click', () => {
                        groupWrapper.classList.toggle('collapsed');
                    });
                });
            } else {
                EL.diaryHistoryList.innerHTML = '<p style="font-size: 0.75rem; color: #9ca3af; text-align: center;">Chưa có ghi chú nào</p>';
            }
        } catch (error) {
            console.error('Error loading history:', error);
        }
    }

    async function saveDiary(isAuto = false) {
        const date = EL.diaryDate.value;
        const content = EL.diaryContent.innerHTML;
        const title = EL.diaryTitle ? EL.diaryTitle.value : "";
        if (!date) return;

        if (EL.saveDiaryBtn) {
            EL.saveDiaryBtn.textContent = isAuto ? "Đang tự lưu..." : "Đang lưu...";
            if (!isAuto) EL.saveDiaryBtn.disabled = true;
        }

        try {
            const response = await fetch('/api/diary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, content, title })
            });
            if (response.ok) {
                if (EL.saveDiaryBtn) EL.saveDiaryBtn.textContent = isAuto ? "Đã tự lưu! ✓" : "Đã lưu! ✓";
                loadDiaryHistory();
                setTimeout(() => {
                    if (EL.saveDiaryBtn) {
                        EL.saveDiaryBtn.textContent = "Lưu ghi chú";
                        EL.saveDiaryBtn.disabled = false;
                    }
                }, 2000);
            } else if (!isAuto) {
                alert('Không thể lưu ghi chú');
            }
        } catch (error) {
            console.error('Error saving diary:', error);
            if (!isAuto) alert('Đã xảy ra lỗi khi lưu');
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
                                <span class="date">${formatRelativeDate(t.date)}</span>
                            </div>
                            <div class="right-section">
                                <div class="amount">
                                    ${t.type === 'expense' ? '-' : '+'}${Number(t.amount || 0).toLocaleString('vi-VN')} ₫
                                </div>
                                <div class="actions">
                                    <button class="edit-btn" 
                                        data-id="${t.id}" 
                                        data-amount="${t.amount}" 
                                        data-category="${t.category}" 
                                        data-type="${t.type}" 
                                        data-description="${t.description || ''}" 
                                        data-date="${t.date}">
                                        <i class="fas fa-edit"></i> Edit
                                    </button>
                                    <button class="delete-btn" data-id="${t.id}">
                                        <i class="fas fa-trash"></i> Delete
                                    </button>
                                </div>
                            </div>
                        `;
                        fragment.appendChild(li);
                    });
                    EL.transactionList.innerHTML = '';
                    if (fragment.children.length === 0) {
                        EL.transactionList.innerHTML = `
                            <div class="empty-state">
                                <div class="empty-state-icon">📋</div>
                                <div class="empty-state-text">Chưa có giao dịch nào</div>
                                <div class="empty-state-hint">Dùng AI Assistant hoặc form để thêm giao dịch đầu tiên!</div>
                            </div>
                        `;
                    } else {
                        EL.transactionList.appendChild(fragment);
                    }
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
                            position: window.innerWidth < 768 ? 'bottom' : 'right',
                        }
                    }
                }
            });
        }
    }

    // Expose functions to global scope
    window.deleteTransaction = async (id) => {
        if (!confirm('Bạn có chắc muốn xóa giao dịch này?')) return;

        try {
            const response = await fetch(`/delete/${id}`, { method: 'DELETE' });
            if (response.ok) {
                showToast('Đã xóa giao dịch', 'success');
                const selectedMonth = EL.monthSelector ? EL.monthSelector.value : null;
                fetchData(selectedMonth);
            }
            else showToast('Không thể xóa giao dịch', 'error');
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
                showToast('Đã cập nhật giao dịch', 'success');
                const selectedMonth = EL.monthSelector ? EL.monthSelector.value : null;
                fetchData(selectedMonth);
            } else {
                showToast('Không thể cập nhật', 'error');
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
            showToast('Vui lòng chọn danh mục và nhập giới hạn hợp lệ', 'warning');
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
                const label = EL.budgetLimit.parentElement.querySelector('label');
                if (label) label.textContent = 'Giới hạn tháng';
                showToast('Đã cập nhật ngân sách', 'success');
                const selectedMonth = EL.monthSelector ? EL.monthSelector.value : null;
                fetchData(selectedMonth);
            } else {
                showToast('Không thể thiết lập ngân sách', 'error');
            }
        } catch (error) {
            console.error('Error setting budget:', error);
            showToast('Đã xảy ra lỗi', 'error');
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
                EL.budgetList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">📊</div>
                        <div class="empty-state-text">Chưa có ngân sách nào</div>
                        <div class="empty-state-hint">Thêm ngân sách ở form phía trên!</div>
                    </div>
                `;
                return;
            }

            const fragment = document.createDocumentFragment();
            budgets.forEach(budget => {
                const percentage = Math.min(budget.percentage, 100);

                // Determine level class and status text
                let levelClass, statusText, barColor;
                if (budget.level === 'danger') {
                    levelClass = 'danger';
                    barColor = '#ef4444';
                    statusText = '⚠️ Vượt ngân sách!';
                } else if (budget.level === 'warning') {
                    levelClass = 'warning';
                    barColor = '#f59e0b';
                    statusText = '⚡ Gần đạt giới hạn';
                } else {
                    levelClass = 'ok';
                    barColor = '#10b981';
                    statusText = '✓ Đang tốt';
                }

                const item = document.createElement('div');
                item.className = `budget-card budget-card--${levelClass}`;

                item.innerHTML = `
                    <div class="budget-header">
                        <div>
                            <div class="budget-category-label">Danh mục</div>
                            <div class="budget-category-name">${budget.category}</div>
                        </div>
                        <div>
                            <span class="budget-status-badge budget-status-badge--${levelClass}">
                                ${statusText}
                            </span>
                        </div>
                    </div>
                    
                    <div class="budget-progress-bar">
                        <div class="budget-progress-fill" style="background: ${barColor}; width: ${percentage}%;"></div>
                    </div>
                    
                    <div class="budget-stats-grid">
                        <div class="budget-stat-box">
                            <div class="stat-label">Đã chi</div>
                            <div class="stat-value">${formatVND(budget.spent)} ₫</div>
                        </div>
                        <div class="budget-stat-box">
                            <div class="stat-label">Giới hạn</div>
                            <div class="stat-value">${formatVND(budget.limit)} ₫</div>
                        </div>
                    </div>
                    
                    <div class="budget-footer">
                        <div class="budget-remaining">
                            ${budget.remaining >= 0 ?
                        `Còn lại: <span style="color: #10b981;">${formatVND(budget.remaining)} ₫</span>` :
                        `Vượt: <span style="color: #ef4444;">${formatVND(Math.abs(budget.remaining))} ₫</span>`}
                        </div>
                        <div class="budget-actions">
                            <button class="budget-edit-btn" onclick="editBudget('${budget.category}', ${budget.limit})">
                                Sửa
                            </button>
                            <button class="budget-remove-btn" onclick="deleteBudget('${budget.category}')">
                                Xóa
                            </button>
                        </div>
                    </div>
                    
                    <div class="budget-watermark">${budget.category.split(' ')[0]}</div>
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
        if (!confirm(`Xóa ngân sách cho ${category}?`)) return;

        try {
            const response = await fetch(`/api/budget/${encodeURIComponent(category)}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                showToast(`Đã xóa ngân sách ${category}`, 'success');
                const selectedMonth = EL.monthSelector ? EL.monthSelector.value : null;
                fetchBudgetStatus(selectedMonth);
            } else {
                showToast('Không thể xóa ngân sách', 'error');
            }
        } catch (error) {
            console.error('Error deleting budget:', error);
        }
    };

    // Fetch budget status on load
    fetchBudgetStatus();

    // ========== ASSETS & SAVINGS LOGIC ==========
    const assetColors = {
        'Cash': 'bg-gradient-to-r from-green-400 to-green-500', // emerald
        'Bank': 'bg-gradient-to-r from-blue-400 to-blue-500', // blue
        'Savings': 'bg-gradient-to-r from-purple-400 to-purple-500', // purple
        'Stock': 'bg-gradient-to-r from-red-400 to-red-500', // red
        'Crypto': 'bg-gradient-to-r from-yellow-400 to-yellow-500', // yellow
        'Real Estate': 'bg-gradient-to-r from-indigo-400 to-indigo-500', // indigo
        'Gold': 'bg-gradient-to-r from-yellow-300 to-yellow-400', // gold
        'Other': 'bg-gradient-to-r from-gray-400 to-gray-500' // gray
    };

    function getAssetIcon(type) {
        const icons = {
            'Cash': '💵', 'Bank': '🏦', 'Savings': '🐖', 'Cumulative': '📈',
            'Stock': '📉', 'Crypto': '₿', 'Real Estate': '🏠', 'Gold': '🥇', 'Other': '📦'
        };
        return icons[type] || '💰';
    }

    async function fetchAssets(month = null) {
        if (!EL.assetsLoading || !EL.assetsContent) return;

        try {
            const url = month ? `/api/assets?month=${month}` : '/api/assets';
            const response = await fetch(url);
            const assets = await response.json();

            EL.assetsLoading.style.display = 'none';
            EL.assetsContent.style.display = 'block';

            const liquidContainer = document.getElementById('liquid-assets-list');
            const savingsContainer = document.getElementById('savings-assets-list');

            if (liquidContainer) liquidContainer.innerHTML = '';
            if (savingsContainer) savingsContainer.innerHTML = '';

            // Separate Assets
            const liquidTypes = ['Cash', 'Bank', 'Other'];
            // Everything else goes to Savings/Investments unless explicitly specified?
            // Let's stick to the user's implicit logic: Cash/Bank/Other -> Liquid.
            // Savings/Cumulative/Stock/Crypto/RealEstate/Gold -> Savings.

            assets.forEach(a => {
                const isLiquid = liquidTypes.includes(a.type);
                const container = isLiquid ? liquidContainer : savingsContainer;
                if (!container) return;

                const card = document.createElement('div');
                card.className = 'asset-card';

                // Calculate Savings Info if applicable
                let footerInfo = '';
                let progressBar = '';
                let extraValue = '';

                if (!isLiquid) {
                    // Savings Logic
                    let matureDateObj = null;
                    let startDateObj = a.start_date ? new Date(a.start_date) : new Date();
                    const now = new Date();

                    if (a.end_date) {
                        matureDateObj = new Date(a.end_date);
                    } else if (a.term_months) {
                        matureDateObj = new Date(startDateObj);
                        matureDateObj.setMonth(matureDateObj.getMonth() + a.term_months);
                    }

                    // Interest Calc
                    let expectedInterest = 0;
                    if (a.term_months && a.interest_rate) {
                        expectedInterest = a.amount * (a.interest_rate / 100) * (a.term_months / 12);
                    } else if (a.type === 'Cumulative' && matureDateObj) {
                        // Cumulative approx
                        const diffTime = Math.abs(matureDateObj - startDateObj);
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        const months = Math.floor(diffDays / 30);
                        const totalPrincipal = a.amount + (a.auto_contribution || 0) * months;
                        const avgBalance = (a.amount + totalPrincipal) / 2;
                        const years = diffDays / 365.0;
                        expectedInterest = avgBalance * (a.interest_rate / 100) * years;
                    } else if (matureDateObj) {
                        // Simple annual
                        const diffTime = Math.abs(matureDateObj - startDateObj);
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        const years = diffDays / 365.0;
                        expectedInterest = a.amount * (a.interest_rate / 100) * years;
                    }

                    if (matureDateObj) {
                        const totalDuration = matureDateObj.getTime() - startDateObj.getTime();
                        const elapsed = now.getTime() - startDateObj.getTime();
                        const progress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));

                        progressBar = `
                            <div style="position: absolute; bottom: 0; left: 0; h-1; width: 100%; background: rgba(255,255,255,0.1);">
                                <div style="height: 3px; background: #34d399; width: ${progress}%;"></div>
                            </div>
                        `;
                        footerInfo = `<div style="font-size: 0.75rem; opacity: 0.7; margin-top: 0.5rem;">Ends: ${matureDateObj.toLocaleDateString('vi-VN')}</div>`;
                    }

                    if (expectedInterest > 0) {
                        extraValue = `<div style="font-size: 0.8rem; color: #6ee7b7; font-weight: 600;">+${formatVND(expectedInterest.toFixed(0))}</div>`;
                    }
                }

                card.innerHTML = `
                    <div class="asset-actions">
                        <button class="asset-action-btn edit-asset-btn" data-asset='${JSON.stringify(a).replace(/'/g, "&apos;")}' title="Edit">
                            <i class="fas fa-pen"></i>
                        </button>
                    </div>
                    <div class="asset-type">${getAssetIcon(a.type)} ${a.type}</div>
                    <div class="asset-name">${a.name}</div>
                    <div class="asset-amount">${formatVND(a.amount)} ₫</div>
                    ${extraValue}
                    ${footerInfo}
                    ${progressBar}
                `;
                container.appendChild(card);
            });

            // Populate Payment Source Dropdown (Liquid only)
            if (EL.assetSelect) {
                // Keep "None"
                while (EL.assetSelect.options.length > 1) EL.assetSelect.remove(1);

                assets.filter(a => liquidTypes.includes(a.type)).forEach(a => {
                    const opt = document.createElement('option');
                    opt.value = a.id;
                    opt.textContent = `${a.name} (${formatVND(a.amount)})`;
                    EL.assetSelect.appendChild(opt);
                });
            }

        } catch (e) {
            console.error('Error fetching assets:', e);
            if (EL.assetsLoading) EL.assetsLoading.textContent = 'Failed to load assets.';
        }
    }

    // Asset Management
    window.openAssetModal = () => {
        const modal = document.getElementById('asset-modal');
        const form = document.getElementById('asset-form');
        document.getElementById('asset-modal-title').textContent = "Add New Asset";
        if (modal) {
            modal.style.display = 'block';
            form.reset();
            document.getElementById('asset-id').value = '';
            document.getElementById('delete-asset-btn').style.display = 'none';
        }
    };

    window.closeAssetModal = () => {
        const modal = document.getElementById('asset-modal');
        if (modal) modal.style.display = 'none';
    };

    window.editAsset = (asset) => {
        const modal = document.getElementById('asset-modal');
        if (modal) {
            modal.style.display = 'block';
            document.getElementById('asset-modal-title').textContent = "Edit Asset";
            document.getElementById('asset-id').value = asset.id;
            document.getElementById('asset-name').value = asset.name;
            document.getElementById('asset-type').value = asset.type;

            // Format amount
            document.getElementById('asset-amount').value = formatVND(asset.amount);

            document.getElementById('asset-interest').value = asset.interest_rate || '';
            document.getElementById('asset-start-date').value = asset.start_date || '';
            document.getElementById('asset-end-date').value = asset.end_date || '';
            document.getElementById('asset-auto').value = asset.auto_contribution ? formatVND(asset.auto_contribution) : '';

            document.getElementById('delete-asset-btn').style.display = 'block';
        }
    };

    window.deleteAsset = async () => {
        const id = document.getElementById('asset-id').value;
        if (!id) return;
        if (!confirm('Bạn có chắc không? Các giao dịch liên kết sẽ vẫn còn nhưng mất liên kết.')) return;

        try {
            const res = await fetch(`/api/assets/${id}`, { method: 'DELETE' });
            if (res.ok) {
                closeAssetModal();
                fetchAssets();
            } else {
                alert('Failed to delete asset');
            }
        } catch (e) {
            console.error(e);
            alert('Error deleting asset');
        }
    };

    // Form Submit
    document.getElementById('asset-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = document.getElementById('asset-id').value;
        const amountInput = document.getElementById('asset-amount');
        const autoInput = document.getElementById('asset-auto');

        const data = {
            name: document.getElementById('asset-name').value,
            type: document.getElementById('asset-type').value,
            amount: getFullAmount(amountInput),
            interest_rate: parseFloat(document.getElementById('asset-interest').value) || 0,
            start_date: document.getElementById('asset-start-date').value || null,
            end_date: document.getElementById('asset-end-date').value || null,
            auto_contribution: getFullAmount(autoInput)
        };

        const url = id ? `/api/assets/${id}` : '/api/assets';
        const method = id ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();

            if (result.success || res.ok) {
                closeAssetModal();
                showToast('Đã lưu tài sản thành công', 'success');
                fetchAssets();
            } else {
                showToast(result.error || 'Không thể lưu tài sản', 'error');
            }
        } catch (e) {
            console.error(e);
            showToast('Lỗi khi lưu tài sản', 'error');
        }
    });

    // Formatting listeners for new inputs
    const assetAmount = document.getElementById('asset-amount');
    const assetAuto = document.getElementById('asset-auto');
    if (assetAmount) setupSmartInput(assetAmount);
    if (assetAuto) setupSmartInput(assetAuto);

    // Initial Fetch (Assets) logic is called inside fetchData usually, or separately?
    // Let's check fetchData.
    // fetchData is called on load? No, line 1673 ends the block.
    // We need to make sure fetchAssets is called on load.
    fetchAssets();

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
        if (!text.trim()) return showToast('Vui lòng dán văn bản trước!', 'warning');

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
            showToast('Đã xảy ra lỗi khi phân tích', 'error');
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
            showToast(`Đã nhập ${successCount} giao dịch thành công!`, 'success');
            closeBulkModal();
            fetchData();
        } catch (error) {
            console.error('Error saving bulk:', error);
            showToast('Lỗi khi lưu giao dịch', 'error');
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

    // Handle keys in checklist
    EL.diaryContent?.addEventListener('keydown', (e) => {
        const selection = window.getSelection();
        const anchorNode = selection.anchorNode;
        const checklistText = anchorNode?.parentElement?.closest('.checklist-text') ||
            (anchorNode?.classList?.contains('checklist-text') ? anchorNode : null);

        if (e.key === 'Enter' && checklistText) {
            e.preventDefault();
            addChecklist();
        }

        if (e.key === 'Backspace' && checklistText) {
            // If the checklist item is empty or the cursor is at the start, delete the whole block
            if (checklistText.textContent.trim() === '' || (selection.anchorOffset === 0)) {
                const item = checklistText.closest('.checklist-item');
                if (item) {
                    e.preventDefault();
                    // Move cursor to before the item before removing it
                    const prevSibling = item.previousElementSibling;
                    item.remove();

                    // If there was a trailing <br> (empty div) from addChecklist, remove it too if next
                    // But for simplicity, we just focus back on the editor
                    EL.diaryContent.focus();
                }
            }
        }
    });

    // ========== FINANCIAL GOALS ==========
    const GOAL_TYPE_LABELS = {
        'savings': '💰 Tiết kiệm',
        'income': '📈 Thu nhập',
        'expense_limit': '📉 Giới hạn chi tiêu',
        'custom': '✨ Cá nhân'
    };

    // Populate year selector
    function initGoalYearSelector() {
        if (!EL.goalYearSelector) return;
        const currentYear = new Date().getFullYear();
        EL.goalYearSelector.innerHTML = '';
        for (let y = currentYear + 1; y >= currentYear - 2; y--) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = `Năm ${y}`;
            if (y === currentYear) opt.selected = true;
            EL.goalYearSelector.appendChild(opt);
        }
        EL.goalYearSelector.addEventListener('change', () => {
            fetchGoals(parseInt(EL.goalYearSelector.value));
        });
    }

    async function fetchGoals(year) {
        if (!EL.goalsTrack) return;
        try {
            const response = await fetch(`/api/goals?year=${year}`);
            const goals = await response.json();
            renderGoals(goals);
        } catch (e) {
            console.error('Error fetching goals:', e);
        }
    }

    function formatGoalAmount(val) {
        if (val == null || val === '') return '—';
        const num = Number(val);
        if (isNaN(num)) return val;
        if (num >= 1000000) return `${(num / 1000000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}tr`;
        if (num >= 1000) return `${(num / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 0 })}k`;
        return num.toLocaleString('vi-VN');
    }

    function renderGoals(goals) {
        if (!EL.goalsTrack) return;

        if (!goals || goals.length === 0) {
            EL.goalsTrack.innerHTML = '';
            EL.goalsTrack.appendChild(EL.goalsEmpty);
            EL.goalsEmpty.style.display = 'flex';

            // Reset summary
            if (EL.goalsSummary.completed) EL.goalsSummary.completed.textContent = '0/0';
            if (EL.goalsSummary.progress) EL.goalsSummary.progress.style.width = '0%';
            if (EL.goalsSummary.percent) EL.goalsSummary.percent.textContent = '0%';
            return;
        }

        EL.goalsEmpty.style.display = 'none';
        EL.goalsTrack.innerHTML = '';

        let completedCount = 0;
        let totalProgressPct = 0;

        goals.forEach(goal => {
            const card = document.createElement('div');
            const color = goal.color || '#6366f1';
            const icon = goal.icon || '🎯';

            card.className = `goal-card ${goal.is_completed ? 'completed' : ''}`;
            card.style.setProperty('--goal-color', color);

            const progress = goal.target_amount > 0
                ? Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100))
                : (goal.is_completed ? 100 : 0);

            if (goal.is_completed) completedCount++;
            totalProgressPct += progress;

            card.innerHTML = `
                <div class="goal-header">
                    <div class="goal-icon" style="background: ${color}20; color: ${color};">${icon}</div>
                    <div class="goal-info">
                        <div class="goal-title">${goal.title}</div>
                        <div class="goal-type-badge">${getGoalTypeText(goal.goal_type)}</div>
                    </div>
                </div>
                <div class="goal-progress-section">
                    <div class="goal-progress-text">
                        <span>${formatGoalAmount(goal.current_amount)} / ${formatGoalAmount(goal.target_amount)}</span>
                        <span>${progress}%</span>
                    </div>
                    <div class="goal-progress-mini">
                        <div class="goal-progress-fill" style="width: ${progress}%; background: ${color};"></div>
                    </div>
                </div>
                <div class="goal-status">
                    ${goal.is_completed ? '<span>✅ Hoàn thành</span>' : '<span>⏳ Đang thực hiện</span>'}
                    <div class="goal-toggle-check ${goal.is_completed ? 'checked' : ''}" title="${goal.is_completed ? 'Bỏ đánh dấu' : 'Đánh dấu hoàn thành'}">
                        <i class="fas fa-check"></i>
                    </div>
                </div>

                <!-- Journal Popover -->
                <div class="goal-journal-popover" style="--goal-color: ${color}">
                    <div class="journal-popover-header">
                        <i class="fas fa-journal-whills"></i>
                        <span>Nhật ký tiến độ</span>
                    </div>
                    <div class="journal-popover-content">
                        ${goal.notes ? goal.notes.replace(/\n/g, '<br>') : '<span class="journal-empty-note">Chưa có ghi chú nào cho mục tiêu này.</span>'}
                    </div>
                </div>
            `;

            // Card click for edit (except toggle)
            card.addEventListener('click', (e) => {
                if (e.target.closest('.goal-toggle-check')) return;
                openGoalModal(goal);
            });

            // Toggle click logic
            const toggle = card.querySelector('.goal-toggle-check');
            if (toggle) {
                toggle.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    try {
                        const res = await fetch(`/api/goals/${goal.id}/toggle`, { method: 'PATCH' });
                        const data = await res.json();
                        if (data.success) {
                            const year = EL.goalYearSelector ? parseInt(EL.goalYearSelector.value) : new Date().getFullYear();
                            fetchGoals(year);
                        }
                    } catch (err) {
                        console.error('Toggle error:', err);
                    }
                });
            }

            EL.goalsTrack.appendChild(card);
        });

        // Update Yearly Summary
        const avgProgress = goals.length > 0 ? Math.round(totalProgressPct / goals.length) : 0;
        if (EL.goalsSummary.completed) EL.goalsSummary.completed.textContent = `${completedCount}/${goals.length}`;
        if (EL.goalsSummary.progress) EL.goalsSummary.progress.style.width = `${avgProgress}%`;
        if (EL.goalsSummary.percent) EL.goalsSummary.percent.textContent = `${avgProgress}%`;
    }

    function getGoalTypeText(type) {
        const types = {
            'savings': 'Tiết kiệm',
            'income': 'Thu nhập',
            'expense_limit': 'Giới hạn chi',
            'custom': 'Cá nhân'
        };
        return types[type] || 'Khác';
    }

    function openGoalModal(goalData) {
        if (!EL.goalModal) return;
        const isEdit = goalData && goalData.id;

        EL.goalModalTitle.textContent = isEdit ? 'Chỉnh Sửa Mục Tiêu' : 'Thêm Mục Tiêu Mới';
        EL.goalId.value = isEdit ? goalData.id : '';
        EL.goalTitle.value = isEdit ? goalData.title : '';
        EL.goalType.value = isEdit ? goalData.goal_type : 'savings';
        EL.goalTarget.value = isEdit ? goalData.target_amount : '';
        EL.goalCurrent.value = isEdit ? goalData.current_amount : '';
        EL.goalNotes.value = isEdit ? (goalData.notes || '') : '';

        // Trigger UI update logic for labels/placeholders
        EL.goalType.dispatchEvent(new Event('change'));

        // Show/hide delete button
        EL.deleteGoalBtn.style.display = isEdit ? 'block' : 'none';

        // Set icon picker
        const activeIcon = isEdit ? (goalData.icon || '🎯') : '🎯';
        EL.goalIconPicker.querySelectorAll('.icon-opt').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.icon === activeIcon);
        });

        // Set color picker
        const activeColor = isEdit ? (goalData.color || '#6366f1') : '#6366f1';
        EL.goalColorPicker.querySelectorAll('.color-opt').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.color === activeColor);
        });

        EL.goalModal.style.display = 'flex';
    }

    function closeGoalModal() {
        if (EL.goalModal) EL.goalModal.style.display = 'none';
    }
    // Expose globally for onclick
    window.closeGoalModal = closeGoalModal;

    async function saveGoal(e) {
        e.preventDefault();
        const id = EL.goalId.value;
        const title = EL.goalTitle.value.trim();
        const goalType = EL.goalType.value;
        const targetRaw = EL.goalTarget.value.trim();
        const currentRaw = EL.goalCurrent.value.trim();
        const year = EL.goalYearSelector ? parseInt(EL.goalYearSelector.value) : new Date().getFullYear();

        // Parse target: support "100tr" "50m" "24"
        let targetAmount = null;
        if (targetRaw) {
            const normalized = targetRaw.replace(WHITESPACE_REGEX, '').replace(DOT_REGEX, '').replace(COMMA_REGEX, '.');
            if (normalized.match(/tr|triệu/i)) {
                targetAmount = parseFloat(normalized) * 1000000;
            } else if (normalized.match(/m$/i)) {
                targetAmount = parseFloat(normalized) * 1000000;
            } else if (normalized.match(/k$/i)) {
                targetAmount = parseFloat(normalized) * 1000;
            } else {
                targetAmount = parseFloat(normalized);
            }
            if (isNaN(targetAmount)) targetAmount = null;
        } else if (goalType === 'custom') {
            // Default to 100 for custom goals if not specified
            targetAmount = 100;
        }

        let currentAmount = 0;
        if (currentRaw) {
            const normalizedC = currentRaw.replace(WHITESPACE_REGEX, '').replace(DOT_REGEX, '').replace(COMMA_REGEX, '.');
            if (normalizedC.match(/tr|triệu/i)) {
                currentAmount = parseFloat(normalizedC) * 1000000;
            } else if (normalizedC.match(/m$/i)) {
                currentAmount = parseFloat(normalizedC) * 1000000;
            } else if (normalizedC.match(/k$/i)) {
                currentAmount = parseFloat(normalizedC) * 1000;
            } else {
                currentAmount = parseFloat(normalizedC);
            }
            if (isNaN(currentAmount)) currentAmount = 0;
        }

        const selectedIcon = EL.goalIconPicker.querySelector('.icon-opt.selected')?.dataset.icon || '🎯';
        const selectedColor = EL.goalColorPicker.querySelector('.color-opt.selected')?.dataset.color || '#6366f1';
        const notes = EL.goalNotes.value.trim();

        const body = {
            title,
            goal_type: goalType,
            target_amount: targetAmount,
            current_amount: currentAmount,
            year,
            icon: selectedIcon,
            color: selectedColor,
            notes: notes
        };

        try {
            let response;
            if (id) {
                response = await fetch(`/api/goals/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
            } else {
                response = await fetch('/api/goals', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
            }
            const result = await response.json();
            if (result.success) {
                closeGoalModal();
                fetchGoals(year);
                showToast(id ? 'Đã cập nhật mục tiêu!' : 'Đã thêm mục tiêu mới!', 'success');
            } else {
                showToast(result.error || 'Lỗi khi lưu mục tiêu', 'error');
            }
        } catch (err) {
            console.error('Save goal error:', err);
            showToast('Lỗi kết nối', 'error');
        }
    }

    async function deleteGoalFromModal() {
        const id = EL.goalId.value;
        if (!id) return;
        if (!confirm('Bạn có chắc muốn xóa mục tiêu này?')) return;

        try {
            const response = await fetch(`/api/goals/${id}`, { method: 'DELETE' });
            const result = await response.json();
            if (result.success) {
                closeGoalModal();
                const year = EL.goalYearSelector ? parseInt(EL.goalYearSelector.value) : new Date().getFullYear();
                fetchGoals(year);
                showToast('Đã xóa mục tiêu', 'success');
            } else {
                showToast(result.error || 'Lỗi khi xóa', 'error');
            }
        } catch (err) {
            console.error('Delete goal error:', err);
            showToast('Lỗi kết nối', 'error');
        }
    }
    // Expose globally for onclick
    window.deleteGoalFromModal = deleteGoalFromModal;

    // Icon picker interaction
    if (EL.goalIconPicker) {
        EL.goalIconPicker.addEventListener('click', (e) => {
            const btn = e.target.closest('.icon-opt');
            if (!btn) return;
            EL.goalIconPicker.querySelectorAll('.icon-opt').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
    }

    // Color picker interaction
    if (EL.goalColorPicker) {
        EL.goalColorPicker.addEventListener('click', (e) => {
            const btn = e.target.closest('.color-opt');
            if (!btn) return;
            EL.goalColorPicker.querySelectorAll('.color-opt').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
    }

    // Goal form submit
    if (EL.goalForm) {
        EL.goalForm.addEventListener('submit', saveGoal);
    }

    // Goal type change to update UI
    if (EL.goalType) {
        EL.goalType.addEventListener('change', () => {
            const val = EL.goalType.value;
            const isAuto = ['savings', 'income', 'expense_limit'].includes(val);
            const isCustom = (val === 'custom');

            EL.goalCurrent.disabled = isAuto;

            // Labels
            const targetLabel = EL.goalTarget.parentElement.querySelector('label');
            const currentLabel = EL.goalCurrent.parentElement.querySelector('label');

            if (isAuto) {
                EL.goalCurrent.placeholder = "Tự động tính toán từ giao dịch...";
                if (currentLabel) currentLabel.innerHTML = 'Số tiền hiện tại <span style="font-size: 0.75rem; color: var(--primary); font-weight: 700;">(TỰ ĐỘNG)</span>';
                if (targetLabel) targetLabel.textContent = 'Mục tiêu (số tiền)';
                EL.goalTarget.placeholder = "VD: 100tr";
            } else if (isCustom) {
                EL.goalCurrent.placeholder = "VD: 50 (%)";
                if (currentLabel) currentLabel.textContent = 'Tiến độ hiện tại (%)';
                if (targetLabel) targetLabel.textContent = 'Mục tiêu (%)';
                EL.goalTarget.placeholder = "Mặc định: 100 (%)";
            } else {
                EL.goalCurrent.placeholder = "0";
                if (currentLabel) currentLabel.textContent = 'Số tiền hiện tại';
                if (targetLabel) targetLabel.textContent = 'Mục tiêu (số tiền)';
                EL.goalTarget.placeholder = "VD: 100tr";
            }
        });
    }

    // Nav Scroll
    if (EL.goalPrevBtn && EL.goalsTrack) {
        EL.goalPrevBtn.addEventListener('click', () => {
            EL.goalsTrack.scrollBy({ left: -300, behavior: 'smooth' });
        });
    }
    if (EL.goalNextBtn && EL.goalsTrack) {
        EL.goalNextBtn.addEventListener('click', () => {
            EL.goalsTrack.scrollBy({ left: 300, behavior: 'smooth' });
        });
    }

    // Nav Scroll
    if (EL.goalPrevBtn && EL.goalsTrack) {
        EL.goalPrevBtn.addEventListener('click', () => {
            EL.goalsTrack.scrollBy({ left: -300, behavior: 'smooth' });
        });
    }
    if (EL.goalNextBtn && EL.goalsTrack) {
        EL.goalNextBtn.addEventListener('click', () => {
            EL.goalsTrack.scrollBy({ left: 300, behavior: 'smooth' });
        });
    }

    // Add Goal button
    if (EL.addGoalBtn) {
        EL.addGoalBtn.addEventListener('click', () => openGoalModal(null));
    }

    // Close modal on outside click
    if (EL.goalModal) {
        EL.goalModal.addEventListener('click', (e) => {
            if (e.target === EL.goalModal) closeGoalModal();
        });
    }

    // Init goals on page load
    initGoalYearSelector();
    fetchGoals(new Date().getFullYear());

});
