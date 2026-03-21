/**
 * Програма тренувань - JavaScript функціонал
 * Включає: навігація табами, відмітка виконання, таймери, збереження прогресу
 */

// ============================================
// ІНІЦІАЛІЗАЦІЯ ТА НАВІГАЦІЯ ТАБАМИ
// ============================================

/**
 * Перемикає активний таб
 * @param {string} tabName - ID табу для відкриття (month1, month2, month3)
 */
function openTab(tabName) {
    // Приховати всі таби
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(tab => {
        tab.classList.remove('active');
        tab.style.opacity = '0';
        tab.style.transform = 'translateY(20px)';
    });

    // Деактивувати всі кнопки табів
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.classList.remove('active');
    });

    // Активувати вибраний таб з анімацією
    const activeTab = document.getElementById(tabName);
    if (activeTab) {
        activeTab.classList.add('active');
        // Невелика затримка для плавної анімації
        setTimeout(() => {
            activeTab.style.opacity = '1';
            activeTab.style.transform = 'translateY(0)';
        }, 50);
    }

    // Активувати кнопку
    const activeButton = document.querySelector(`button[onclick="openTab('${tabName}')"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    }

    // Зберегти поточний таб у localStorage
    localStorage.setItem('currentTab', tabName);
    
    // Прокрутити до верху сторінки
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================
// ВІДМІТКА ВИКОНАНИХ ТРЕНУВАНЬ
// ============================================

/**
 * Ініціалізує функціонал відмітки виконаних днів
 */
function initCompletionTracking() {
    const rows = document.querySelectorAll('.training-table tbody tr');
    
    rows.forEach((row, index) => {
        // Створити чекбокс для відмітки
        const dayCell = row.querySelector('.day-number');
        if (dayCell) {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'dayday-checkbox';
            checkbox.dataset.dayId = `day-${index}`;
            
            // Перевірити, чи день вже відмічений
            const isCompleted = localStorage.getItem(`day-${index}`) === 'true';
            checkbox.checked = isCompleted;
            
            if (isCompleted) {
                row.classList.add('completed');
            }
            
            // Обробник зміни
            checkbox.addEventListener('change', function() {
                if (this.checked) {
                    row.classList.add('completed');
                    localStorage.setItem(`day-${index}`, 'true');
                    showNotification('✅ Тренування відмічено як виконане!');
                } else {
                    row.classList.remove('completed');
                    localStorage.removeItem(`day-${index}`);
                }
                updateProgressStats();
            });
            
            // Додати чекбокс перед номером дня
            dayCell.insertBefore(checkbox, dayCell.firstChild);
        }
    });
}

// ============================================
// СТАТИСТИКА ПРОГРЕСУ
// ============================================

/**
 * Оновлює статистику прогресу програми
 */
function updateProgressStats() {
    const totalDays = document.querySelectorAll('.training-table tbody tr').length;
    const completedDays = document.querySelectorAll('.training-table tbody tr.completed').length;
    const percentage = Math.round((completedDays / totalDays) * 100);
    
    // Створити або оновити панель статистики
    let statsPanel = document.getElementById('progress-stats');
    
    if (!statsPanel) {
        statsPanel = document.createElement('div');
        statsPanel.id = 'progress-stats';
        statsPanel.className = 'progress-panel';
        document.querySelector('header').appendChild(statsPanel);
        
        // Додати стилі для панелі
        addStatsStyles();
    }
    
    statsPanel.innerHTML = `
        <div class="progress-bar-container">
            <div class="progress-bar" style="width: ${percentage}%"></div>
            <span class="progress-text">${completedDays}/${totalDays} днів (${percentage}%)</span>
        </div>
    `;
    
    // Зберегти статистику
    localStorage.setItem('progressPercentage', percentage);
}

/**
 * Додає стилі для панелі статистики
 */
function addStatsStyles() {
    const styles = document.createElement('style');
    styles.textContent = `
        .progress-panel {
            margin-top: 20px;
            padding: 0 20px;
        }
        
        .progress-bar-container {
            background: rgba(255,255,255,0.2);
            border-radius: 20px;
            height: 30px;
            position: relative;
            overflow: hidden;
            backdrop-filter: blur(10px);
        }
        
        .progress-bar {
            background: linear-gradient(90deg, #e94560 0%, #ff6b6b 100%);
            height: 100%;
            border-radius: 20px;
            transition: width 0.5s ease;
            box-shadow: 0 2px 10px rgba(233, 69, 96, 0.4);
        }
        
        .progress-text {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: white;
            font-weight: 700;
            font-size: 0.9rem;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.3);
        }
        
        .day-checkbox {
            margin-right: 8px;
            width: 20px;
            height: 20px;
            cursor: pointer;
            accent-color: #e94560;
        }
        
        .training-table tr.completed {
            opacity: 0.7;
            background-color: #f0fff4 !important;
        }
        
        .training-table tr.completed td {
            text-decoration: line-through;
            color: #718096;
        }
        
        .training-table tr.completed .day-number {
            background: linear-gradient(135deg, #48bb78 0%, #38a169 100%) !important;
        }
    `;
    document.head.appendChild(styles);
}

// ============================================
// ТАЙМЕРИ ДЛЯ ВПРАВ
// ============================================

/**
 * Ініціалізує таймери для вправ з часом (наприклад, L-Sit, Planche)
 */
function initTimers() {
    // Знайти всі клітинки з текстом "сек" (секунди)
    const cells = document.querySelectorAll('.training-table td:last-child');
    
    cells.forEach(cell => {
        const text = cell.textContent;
        // Шукаємо вправи з часом у секундах
        if (text.includes('сек') || text.includes('хв')) {
            const timerBtn = document.createElement('button');
            timerBtn.className = 'timer-btn';
            timerBtn.innerHTML = '⏱️ Таймер';
            timerBtn.onclick = function() {
                openTimerModal(extractTimeFromText(text));
            };
            
            // Додати кнопку після списку
            const list = cell.querySelector('ul, ol');
            if (list) {
                const btnContainer = document.createElement('div');
                btnContainer.className = 'timer-container';
                btnContainer.appendChild(timerBtn);
                cell.appendChild(btnContainer);
            }
        }
    });
}

/**
 * Витягує час з тексту вправи
 * @param {string} text - Текст вправи
 * @returns {number} - Час у секундах
 */
function extractTimeFromText(text) {
    // Шукаємо патерни типу "30 сек", "5 хв", "10-15 сек"
    const secMatch = text.match(/(\d+)[\s-]*(\d*)\s*сек/);
    const minMatch = text.match(/(\d+)\s*хв/);
    
    if (secMatch) {
        const min = parseInt(secMatch[1]) || 0;
        const max = parseInt(secMatch[2]) || min;
        return Math.floor((min + max) / 2); // Середнє значення
    }
    
    if (minMatch) {
        return parseInt(minMatch[1]) * 60;
    }
    
    return 30; // За замовчуванням 30 секунд
}

/**
 * Відкриває модальне вікно таймера
 * @param {number} seconds - Час у секундах
 */
function openTimerModal(seconds) {
    // Видалити існуюче модальне вікно, якщо є
    const existingModal = document.getElementById('timer-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    const modal = document.createElement('div');
    modal.id = 'timer-modal';
    modal.className = 'timer-modal';
    modal.innerHTML = `
        <div class="timer-content">
            <h3>⏱️ Таймер вправи</h3>
            <div class="timer-display" id="timer-display">${formatTime(seconds)}</div>
            <div class="timer-controls">
                <button class="timer-start" onclick="startTimer(${seconds})">▶️ Старт</button>
                <button class="timer-pause" onclick="pauseTimer()" style="display:none">⏸️ Пауза</button>
                <button class="timer-reset" onclick="resetTimer(${seconds})">🔄 Скидання</button>
                <button class="timer-close" onclick="closeTimer()">❌ Закрити</button>
            </div>
            <div class="timer-progress">
                <div class="timer-bar" id="timer-bar"></div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Додати стилі для модального вікна
    addTimerStyles();
    
    // Анімація появи
    setTimeout(() => modal.classList.add('active'), 10);
}

let timerInterval = null;
let currentTime = 0;
let totalTime = 0;

function startTimer(seconds) {
    if (timerInterval) return;
    
    currentTime = currentTime || seconds;
    totalTime = totalTime || seconds;
    
    document.querySelector('.timer-start').style.display = 'none';
    document.querySelector('.timer-pause').style.display = 'inline-block';
    
    timerInterval = setInterval(() => {
        currentTime--;
        updateTimerDisplay();
        
        if (currentTime <= 0) {
            pauseTimer();
            playNotificationSound();
            showNotification('✅ Час вийшов! Відпочинок завершено.');
        }
    }, 1000);
}

function pauseTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    document.querySelector('.timer-start').style.display = 'inline-block';
    document.querySelector('.timer-pause').style.display = 'none';
}

