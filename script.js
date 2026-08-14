// ============================================================
// window.App — ЕДИНЫЙ ОБЪЕКТ ПРИЛОЖЕНИЯ
// ============================================================
window.App = {};

// ============================================================
// 1. КОНФИГУРАЦИЯ
// ============================================================
App.Config = {
    APP_VERSION: '2.1.4',
    BUILD_DATE: '2026-07-28',
    BUILD_NUMBER: 27
};

// ============================================================
// 2. СОСТОЯНИЕ
// ============================================================
App.State = {
    regionsData: [],
    codeIndex: {},
    nameIndex: {},
    militaryData: {},
    regionTypes: {},
    dbVersion: '',
    dbDate: '',
    recognition: null,
    timerInterval: null,
    progress: 100,
    autoReturnDelay: 8,
    toastPosition: 'bottom',
    toastVertical: 100,
    toastWidth: 90,
    fontSizeScale: 100,
    isReady: false
};

// ============================================================
// 3. УТИЛИТЫ
// ============================================================
App.Utils = {
    $(id) { return document.getElementById(id); },

    escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } [m] || m));
    },

    transliterate(text) {
        const map = window.AppDict?.TRANSLIT_MAP || {};
        return text.toLowerCase().split('').map(ch => map[ch] || ch).join('');
    },

    formatTimeZone(utcOffset) {
        if (!utcOffset) return '—';
        const m = utcOffset.match(/([+-])(\d{2}):(\d{2})/);
        if (!m) return utcOffset;
        const sign = m[1],
            hours = parseInt(m[2]),
            minutes = parseInt(m[3]);
        let total = (hours * 60 + minutes) * (sign === '-' ? -1 : 1) - 180;
        if (total === 0) return 'МСК';
        const signDisplay = total > 0 ? '+' : '-';
        return `МСК${signDisplay}${Math.abs(total) / 60}`;
    },

    textToNumber(text) {
        const map = window.AppDict?.NUMBERS_MAP || {};
        const skipWords = window.AppDict?.SKIP_WORDS || [];
        const words = text.toLowerCase().split(/\s+/);
        let result = '',
            currentNumber = 0,
            hasNumber = false;

        for (const word of words) {
            if (map[word]) {
                const num = parseInt(map[word]);
                if (!isNaN(num)) {
                    if (num >= 100) currentNumber = num;
                    else if (num >= 10 && num < 100) {
                        if (currentNumber >= 10 && currentNumber % 10 === 0) currentNumber += num % 10;
                        else currentNumber = num;
                    } else if (num < 10) {
                        if (currentNumber >= 10 && currentNumber < 100) currentNumber += num;
                        else currentNumber = num;
                    }
                    hasNumber = true;
                }
            } else if (/^\d+$/.test(word)) {
                result += word;
                hasNumber = true;
            } else {
                if (hasNumber && currentNumber > 0) {
                    result += currentNumber.toString();
                    currentNumber = 0;
                }
                hasNumber = false;
                if (!skipWords.includes(word.toLowerCase())) {
                    if (result.length > 0 && !result.endsWith(' ')) result += ' ';
                    result += word;
                }
            }
        }

        if (hasNumber && currentNumber > 0) {
            if (result.length > 0 && !result.endsWith(' ')) result += ' ';
            result += currentNumber.toString();
        }

        if (/^\d+$/.test(result)) return result;

        let processed = text;
        for (const [word, num] of Object.entries(map)) {
            processed = processed.replace(new RegExp('\\b' + word + '\\b', 'gi'), num);
        }
        return processed.replace(/\s+/g, ' ').trim();
    },

    removeMarkers(text) {
        const markers = window.AppDict?.MARKERS || [];
        let result = ' ' + text + ' ';
        markers.forEach(word => {
            result = result.replace(new RegExp('\\s*' + word + '\\s*', 'gi'), ' ');
        });
        return result.trim();
    },

    extractWords(text) {
        const normalized = text.toLowerCase().replace(/[()—]/g, ' ').replace(/-/g, ' ');
        return normalized.split(/\s+/).filter(w => w.length >= 2);
    },

    expandSynonyms(text) {
        const synonyms = window.AppDict?.SYNONYMS || {};
        let result = text.toLowerCase().trim();
        for (const [synonym, target] of Object.entries(synonyms)) {
            if (result === synonym || result.includes(' ' + synonym + ' ') || result.startsWith(synonym + ' ')) {
                result = result.replace(synonym, target);
            }
        }
        return result;
    }
};

