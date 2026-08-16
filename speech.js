// ============================================================
// ГОЛОСОВОЕ ОЗВУЧИВАНИЕ (Speech Synthesis)
// Оптимизировано для Android: асинхронная загрузка голосов с retry
// ============================================================
window.AppSpeech = {
    enabled: true,
    initialized: false,
    voices: [],
    voicesLoaded: false,
    
    // Инициализация голосов с надежной загрузкой на Android
    async init() {
        if (this.initialized) return;
        if (!window.speechSynthesis) {
            console.warn('⚠️ SpeechSynthesis не поддерживается');
            this.enabled = false;
            this.initialized = true;
            return;
        }
        
        this.initialized = true;
        this.enabled = localStorage.getItem('voiceOutputEnabled') !== 'false';
        
        // Асинхронная загрузка голосов с retry-логикой
        await this.loadVoicesWithRetry();
    },
    
    // Загрузка голосов с повторными попытками
    async loadVoicesWithRetry(maxAttempts = 5, delayMs = 100) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const voices = window.speechSynthesis.getVoices();
            
            if (voices && voices.length > 0) {
                this.voices = voices;
                this.voicesLoaded = true;
                console.log(`✅ Голоса загружены (${voices.length} шт.) после попытки ${attempt}`);
                return true;
            }
            
            console.log(`⏳ Попытка ${attempt}/${maxAttempts}: ожидание голосов...`);
            
            // Ждем события onvoiceschanged или таймаут
            await new Promise(resolve => {
                const timeout = setTimeout(resolve, delayMs * attempt);
                if (window.speechSynthesis.onvoiceschanged !== undefined) {
                    window.speechSynthesis.onvoiceschanged = () => {
                        clearTimeout(timeout);
                        resolve();
                    };
                }
            });
        }
        
        console.warn('⚠️ Не удалось загрузить голоса после всех попыток');
        return false;
    },
    
    // Проверка доступности
    isAvailable() {
        return this.enabled && window.speechSynthesis && this.voicesLoaded && this.voices.length > 0;
    },
    
    // Озвучивание текста с гарантией загрузки голосов
    async speak(text) {
        if (!this.enabled || !text || text.trim() === '') return false;
        if (!window.speechSynthesis) return false;
        
        // Если голоса еще не загружены, пробуем загрузить
        if (!this.voicesLoaded) {
            console.log('🔄 Голоса не загружены, пытаемся загрузить перед озвучиванием...');
            await this.loadVoicesWithRetry(3, 200);
        }
        
        if (!this.isAvailable()) {
            console.warn('⚠️ Озвучивание недоступно: голоса не загружены или отключены');
            return false;
        }
        
        // Останавливаем предыдущую речь
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ru-RU';
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.volume = 1;
        
        // Выбираем русский голос (приоритет Google Russian Voice для Android)
        const ruVoice = this.voices.find(v => 
            v.lang.startsWith('ru') && 
            (v.name.includes('Google') || v.name.includes('Yandex'))
        ) || this.voices.find(v => v.lang.startsWith('ru'));
        
        if (ruVoice) {
            utterance.voice = ruVoice;
            console.log(`🔊 Используем голос: ${ruVoice.name}`);
        }
        
        // Обработка событий
        utterance.onstart = () => console.log('▶️ Начало озвучивания');
        utterance.onend = () => console.log('⏹️ Конец озвучивания');
        utterance.onerror = (e) => console.error('❌ Ошибка озвучивания:', e.error);
        
        window.speechSynthesis.speak(utterance);
        return true;
    },
    
    // Остановка речи
    stop() {
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
    },
    
    // Включить/выключить
    setEnabled(enabled) {
        this.enabled = enabled;
        localStorage.setItem('voiceOutputEnabled', enabled ? 'true' : 'false');
        if (!enabled) {
            this.stop();
        }
    },
    
    // Получить статус
    getEnabled() {
        return this.enabled;
    },
    
    // Принудительная перезагрузка голосов (для отладки)
    async reloadVoices() {
        this.voicesLoaded = false;
        this.voices = [];
        return await this.loadVoicesWithRetry();
    }
};

// Автоматическая инициализация при загрузке
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.AppSpeech.init();
    });
} else {
    window.AppSpeech.init();
}