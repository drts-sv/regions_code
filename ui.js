// ============================================================
// UI-РЕНДЕРИНГ
// ============================================================
window.AppUI = {
    // === ОТРИСОВКА РЕЗУЛЬТАТОВ ===
    renderResults(results) {
        const container = document.getElementById('resultsContainer');
        if (!container) return;
        container.innerHTML = '';
        if (!results || results.length === 0) {
            container.innerHTML = '<div class="error-message">Ничего не найдено</div>';
            AppUI.updateControls(false);
            return;
        }

        let firstRegionName = null;
        results.forEach(region => {
            const code = App.Data.getDisplayCode(region.codes);
            const codeDisplay = typeof code === 'number' ? (code < 10 ? `0${code}` : `${code}`) : code;
            container.appendChild(AppUI.createCivilCard(region, codeDisplay));
            if (!firstRegionName) firstRegionName = region.title;
        });

        if (firstRegionName && window.AppSpeech) {
            setTimeout(async () => { await window.AppSpeech.speak(firstRegionName); }, 300);
        }

        AppUI.updateControls(true);
    },

    async renderMilitary(name, desc) {
        const container = document.getElementById('resultsContainer');
        if (!container) return;
        const card = document.createElement('div');
        card.className = 'result-card';
        card.innerHTML = `
            <div class="result-header"><span class="region-type military">ВОЕННЫЙ</span></div>
            <div class="region-name" style="font-size:1.6rem;line-height:1.2;word-break:break-word;hyphens:auto;">${App.Utils.escapeHtml(name)}</div>
            <div class="region-desc" style="font-size:1rem;">${App.Utils.escapeHtml(desc)}</div>
        `;
        container.appendChild(card);

        if (window.AppSpeech) {
            setTimeout(async () => { await window.AppSpeech.speak(name); }, 300);
        }
    },

    createCivilCard(region, codeDisplay) {
        const card = document.createElement('div');
        card.className = 'result-card';
        const name = App.Utils.escapeHtml(region.title);
        const typeName = App.Data.getRegionType(region.typeId);
        const nameLength = region.title.length;
        let nameClass = '';
        if (nameLength > 25) nameClass = 'very-long';
        else if (nameLength > 18) nameClass = 'long';

        card.innerHTML = `
            <div class="result-header"><span class="region-type">РЕГИОН</span></div>
            <div class="result-code-wrapper">
                <div class="result-code" data-code="${App.Utils.escapeHtml(codeDisplay)}">${App.Utils.escapeHtml(codeDisplay)}</div>
                <div class="region-name ${nameClass}" id="regionName_${region.id}">${name}</div>
                ${typeName ? `<div class="region-desc">${App.Utils.escapeHtml(typeName)}</div>` : ''}
            </div>
        `;

        const nameEl = card.querySelector('.region-name');
        if (nameEl && nameLength > 18) {
            let fontSize;
            if (nameLength > 28) fontSize = '1.3rem';
            else if (nameLength > 22) fontSize = '1.6rem';
            else if (nameLength > 18) fontSize = '1.9rem';
            nameEl.style.fontSize = fontSize;
            nameEl.style.lineHeight = '1.2';
        }

        card.addEventListener('click', function() {
            const code = this.querySelector('.result-code')?.dataset.code;
            if (code) App.Modal.openRegion(region, code);
        });
        return card;
    },

    // === УПРАВЛЕНИЕ СОСТОЯНИЕМ UI ===
    showError(msg) {
        const container = document.getElementById('resultsContainer');
        if (!container) return;
        container.innerHTML = '';
        const errDiv = document.createElement('div');
        errDiv.className = 'error-message';
        errDiv.innerText = msg;
        container.appendChild(errDiv);
        AppUI.updateControls(false);
    },

    clearResults() {
        const container = document.getElementById('resultsContainer');
        if (container) container.innerHTML = '';
        AppUI.updateControls(false);
        if (window.AppSpeech) window.AppSpeech.stop();
    },

    updateControls(hasResults) {
        const voiceContainer = document.getElementById('voiceContainer');
        const clearContainer = document.getElementById('clearContainer');
        if (!voiceContainer || !clearContainer) return;

        if (hasResults) {
            voiceContainer.classList.add('hidden');
            clearContainer.classList.add('visible');
            clearContainer.style.display = 'flex';
            if (App.State.autoReturnDelay > 0) App.Timer.start();
        } else {
            voiceContainer.classList.remove('hidden');
            clearContainer.classList.remove('visible');
            clearContainer.style.display = 'none';
            App.Timer.stop();
        }
    },

    // === TOAST ===
    showToast(text, duration = 2000) {
        const toast = document.getElementById('toastMessage');
        if (!toast) return;
        toast.textContent = text;
        toast.classList.add('show');
        clearTimeout(toast._hideTimer);
        toast._hideTimer = setTimeout(() => toast.classList.remove('show'), duration);
    },

    applyToastSettings(vertical, width, position) {
        const toast = document.getElementById('toastMessage');
        if (!toast) return;
        if (position === 'top') {
            toast.style.top = vertical + 'px';
            toast.style.bottom = 'auto';
        } else {
            toast.style.top = 'auto';
            toast.style.bottom = vertical + 'px';
        }
        toast.style.width = width + '%';
        toast.style.maxWidth = width + '%';
    },

    // === ШРИФТЫ И ТЕМЫ ===
    applyFontSize(scale) {
        const rounded = Math.round(scale / 5) * 5;
        const modals = [
            document.getElementById('settingsModalGlass'),
            document.getElementById('regionModalGlass'),
            document.getElementById('helpModalGlass')
        ];
        modals.forEach(modal => {
            if (modal) modal.style.setProperty('--modal-scale', rounded / 100);
        });
        const fontSizeValue = document.getElementById('fontSizeValue');
        if (fontSizeValue) fontSizeValue.textContent = rounded + '%';
        App.State.fontSizeScale = rounded;
        localStorage.setItem('fontSizeScale', rounded);
    },

    applyTheme(theme) {
        document.body.classList.remove('dark', 'light');
        if (theme === 'light') document.body.classList.add('light');
        else if (theme === 'dark') document.body.classList.add('dark');
        else {
            document.body.classList.add(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        }
        localStorage.setItem('appTheme', theme);
    }
};