// ============================================================
// 4. ДАННЫЕ
// ============================================================
App.Data = {
    load(forceReload = false) {
        return new Promise((resolve) => {
            const container = document.getElementById('resultsContainer');
            const loadingIndicator = document.createElement('div');
            loadingIndicator.id = 'loadingProgress';
            loadingIndicator.style.cssText = 'margin:20px 0;padding:16px;text-align:center;color:var(--text-secondary);font-size:1rem;';
            loadingIndicator.innerHTML = '📥 Загрузка справочника...';
            if (container) container.appendChild(loadingIndicator);

            try {
                if (forceReload) {
                    localStorage.removeItem('regionsDB');
                    loadingIndicator.innerHTML = '🔄 Принудительная перезагрузка данных...';
                }

                const cached = localStorage.getItem('regionsDB');
                if (cached && !forceReload) {
                    const db = JSON.parse(cached);
                    if (db.regions && db.regions.length > 0 && db.regions[0].codes) {
                        App.State.regionsData = db.regions;
                        App.State.regionTypes = {};
                        if (db.regionTypes) {
                            db.regionTypes.forEach(t => { App.State.regionTypes[t.id] = { name: t.name }; });
                        }
                        App.State.militaryData = db.military || {};
                        App.Data.buildCodeIndex(App.State.regionsData);
                        App.Data.buildNameIndex(App.State.regionsData);
                        App.State.dbVersion = db.version || '';
                        App.State.dbDate = db.updated || '';
                        loadingIndicator.innerHTML = '✅ Данные загружены из кеша';
                        setTimeout(() => loadingIndicator.remove(), 500);
                        App.State.isReady = true;
                        resolve();
                        return;
                    } else {
                        localStorage.removeItem('regionsDB');
                        App.Data.load(true).then(resolve);
                        return;
                    }
                }

                fetch('regions.json?t=' + Date.now())
                    .then(r => { if (!r.ok) throw new Error('Не удалось загрузить regions.json'); return r.json(); })
                    .then(db => {
                        App.State.regionsData = db.regions || [];
                        App.State.regionTypes = {};
                        if (db.regionTypes) {
                            db.regionTypes.forEach(t => { App.State.regionTypes[t.id] = { name: t.name }; });
                        }
                        App.State.militaryData = db.military || {};
                        App.Data.buildCodeIndex(App.State.regionsData);
                        App.Data.buildNameIndex(App.State.regionsData);
                        App.State.dbVersion = db.version || '';
                        App.State.dbDate = db.updated || '';
                        localStorage.setItem('regionsDB', JSON.stringify({
                            regions: App.State.regionsData,
                            regionTypes: db.regionTypes || [],
                            military: App.State.militaryData,
                            version: App.State.dbVersion,
                            updated: App.State.dbDate
                        }));
                        loadingIndicator.innerHTML = '✅ Данные загружены';
                        setTimeout(() => loadingIndicator.remove(), 500);
                        App.State.isReady = true;
                        resolve();
                    })
                    .catch(err => {
                        console.error('Ошибка загрузки данных:', err);
                        loadingIndicator.innerHTML = '⚠️ Не удалось загрузить справочник. Проверьте соединение.';
                        loadingIndicator.style.color = '#FFA69E';
                        App.State.isReady = true;
                        resolve();
                    });
            } catch (err) {
                console.error('Ошибка загрузки данных:', err);
                loadingIndicator.innerHTML = '⚠️ Не удалось загрузить справочник. Проверьте соединение.';
                loadingIndicator.style.color = '#FFA69E';
                App.State.isReady = true;
                resolve();
            }
        });
    },

    buildCodeIndex(regions) {
        const index = {};
        regions.forEach((region, idx) => {
            if (region.codes && region.codes.length) {
                region.codes.forEach(item => {
                    const key = item.code.toString();
                    if (!index[key]) index[key] = [];
                    if (!index[key].includes(idx)) index[key].push(idx);
                });
            }
        });
        App.State.codeIndex = index;
    },

    buildNameIndex(regions) {
        const index = {};
        regions.forEach((region, idx) => {
            const title = region.title.toLowerCase();
            const translit = App.Utils.transliterate(title);
            const combined = title + ' ' + translit;
            const words = combined.split(/[\s\-–—()]+/);
            words.forEach(word => {
                if (word.length >= 2) {
                    if (!index[word]) index[word] = [];
                    if (!index[word].includes(idx)) index[word].push(idx);
                }
            });
        });
        App.State.nameIndex = index;
    },

    getRegionType(typeId) {
        if (!App.State.regionTypes || !App.State.regionTypes[typeId]) return '';
        return App.State.regionTypes[typeId].name || '';
    },

    getDisplayCode(codes) {
        if (!codes || !codes.length) return '?';
        const active = codes.find(c => c.status === 'active');
        return active ? active.code : codes[0].code;
    },

    formatCodesWithStatus(codes) {
        if (!codes || !codes.length) return '—';
        const active = codes.filter(c => c.status === 'active').map(c => c.code);
        const planned = codes.filter(c => c.status === 'planned').map(c => c.code);
        const activeStr = active.map(c => typeof c === 'number' ? (c < 10 ? `0${c}` : `${c}`) : c).join(', ');
        const plannedStr = planned.map(c => typeof c === 'number' ? (c < 10 ? `0${c}` : `${c}`) : c).join(', ');
        if (planned.length === 0) return activeStr;
        return `${activeStr} (план: ${plannedStr})`;
    }
};