function resetTimer(seconds) {
    pauseTimer();
    currentTime = seconds;
    totalTime = seconds;
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const display = document.getElementById('timer-display');
    const bar = document.getElementById('timer-bar');
    
    if (display) {
        display.textContent = formatTime(currentTime);
    }
    
    if (bar && totalTime > 0) {
        const percentage = ((totalTime - currentTime) / totalTime) * 100;
        bar.style.width = `${percentage}%`;
    }
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function closeTimer() {
    const modal = document.getElementById('timer-modal');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 300);
    }
    pauseTimer();
}

function addTimerStyles() {
    if (document.getElementById('timer-styles')) return;
    
    const styles = document.createElement('style');
    styles.id = 'timer-styles';
    styles.textContent = `
        .timer-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            opacity: 0;
            transition: opacity 0.3s ease;
            backdrop-filter: blur(5px);
        }
        
        .timer-modal.active {
            opacity: 1;
        }
        
        .timer-content {
            background: white;
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 25px 50px rgba(0,0,0,0.3);
            text-align: center;
            min-width: 300px;
            transform: scale(0.9);
            transition: transform 0.3s ease;
        }
        
        .timer-modal.active .timer-content {
            transform: scale(1);
        }
        
        .timer-content h3 {
            color: #1a1a2e;
            margin-bottom: 20px;
            font-size: 1.5rem;
        }
        
        .timer-display {
            font-size: 4rem;
            font-weight: 700;
            color: #e94560;
            margin: 20px 0;
            font-family: 'Courier New', monospace;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.1);
        }
        
        .timer-controls {
            display: flex;
            gap: 10px;
            justify-content: center;
            flex-wrap: wrap;
            margin-top: 20px;
        }
        
        .timer-controls button {
            padding: 12px 24px;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s ease;
            font-size: 1rem;
        }
        
        .timer-start {
            background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
            color: white;
        }
        
        .timer-pause {
            background: linear-gradient(135deg, #ed8936 0%, #dd6b20 100%);
            color: white;
        }
        
        .timer-reset {
            background: #e2e8f0;
            color: #4a5568;
        }
        
        .timer-close {
            background: #fc8181;
            color: white;
        }
        
        .timer-controls button:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        }
        
        .timer-progress {
            width: 100%;
            height: 8px;
            background: #e2e8f0;
            border-radius: 4px;
            margin-top: 20px;
            overflow: hidden;
        }
        
        .timer-bar {
            height: 100%;
            background: linear-gradient(90deg, #e94560 0%, #ff6b6b 100%);
            width: 0%;
            transition: width 1s linear;
        }
        
        .timer-container {
            margin-top: 15px;
        }
        
        .timer-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 20px;
            cursor: pointer;
            font-size: 0.85rem;
            font-weight: 600;
            transition: all 0.3s ease;
        }
        
        .timer-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }
    `;
    document.head.appendChild(styles);
}