// ============================================================
// 5. ПОИСК
// ============================================================
App.Search = {
    byName(query) {
        const q = query.toLowerCase().trim();
        if (!q) return [];
        const expanded = App.Utils.expandSynonyms(q);
        let clean = App.Utils.removeMarkers(expanded);
        if (!clean) clean = expanded;
        const queryWords = App.Utils.extractWords(clean);
        if (queryWords.length === 0) return [];

        let candidates = new Set();
        let candidateScores = {};
        const nameIndex = App.State.nameIndex;

        queryWords.forEach(word => {
            if (nameIndex[word]) {
                nameIndex[word].forEach(id => {
                    candidates.add(id);
                    if (!candidateScores[id]) candidateScores[id] = 0;
                    candidateScores[id] += 2;
                });
            }
            for (const [indexWord, ids] of Object.entries(nameIndex)) {
                if (indexWord.includes(word) || word.includes(indexWord)) {
                    ids.forEach(id => {
                        candidates.add(id);
                        if (!candidateScores[id]) candidateScores[id] = 0;
                        candidateScores[id] += 0.5;
                    });
                }
            }
        });

        if (candidates.size === 0) return [];
        const found = [];
        const regions = App.State.regionsData;
        candidates.forEach(id => {
            const region = regions[id];
            if (!region) return;
            const titleWords = App.Utils.extractWords(region.title);
            let matchScore = 0;
            queryWords.forEach(word => {
                if (titleWords.some(tw => tw === word)) { matchScore += 2; return; }
                if (titleWords.some(tw => tw.includes(word) || word.includes(tw))) { matchScore += 1; }
            });
            if (matchScore > 0) {
                found.push({
                    region,
                    score: matchScore + (candidateScores[id] || 0),
                    titleLength: region.title.length,
                    startsWith: region.title.toLowerCase().startsWith(queryWords[0]) ? 1 : 0
                });
            }
        });

        found.sort((a, b) => {
            if (a.startsWith !== b.startsWith) return b.startsWith - a.startsWith;
            if (a.score !== b.score) return b.score - a.score;
            return a.titleLength - b.titleLength;
        });
        return found.map(item => item.region);
    },

    byCode(digits) {
        const codeVal = parseInt(digits, 10);
        if (isNaN(codeVal) || codeVal < 0 || codeVal > 999) return null;
        const codeStr = codeVal.toString();
        const regionIds = App.State.codeIndex[codeStr] || [];
        const civilEntries = regionIds.map(id => App.State.regionsData[id]).filter(r => r);
        const militaryEntry = App.State.militaryData[codeStr] || null;
        return { civil: civilEntries, military: militaryEntry, code: codeVal };
    },

    perform(query) {
        if (!App.State.isReady) {
            window.AppUI?.showToast('⏳ Данные загружаются...', 1500);
            return;
        }

        const raw = (query || '').trim();
        if (raw === '') { window.AppUI?.clearResults(); return; }

        const hasLetters = /[а-яёa-z]/i.test(raw);
        const digits = raw.replace(/\D/g, '');

        if (hasLetters) {
            const found = App.Search.byName(raw);
            if (found.length === 0) {
                const altQuery = App.Utils.removeMarkers(raw);
                if (altQuery && altQuery !== raw) {
                    const altFound = App.Search.byName(altQuery);
                    if (altFound.length > 0) {
                        window.AppUI?.renderResults(altFound);
                        window.AppUI?.showToast('✅ ' + altQuery, 1500);
                        return;
                    }
                }
                window.AppUI?.renderResults([]);
                window.AppUI?.showToast('❌ Не найдено: ' + raw, 2000);
                return;
            }
            window.AppUI?.renderResults(found);
            window.AppUI?.showToast('✅ ' + raw, 1500);
            return;
        }

        if (digits) {
            const result = App.Search.byCode(digits);
            if (!result) {
                window.AppUI?.showError('Код от 1 до 999');
                return;
            }
            const { civil, military, code } = result;
            if (civil.length === 0 && !military) {
                window.AppUI?.showError(`Нет данных для кода ${digits}`);
                return;
            }
            const displayCode = code < 10 ? `0${code}` : `${code}`;
            window.AppUI?.renderResults(civil);
            if (military) {
                const [milName, milDesc] = military;
                window.AppUI?.renderMilitary(milName, milDesc);
            }
            window.AppUI?.showToast('✅ Код: ' + code, 1500);
            return;
        }

        window.AppUI?.showError(`Не удалось распознать запрос "${raw}"`);
    }
};

// ============================================================
// 6. ТАЙМЕР АВТООЧИСТКИ
// ============================================================
App.Timer = {
    start() {
        App.Timer.stop();
        if (App.State.autoReturnDelay === 0) return;
        App.State.progress = 100;
        App.Timer.updateRing(100);
        const startTime = Date.now();
        const delayMs = App.State.autoReturnDelay * 1000;
        App.State.timerInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, 1 - elapsed / delayMs);
            App.State.progress = remaining * 100;
            App.Timer.updateRing(App.State.progress);
            if (App.State.progress <= 0) {
                App.Timer.stop();
                App.Timer.clearAndReturn();
            }
        }, 50);
    },

    stop() {
        clearInterval(App.State.timerInterval);
        App.State.timerInterval = null;
        const glow = document.getElementById('glowEl');
        if (glow) glow.classList.remove('active');
    },

    reset() {
        const clearContainer = document.getElementById('clearContainer');
        if (clearContainer?.classList.contains('visible') && App.State.autoReturnDelay > 0) {
            App.Timer.stop();
            App.Timer.start();
        }
    },

    updateRing(percent) {
        const ring = document.getElementById('ringProgress');
        const maskCircle = document.getElementById('maskCircle');
        const glow = document.getElementById('glowEl');
        if (!ring || !maskCircle) return;

        const clamped = Math.max(0, Math.min(100, percent));
        const C = 289.03;
        const offset = C * (clamped / 100);
        maskCircle.style.strokeDashoffset = offset;

        let color;
        if (clamped > 50) {
            const t = (clamped - 50) / 50;
            color = `rgb(${Math.round(0)}, ${Math.round(122 + t * 133)}, ${Math.round(255 - t * 55)})`;
        } else if (clamped > 20) {
            const t = (clamped - 20) / 30;
            color = `rgb(${Math.round(0 + t * 255)}, ${Math.round(255 - t * 55)}, ${Math.round(200 - t * 200)})`;
        } else {
            const t = clamped / 20;
            color = `rgb(${Math.round(255)}, ${Math.round(200 - t * 160)}, ${Math.round(0)})`;
        }
        ring.style.stroke = color;

        if (glow) {
            const angleDeg = 360 * (1 - clamped / 100);
            const angleRad = angleDeg * Math.PI / 180;
            const cx = 50 + 40 * Math.sin(angleRad);
            const cy = 50 - 40 * Math.cos(angleRad);
            glow.style.background = `radial-gradient(ellipse at ${cx}% ${cy}%, ${color}66 0%, transparent 60%)`;
            glow.classList.add('active');
        }
    },

    clearAndReturn() {
        App.Timer.stop();
        window.AppUI?.clearResults();
        const voiceContainer = document.getElementById('voiceContainer');
        const clearContainer = document.getElementById('clearContainer');
        if (voiceContainer) voiceContainer.classList.remove('hidden');
        if (clearContainer) {
            clearContainer.classList.remove('visible');
            clearContainer.style.display = 'none';
        }
        const ring = document.getElementById('ringProgress');
        const maskCircle = document.getElementById('maskCircle');
        if (ring) ring.style.stroke = '#007aff';
        if (maskCircle) maskCircle.style.strokeDashoffset = 0;
        const glow = document.getElementById('glowEl');
        if (glow) glow.classList.remove('active');
        App.Native.vibrate(50);
        window.AppUI?.showToast('🗑 Результаты очищены');
    }
};

// ============================================================
// 7. ГОЛОСОВОЙ ВВОД
// ============================================================
App.Voice = {
    init() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const voiceContainer = document.getElementById('voiceContainer');
        if (!SpeechRecognition) {
            if (voiceContainer) voiceContainer.classList.add('hidden');
            return;
        }
        App.State.recognition = new SpeechRecognition();
        App.State.recognition.lang = 'ru-RU';
        App.State.recognition.continuous = false;
        App.State.recognition.interimResults = true;
        App.State.recognition.maxAlternatives = 1;

        App.State.recognition.onstart = function() {
            const voiceBtn = document.getElementById('voiceBtn');
            if (voiceBtn) voiceBtn.classList.add('listening');
            window.AppUI?.showToast('🎤 Слушаю...', 3000);
        };

        App.State.recognition.onend = function() {
            const voiceBtn = document.getElementById('voiceBtn');
            if (voiceBtn) voiceBtn.classList.remove('listening');
        };

        App.State.recognition.onerror = function(event) {
            const voiceBtn = document.getElementById('voiceBtn');
            if (voiceBtn) voiceBtn.classList.remove('listening');
            const msg = event.error === 'not-allowed' ? 'Доступ к микрофону запрещён' : event.error;
            window.AppUI?.showToast('❌ ' + msg, 2500);
        };

        App.State.recognition.onresult = function(event) {
            let finalText = '',
                interimText = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) finalText += transcript;
                else interimText += transcript;
            }
            const text = finalText || interimText;
            if (!text) return;
            window.AppUI?.showToast('📝 ' + text, 2000);
            if (!finalText) return;

            const processedText = App.Utils.textToNumber(finalText);
            const lower = processedText.toLowerCase();

            if (lower.includes('помощь') || lower.includes('команды')) {
                App.Modal.openHelp();
                return;
            }
            if (lower.includes('настройки')) {
                App.Modal.openSettings();
                window.AppUI?.showToast('⚙️ Настройки', 1500);
                return;
            }

            let searchText = processedText.trim();
            searchText = searchText.replace(/^(регион|код|номер|найди|покажи|найти|показать)\s+/i, '');
            if (!searchText) searchText = processedText.trim();

            const cleanForSearch = App.Utils.removeMarkers(searchText);
            const finalQuery = cleanForSearch || searchText;

            if (/[а-яёa-z]/i.test(finalQuery)) {
                App.Search.perform(finalQuery);
                return;
            }

            const digits = searchText.replace(/\D/g, '');
            if (digits) { App.Search.perform(digits); return; }

            window.AppUI?.showToast('❌ Не удалось распознать запрос', 2000);
        };

        const voiceBtn = document.getElementById('voiceBtn');
        if (voiceBtn) {
            voiceBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (!App.State.recognition) return;
                try {
                    if (this.classList.contains('listening')) {
                        App.State.recognition.stop();
                    } else {
                        App.State.recognition.start();
                        const clearContainer = document.getElementById('clearContainer');
                        if (clearContainer?.classList.contains('visible')) App.Timer.reset();
                    }
                } catch (_) {}
            });
        }
    }
};