// ============================================
// НОТИФІКАЦІЇ ТА ЗВУКИ
// ============================================

/**
 * Показує спливаюче повідомлення
 * @param {string} message - Текст повідомлення
 */
function showNotification(message) {
    // Видалити існуючі повідомлення
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Додати стилі, якщо ще не додані
    if (!document.getElementById('notification-styles')) {
        const styles = document.createElement('style');
        styles.id = 'notification-styles';
        styles.textContent = `
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 16px 24px;
                border-radius: 12px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                z-index: 2000;
                font-weight: 600;
                animation: slideInRight 0.3s ease, fadeOut 0.3s ease 2.7s;
                max-width: 300px;
            }
            
            @keyframes slideInRight {
                from { transform: translateX(400px); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            
            @keyframes fadeOut {
                to { opacity: 0; transform: translateY(-20px); }
            }
        `;
        document.head.appendChild(styles);
    }
    
    // Автоматичне видалення
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

/**
 * Відтворює звук сповіщення (візуальна індикація як запасний варіант)
 */
function playNotificationSound() {
    // Створити візуальний ефект пульсації екрану
    const pulse = document.createElement('div');
    pulse.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(233, 69, 96, 0.2);
        z-index: 999;
        pointer-events: none;
        animation: screenPulse 0.5s ease;
    `;
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes screenPulse {
            0%, 100% { opacity: 0; }
            50% { opacity: 1; }
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(pulse);
    
    setTimeout(() => pulse.remove(), 500);
}

// ============================================
// ПОШУК ТА ФІЛЬТРАЦІЯ
// ============================================

/**
 * Ініціалізує функціонал пошуку вправ
 */
function initSearch() {
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';
    searchContainer.innerHTML = `
        <input type="text" id="exercise-search" placeholder="🔍 Пошук вправи (наприклад: підтягування, присідання)..." />
        <button onclick="clearSearch()" class="clear-search">✕</button>
    `;
    
    // Вставити після заголовка
    const header = document.querySelector('header');
    header.appendChild(searchContainer);
    
    // Додати стилі
    const styles = document.createElement('style');
    styles.textContent = `
        .search-container {
            max-width: 600px;
            margin: 20px auto 0;
            position: relative;
            z-index: 10;
        }
        
        #exercise-search {
            width: 100%;
            padding: 15px 50px 15px 20px;
            border: none;
            border-radius: 30px;
            font-size: 1rem;
            background: rgba(255,255,255,0.95);
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            transition: all 0.3s ease;
        }
        
        #exercise-search:focus {
            outline: none;
            box-shadow: 0 6px 20px rgba(0,0,0,0.15);
            transform: translateY(-2px);
        }
        
        .clear-search {
            position: absolute;
            right: 5px;
            top: 50%;
            transform: translateY(-50%);
            background: #e94560;
            color: white;
            border: none;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            cursor: pointer;
            display: none;
            font-size: 0.9rem;
        }
        
        .search-highlight {
            background: #fef3c7;
            padding: 2px 4px;
            border-radius: 4px;
            font-weight: 700;
        }
        
        .no-results {
            text-align: center;
            padding: 40px;
            color: #718096;
            font-size: 1.2rem;
        }
    `;
    document.head.appendChild(styles);
  // Обробник пошуку
const searchInput = document.getElementById('exercise-search');
if (searchInput) {
    searchInput.addEventListener('input', function() {
        const query = this.value.toLowerCase();
        const clearBtn = document.querySelector('.clear-search');
        if (clearBtn) {
            clearBtn.style.display = query ? 'block' : 'none';
        }
        
        filterExercises(query);
    });
}

/**
 * Фільтрує вправи за запитом
 * @param {string} query - Пошуковий запит
 */
function filterExercises(query) {
    const rows = document.querySelectorAll('.training-table tbody tr');
    let hasResults = false;
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        const exerciseCell = row.querySelector('td:last-child');
        
        if (text.includes(query)) {
            row.style.display = '';
            hasResults = true;
            
            // Підсвітити знайдений текст
            if (query && exerciseCell) {
                highlightText(exerciseCell, query);
            }
        } else {
            row.style.display = 'none';
        }
    });
    
    // Показати повідомлення, якщо немає результатів
    const existingNoResults = document.querySelector('.no-results');
    if (existingNoResults) {
        existingNoResults.remove();
    }
    
    if (!hasResults && query) {
        const noResults = document.createElement('div');
        noResults.className = 'no-results';
        noResults.textContent = '❌ Нічого не знайдено. Спробуйте інший запит.';
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab) {
            activeTab.appendChild(noResults);
        }
    }
}

/**
 * Підсвічує знайдений текст у комірці
 */
function highlightText(cell, query) {
    if (!cell || !query) return;
    
    // Зберегти оригінальний HTML, якщо ще не збережено
    if (!cell.dataset.originalHtml) {
        cell.dataset.originalHtml = cell.innerHTML;
    }
    
    const html = cell.dataset.originalHtml;
    const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
    cell.innerHTML = html.replace(regex, '<span class="search-highlight">$1</span>');
}

/**
 * Екранує спеціальні символи для RegExp
 */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Очищає пошук
 */
function clearSearch() {
    const searchInput = document.getElementById('exercise-search');
    if (searchInput) {
        searchInput.value = '';
    }
    
    const clearBtn = document.querySelector('.clear-search');
    if (clearBtn) {
        clearBtn.style.display = 'none';
    }
    
    // Показати всі рядки
    const rows = document.querySelectorAll('.training-table tbody tr');
    rows.forEach(row => {
        row.style.display = '';
        
        // Відновити оригінальний HTML
        const exerciseCell = row.querySelector('td:last-child');
        if (exerciseCell && exerciseCell.dataset.originalHtml) {
            exerciseCell.innerHTML = exerciseCell.dataset.originalHtml;
            delete exerciseCell.dataset.originalHtml;
        }
    });
    
    const noResults = document.querySelector('.no-results');
    if (noResults) {
        noResults.remove();
    }
}

// ============================================
// ЕКСПОРТ/ІМПОРТ ПРОГРЕСУ
// ============================================

/**
 * Експортує прогрес у JSON файл
 */
function exportProgress() {
    const progress = {
        completedDays: [],
        currentTab: localStorage.getItem('currentTab'),
        exportDate: new Date().toLocaleString('uk-UA')
    };
    
    // Зібрати всі відмічені дні
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('day-') && localStorage.getItem(key) === 'true') {
            progress.completedDays.push(key);
        }
    }
    
    const dataStr = JSON.stringify(progress, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `training-progress-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showNotification('💾 Прогрес експортовано!');
}

/**
 * Додає кнопки експорту/імпорту
 */
function addExportButtons() {
    const footer = document.querySelector('footer');
    if (!footer) return;
    
    const btnContainer = document.createElement('div');
    btnContainer.className = 'export-buttons';
    btnContainer.innerHTML = `
        <button onclick="exportProgress()" class="export-btn">💾 Експорт прогресу</button>
        <label class="import-btn">
            📁 Імпорт прогресу
            <input type="file" id="import-file" accept=".json" style="display:none" onchange="importProgress(this)">
        </label>
    `;
    
    footer.insertBefore(btnContainer, footer.firstChild);
    
    // Додати стилі, якщо ще не додані
    if (!document.getElementById('export-styles')) {
        const styles = document.createElement('style');
        styles.id = 'export-styles';
        styles.textContent = `
            .export-buttons {
                margin-bottom: 20px;
                display: flex;
                gap: 15px;
                justify-content: center;
                flex-wrap: wrap;
            }
            
            .export-btn, .import-btn {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 25px;
                cursor: pointer;
                font-weight: 600;
                transition: all 0.3s ease;
                display: inline-flex;
                align-items: center;
                gap: 8px;
                font-size: 0.95rem;
            }
            
            .export-btn:hover, .import-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
            }
            
            .import-btn input[type="file"] {
                display: none;
            }
        `;
        document.head.appendChild(styles);
    }
}