// ============================================================
// 8. МОДАЛЬНЫЕ ОКНА
// ============================================================
App.Modal = {
    openRegion(region, codeDisplay) {
        const rows = [];
        if (region.capital && region.capital !== '—') rows.push({ label: '🏛 Столица / центр', value: region.capital });
        if (region.phones && region.phones !== '—' && region.phones !== '') rows.push({ label: '📞 Телефонный код', value: region.phones });
        if (region.codes && region.codes.length) {
            rows.push({ label: '🚗 Автомобильные коды', value: App.Data.formatCodesWithStatus(region.codes) });
        }
        const typeName = App.Data.getRegionType(region.typeId);
        if (typeName) rows.push({ label: '🏛 Тип региона', value: typeName });
        if (region.okato && region.okato !== '—' && region.okato !== null) rows.push({ label: '📊 ОКАТО', value: region.okato });
        if (region.code_iso_31662 && region.code_iso_31662 !== '—' && region.code_iso_31662 !== null) {
            rows.push({ label: '🌐 ISO 3166-2', value: region.code_iso_31662 });
        }
        const timeZoneDisplay = App.Utils.formatTimeZone(region.utc_offset);
        rows.push({ label: '⏱ Часовой пояс', value: timeZoneDisplay });

        let html = `<div class="region-modal-title" id="regionModalTitle">${App.Utils.escapeHtml(region.title)}</div>`;
        rows.forEach(row => {
            html += `<div class="region-modal-row"><span class="label">${row.label}</span><span class="value">${App.Utils.escapeHtml(row.value)}</span></div>`;
        });

        const modalTitle = document.getElementById('modalTitle');
        const modalContent = document.getElementById('modalContent');
        const modalRegion = document.getElementById('infoModalRegion');
        if (modalTitle) modalTitle.textContent = '📋 Информация о регионе';
        if (modalContent) modalContent.innerHTML = html;
        if (modalRegion) modalRegion.classList.add('active');
        window.history.pushState({ modal: true }, '');

        setTimeout(() => {
            const titleEl = document.getElementById('regionModalTitle');
            if (titleEl && region.title.length > 20) {
                let fontSize = 1.8;
                if (region.title.length > 30) fontSize = 1.3;
                else if (region.title.length > 25) fontSize = 1.5;
                titleEl.style.fontSize = fontSize + 'rem';
                titleEl.style.lineHeight = '1.2';
                titleEl.style.wordBreak = 'break-word';
                titleEl.style.hyphens = 'auto';
            }
        }, 50);
    },

    closeRegion() {
        const modalRegion = document.getElementById('infoModalRegion');
        if (modalRegion) modalRegion.classList.remove('active');
        if (window.history.state?.modal) window.history.back();
    },

    openHelp() {
        const helpModal = document.getElementById('helpModal');
        const helpContent = document.getElementById('helpContent');
        if (!helpModal || !helpContent) return;

        const content = window.AppAbout?.help;
        if (!content) {
            helpContent.innerHTML = '<div class="error-message">Ошибка загрузки содержимого</div>';
            helpModal.classList.add('active');
            return;
        }

        let html = '';
        content.items.forEach(item => {
            html += `
                <div class="help-item">
                    <span class="help-icon">${item.icon}</span>
                    <div>
                        <strong>${item.title}</strong>
                        <span class="help-desc">${item.description}</span>
                    </div>
                </div>
            `;
        });

        helpContent.innerHTML = html;
        helpModal.classList.add('active');
        window.history.pushState({ help: true }, '');
    },

    closeHelp() {
        const helpModal = document.getElementById('helpModal');
        if (helpModal) helpModal.classList.remove('active');
        if (window.history.state?.help) window.history.back();
    },

    openAppInfo() {
        const modalApp = document.getElementById('infoModalApp');
        const modalAppContent = document.getElementById('modalAppContent');
        if (!modalApp || !modalAppContent) return;

        const content = window.AppAbout?.appInfo;
        if (!content) {
            modalAppContent.innerHTML = '<div class="error-message">Ошибка загрузки содержимого</div>';
            modalApp.classList.add('active');
            return;
        }

        let html = '';
        content.items.forEach(item => {
            let value = item.value;
            if (item.label === '🗄️ Версия базы данных') {
                value = App.State.dbVersion || '--';
            }
            html += `
                <div class="info-row">
                    <span class="info-label">${item.label}</span>
                    <span class="info-value">${value}</span>
                </div>
            `;
        });

        modalAppContent.innerHTML = html;
        modalApp.classList.add('active');
    },

    closeAppInfo() {
        const modalApp = document.getElementById('infoModalApp');
        if (modalApp) modalApp.classList.remove('active');
    },

    openSettings() {
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) settingsModal.classList.add('active');
        App.Settings.loadControls();
    },

    closeSettings() {
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) settingsModal.classList.remove('active');
    },

    bindOverlayClick(modalId, closeFn) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeFn();
        });
    }
};