/**
 * Імпортує прогрес з JSON файлу
 */
function importProgress(input) {
    const file = input.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const progress = JSON.parse(e.target.result);
            
            // Очистити поточний прогрес
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('day-')) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => localStorage.removeItem(key));
            
            // Імпортувати новий прогрес
            if (progress.completedDays && Array.isArray(progress.completedDays)) {
                progress.completedDays.forEach(day => {
                    if (day) localStorage.setItem(day, 'true');
                });
            }
            
            if (progress.currentTab) {
                localStorage.setItem('currentTab', progress.currentTab);
            }
            
            showNotification('📁 Прогрес імпортовано! Оновлення...');
            setTimeout(() => location.reload(), 1500);
            
        } catch (err) {
            console.error('Import error:', err);
            showNotification('❌ Помилка імпорту файлу');
        }
    };
    
    reader.onerror = function() {
        showNotification('❌ Не вдалося прочитати файл');
    };
    
    reader.readAsText(file);
    input.value = '';
}

// ============================================
// ГОРЯЧІ КЛАВІШІ ТА ДОПОМОГА
// ============================================

/**
 * Ініціалізує гарячі клавіші
 */
function initHotkeys() {
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + F для фокусу на пошук
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            const searchInput = document.getElementById('exercise-search');
            if (searchInput) {
                searchInput.focus();
            }
        }
        
        // Escape для закриття модальних вікон
        if (e.key === 'Escape') {
            closeTimer();
            const searchInput = document.getElementById('exercise-search');
            if (document.activeElement === searchInput) {
                searchInput.blur();
            }
        }
        
        // Стрілки для навігації між табами
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            const tabs = ['month1', 'month2', 'month3'];
            const currentTab = localStorage.getItem('currentTab') || 'month1';
            const currentIndex = tabs.indexOf(currentTab);
            
            if (e.key === 'ArrowLeft' && currentIndex > 0) {
                openTab(tabs[currentIndex - 1]);
            } else if (e.key === 'ArrowRight' && currentIndex < tabs.length - 1) {
                openTab(tabs[currentIndex + 1]);
            }
        }
    });
}

/**
 * Показує підказки при першому відвідуванні
 */
function showWelcomeTips() {
    if (localStorage.getItem('tipsShown')) return;
    
    const tips = [
        '💡 Використовуйте чекбокси для відмітки виконаних тренувань',
        '⏱️ Натисніть "Таймер" для вправ з часом',
        '🔍 Ctrl+F для швидкого пошуку вправ',
        '💾 Експортуйте прогрес, щоб не втратити дані',
        '⌨️ Використовуйте стрілки ← → для навігації між місяцями'
    ];
    
    setTimeout(() => {
        tips.forEach((tip, index) => {
            setTimeout(() => showNotification(tip), index * 3500);
        });
    }, 1000);
    
    localStorage.setItem('tipsShown', 'true');
}

// ============================================
// ІНІЦІАЛІЗАЦІЯ ПРИ ЗАВАНТАЖЕННІ
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // Відновити останній відкритий таб
    const savedTab = localStorage.getItem('currentTab') || 'month1';
    openTab(savedTab);
    
    // Ініціалізувати всі функції
    initCompletionTracking();
    initTimers();
    initSearch();
    addExportButtons();
    initHotkeys();
    updateProgressStats();
    
    // Показати підказки для нових користувачів
    showWelcomeTips();
    
    // Консольне привітання для розробників
    console.log('%c🏋️ Програма тренувань завантажена!', 'color: #e94560; font-size: 20px; font-weight: bold;');
    console.log('%cДоступні функції:', 'color: #667eea; font-size: 14px;');
    console.log('- Відмічайте виконані дні чекбоксами');
    console.log('- Використовуйте таймери для вправ');
    console.log('- Експортуйте/імпортуйте прогрес');
    console.log('- Шукайте вправи через пошук');
});