// ============================================================
// 9. НАСТРОЙКИ
// ============================================================
App.Settings = {
    load() {
        App.State.autoReturnDelay = parseInt(localStorage.getItem('autoReturnDelay')) || 8;
        App.State.toastPosition = localStorage.getItem('toastPosition') || 'bottom';
        App.State.toastVertical = parseInt(localStorage.getItem('toastVertical')) || 100;
        App.State.toastWidth = parseInt(localStorage.getItem('toastWidth')) || 90;
        App.State.fontSizeScale = parseInt(localStorage.getItem('fontSizeScale')) || 100;

        const savedTheme = localStorage.getItem('appTheme') || 'auto';
        window.AppUI?.applyTheme(savedTheme);
        window.AppUI?.applyToastSettings(App.State.toastVertical, App.State.toastWidth, App.State.toastPosition);
        window.AppUI?.applyFontSize(App.State.fontSizeScale);

        if (window.AppSpeech) {
            const enabled = localStorage.getItem('voiceOutputEnabled') !== 'false';
            window.AppSpeech.setEnabled(enabled);
        }
    },

    loadControls() {
        const delaySlider = document.getElementById('delaySlider');
        const delayValue = document.getElementById('delayValue');
        const themeTiles = document.getElementById('themeTiles');
        const toastPositionSelect = document.getElementById('toastPositionSelect');
        const toastVerticalSlider = document.getElementById('toastVerticalSlider');
        const toastVerticalValue = document.getElementById('toastVerticalValue');
        const toastWidthSlider = document.getElementById('toastWidthSlider');
        const toastWidthValue = document.getElementById('toastWidthValue');
        const fontSizeSlider = document.getElementById('fontSizeSlider');
        const fontSizeValue = document.getElementById('fontSizeValue');
        const voiceOutputToggle = document.getElementById('voiceOutputToggle');

        if (delaySlider) {
            delaySlider.value = App.State.autoReturnDelay;
            if (delayValue) delayValue.textContent = App.State.autoReturnDelay === 0 ? 'Откл' : App.State.autoReturnDelay + 'с';
        }

        const savedTheme = localStorage.getItem('appTheme') || 'auto';
        if (themeTiles) {
            themeTiles.querySelectorAll('.tile').forEach(t => {
                t.classList.toggle('active', t.dataset.theme === savedTheme);
                t.classList.toggle('pulse', t.dataset.theme === savedTheme);
            });
        }

        if (toastPositionSelect) toastPositionSelect.value = App.State.toastPosition;
        if (toastVerticalSlider) toastVerticalSlider.value = App.State.toastVertical;
        if (toastVerticalValue) toastVerticalValue.textContent = App.State.toastVertical + 'px';
        if (toastWidthSlider) toastWidthSlider.value = App.State.toastWidth;
        if (toastWidthValue) toastWidthValue.textContent = App.State.toastWidth + '%';
        if (fontSizeSlider) fontSizeSlider.value = App.State.fontSizeScale;
        if (fontSizeValue) fontSizeValue.textContent = App.State.fontSizeScale + '%';

        if (voiceOutputToggle && window.AppSpeech) {
            voiceOutputToggle.checked = window.AppSpeech.getEnabled();
        }
    },

    initControls() {
        const settingsContent = document.getElementById('settingsContent');
        if (!settingsContent) return;

        settingsContent.innerHTML = `
            <div class="group">
                <div class="group-title">⏱ Автоматически открывать главный экран после поиска</div>
                <div class="slider-card">
                    <div class="slider-row">
                        <input type="range" id="delaySlider" min="0" max="30" step="1" value="8">
                        <span class="slider-value" id="delayValue">8с</span>
                    </div>
                </div>
            </div>
            <div class="group">
                <div class="group-title">🎨 Оформление</div>
                <div class="tiles-3" id="themeTiles">
                    <div class="tile active pulse" data-theme="auto"><span class="tile-icon">🌓</span>Авто</div>
                    <div class="tile" data-theme="dark"><span class="tile-icon">🌙</span>Тёмная</div>
                    <div class="tile" data-theme="light"><span class="tile-icon">☀️</span>Светлая</div>
                </div>
            </div>
            <div class="group">
                <div class="group-title">🔊 Голосовое озвучивание</div>
                <div class="slider-card">
                    <div class="slider-row" style="justify-content: space-between;">
                        <span style="color: var(--text-secondary); font-size: 0.95rem;">Озвучивать название региона</span>
                        <label class="toggle-switch">
                            <input type="checkbox" id="voiceOutputToggle">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
            <div class="toast-settings" id="toastSettings">
                <div class="group">
                    <div class="group-title">💬 Настройки тостов и шрифтов</div>
                    <div class="toast-option">
                        <span class="label">Положение по вертикали</span>
                        <div class="slider-row">
                            <input type="range" id="toastVerticalSlider" min="20" max="200" value="100">
                            <span class="slider-value" id="toastVerticalValue">100px</span>
                        </div>
                    </div>
                    <div class="toast-option">
                        <span class="label">Ширина тоста</span>
                        <div class="slider-row">
                            <input type="range" id="toastWidthSlider" min="60" max="100" value="90">
                            <span class="slider-value" id="toastWidthValue">90%</span>
                        </div>
                    </div>
                    <div class="toast-option">
                        <span class="label">Расположение</span>
                        <select id="toastPositionSelect">
                            <option value="top">Сверху</option>
                            <option value="bottom" selected>Снизу</option>
                        </select>
                    </div>
                </div>
                <div class="group font-size-control">
                    <div class="group-title">🔤 Размер шрифта в модалках</div>
                    <div class="toast-option">
                        <span class="label">Масштаб</span>
                        <div class="slider-row">
                            <input type="range" id="fontSizeSlider" min="80" max="150" value="100" step="5">
                            <span class="slider-value" id="fontSizeValue">100%</span>
                        </div>
                    </div>
                </div>
            </div>
            <button class="apply-btn" id="applySettingsBtn">✓ Применить</button>
        `;

        // Обработчики
        const delaySlider = document.getElementById('delaySlider');
        if (delaySlider) {
            delaySlider.addEventListener('input', function() {
                const val = parseInt(this.value);
                const delayValue = document.getElementById('delayValue');
                if (delayValue) delayValue.textContent = val === 0 ? 'Откл' : val + 'с';
            });
        }

        const themeTiles = document.getElementById('themeTiles');
        if (themeTiles) {
            themeTiles.addEventListener('click', function(e) {
                const tile = e.target.closest('.tile');
                if (!tile) return;
                this.querySelectorAll('.tile').forEach(t => t.classList.remove('active', 'pulse'));
                tile.classList.add('active', 'pulse');
            });
        }

        const voiceOutputToggle = document.getElementById('voiceOutputToggle');
        if (voiceOutputToggle && window.AppSpeech) {
            voiceOutputToggle.checked = window.AppSpeech.getEnabled();
            voiceOutputToggle.addEventListener('change', function() {
                window.AppSpeech.setEnabled(this.checked);
                window.AppUI?.showToast(this.checked ? '🔊 Озвучивание включено' : '🔇 Озвучивание выключено', 1500);
            });
        }

        const toastPositionSelect = document.getElementById('toastPositionSelect');
        if (toastPositionSelect) {
            toastPositionSelect.addEventListener('change', function() {
                const pos = this.value;
                App.State.toastPosition = pos;
                localStorage.setItem('toastPosition', pos);
                window.AppUI?.applyToastSettings(App.State.toastVertical, App.State.toastWidth, pos);
                window.AppUI?.showToast('💬 Тосты ' + (pos === 'top' ? 'сверху' : 'снизу'));
            });
        }

        const toastVerticalSlider = document.getElementById('toastVerticalSlider');
        if (toastVerticalSlider) {
            toastVerticalSlider.addEventListener('input', function() {
                const val = parseInt(this.value);
                App.State.toastVertical = val;
                const toastVerticalValue = document.getElementById('toastVerticalValue');
                if (toastVerticalValue) toastVerticalValue.textContent = val + 'px';
                localStorage.setItem('toastVertical', val);
                window.AppUI?.applyToastSettings(val, App.State.toastWidth, App.State.toastPosition);
                window.AppUI?.showToast('📏 Положение: ' + val + 'px', 1200);
            });
        }

        const toastWidthSlider = document.getElementById('toastWidthSlider');
        if (toastWidthSlider) {
            toastWidthSlider.addEventListener('input', function() {
                const val = parseInt(this.value);
                App.State.toastWidth = val;
                const toastWidthValue = document.getElementById('toastWidthValue');
                if (toastWidthValue) toastWidthValue.textContent = val + '%';
                localStorage.setItem('toastWidth', val);
                window.AppUI?.applyToastSettings(App.State.toastVertical, val, App.State.toastPosition);
                window.AppUI?.showToast('📐 Ширина: ' + val + '%', 1200);
            });
        }

        const fontSizeSlider = document.getElementById('fontSizeSlider');
        if (fontSizeSlider) {
            fontSizeSlider.addEventListener('input', function() {
                const val = parseInt(this.value);
                window.AppUI?.applyFontSize(val);
                window.AppUI?.showToast('🔤 Шрифт: ' + Math.round(val / 5) * 5 + '%', 1200);
            });
        }

        const applySettingsBtn = document.getElementById('applySettingsBtn');
        if (applySettingsBtn) {
            applySettingsBtn.addEventListener('click', function() {
                const themeTiles = document.getElementById('themeTiles');
                const theme = themeTiles?.querySelector('.tile.active')?.dataset.theme || 'auto';
                const delaySlider = document.getElementById('delaySlider');
                const delay = parseInt(delaySlider?.value || 8);
                localStorage.setItem('appTheme', theme);
                localStorage.setItem('autoReturnDelay', delay.toString());
                App.State.autoReturnDelay = delay;
                window.AppUI?.applyTheme(theme);
                if (themeTiles) {
                    themeTiles.querySelectorAll('.tile').forEach(t => {
                        t.classList.toggle('active', t.dataset.theme === theme);
                        t.classList.toggle('pulse', t.dataset.theme === theme);
                    });
                }
                window.AppUI?.showToast(`✓ Тема: ${theme === 'dark' ? 'Тёмная' : theme === 'light' ? 'Светлая' : 'Авто'}, Автовозврат: ${delay === 0 ? 'Откл' : delay + 'с'}`);
                const settingsModal = document.getElementById('settingsModal');
                if (settingsModal) settingsModal.classList.remove('active');
            });
        }

        App.Settings.loadControls();
    }
};

// ============================================================
// 10. NATIVE BRIDGE
// ============================================================
App.Native = {
    vibrate(ms = 50) {
        try {
            if (window.webtoapp?.vibrate) return window.webtoapp.vibrate(ms);
            if (navigator.vibrate) return navigator.vibrate(ms);
        } catch (_) {}
    },

    minimize() {
        try {
            if (window.webtoapp?.minimize) return window.webtoapp.minimize();
        } catch (_) {}
    }
};

// ============================================================
// 11. ИНИЦИАЛИЗАЦИЯ
// ============================================================
App.init = function() {
    console.log(`🚗 Коды регионов РФ v${App.Config.APP_VERSION} (сборка #${App.Config.BUILD_NUMBER})`);

    App.Settings.load();

    App.Data.load().then(() => {
        App.Voice.init();
        window.AppUI?.showToast('🎤 Нажмите и говорите');
    });

    App.Modal.bindOverlayClick('settingsModal', App.Modal.closeSettings);
    App.Modal.bindOverlayClick('infoModalRegion', App.Modal.closeRegion);
    App.Modal.bindOverlayClick('helpModal', App.Modal.closeHelp);
    App.Modal.bindOverlayClick('infoModalApp', App.Modal.closeAppInfo);

    document.getElementById('settingsCloseBtn')?.addEventListener('click', App.Modal.closeSettings);
    document.getElementById('modalCloseBtn')?.addEventListener('click', App.Modal.closeRegion);
    document.getElementById('helpCloseBtn')?.addEventListener('click', App.Modal.closeHelp);
    document.getElementById('modalAppCloseBtn')?.addEventListener('click', App.Modal.closeAppInfo);

    document.getElementById('settingsBtn')?.addEventListener('click', App.Modal.openSettings);
    document.getElementById('helpBtn')?.addEventListener('click', App.Modal.openHelp);
    document.getElementById('clearCarBtn')?.addEventListener('click', App.Timer.clearAndReturn);

    const footer = document.getElementById('footer');
    if (footer) {
        footer.textContent = `версия ${App.Config.APP_VERSION} · сборка #${App.Config.BUILD_NUMBER} (${App.Config.BUILD_DATE}) · © drts`;
        footer.addEventListener('click', App.Modal.openAppInfo);
    }

    let titleTapCount = 0,
        titleTapTimer = null;
    document.getElementById('titleTrigger')?.addEventListener('click', function(e) {
        e.stopPropagation();
        titleTapCount++;
        if (titleTapCount === 1) {
            titleTapTimer = setTimeout(() => titleTapCount = 0, 500);
        } else if (titleTapCount === 2) {
            clearTimeout(titleTapTimer);
            titleTapCount = 0;
            const toastSettings = document.getElementById('toastSettings');
            toastSettings?.classList.toggle('open');
            window.AppUI?.showToast(toastSettings?.classList.contains('open') ? '🔧 Настройки тостов и шрифтов' : '🔧 Настройки скрыты', 1500);
        }
    });

    App.Settings.initControls();

    window.addEventListener('popstate', function(e) {
        const modalRegion = document.getElementById('infoModalRegion');
        const helpModal = document.getElementById('helpModal');
        const settingsModal = document.getElementById('settingsModal');
        const modalApp = document.getElementById('infoModalApp');
        const resultsContainer = document.getElementById('resultsContainer');

        if (modalRegion?.classList.contains('active')) { App.Modal.closeRegion(); return; }
        if (helpModal?.classList.contains('active')) { App.Modal.closeHelp(); return; }
        if (settingsModal?.classList.contains('active')) { App.Modal.closeSettings(); return; }
        if (modalApp?.classList.contains('active')) { App.Modal.closeAppInfo(); return; }
        if (resultsContainer?.children.length > 0) {
            window.AppUI?.clearResults();
            return;
        }
        App.Native.minimize();
    });

    document.addEventListener('touchstart', (e) => {
        if (e.target.closest('.result-card') || e.target.closest('.clear-btn') || e.target.closest('.voice-btn')) {
            App.Timer.reset();
        }
    });
    document.getElementById('resultsContainer')?.addEventListener('scroll', App.Timer.reset);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const settingsModal = document.getElementById('settingsModal');
            const modalRegion = document.getElementById('infoModalRegion');
            const helpModal = document.getElementById('helpModal');
            const modalApp = document.getElementById('infoModalApp');
            if (settingsModal?.classList.contains('active')) App.Modal.closeSettings();
            if (modalRegion?.classList.contains('active')) App.Modal.closeRegion();
            if (helpModal?.classList.contains('active')) App.Modal.closeHelp();
            if (modalApp?.classList.contains('active')) App.Modal.closeAppInfo();
        }
    });

    if (!window.history.state || !window.history.state._app) {
        window.history.pushState({ _app: true, back: true }, '');
    }

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then(() => console.log('✅ SW зарегистрирован'))
                .catch(() => console.warn('⚠️ SW не зарегистрирован'));
        });
    }
};

document.addEventListener('DOMContentLoaded', App.init);