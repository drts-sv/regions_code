// ============================================================
// ГОЛОСОВОЕ ОЗВУЧИВАНИЕ (Speech Synthesis)
// ============================================================
window.AppSpeech = {
    enabled: true,
    initialized: false,
    voices: [],
    
    // Инициализация голосов
    init() {
        if (this.initialized) return;
        if (!window.speechSynthesis) {
            console.warn('⚠️ SpeechSynthesis не поддерживается');
            this.enabled = false;
            return;
        }
        
        // Загружаем голоса
        const loadVoices = () => {
            this.voices = window.speechSynthesis.getVoices();
            if (this.voices.length > 0) {
                console.log(`✅ Загружено ${this.voices.length} голосов`);
            }
        };
        
        // Подписываемся на событие загрузки голосов
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = loadVoices;
        }
        
        // Пробуем загрузить сразу
        loadVoices();
        
        // Если голоса не загрузились, пробуем через таймаут
        setTimeout(loadVoices, 500);
        
        this.initialized = true;
        this.enabled = localStorage.getItem('voiceOutputEnabled') !== 'false';
    },
    
    // Проверка доступности
    isAvailable() {
        return this.enabled && window.speechSynthesis && this.voices.length > 0;
    },
    
    // Озвучивание текста
    speak(text) {
        if (!this.isAvailable()) return;
        if (!text || text.trim() === '') return;
        
        // Останавливаем предыдущую речь
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ru-RU';
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.volume = 1;
        
        // Выбираем русский голос
        const ruVoice = this.voices.find(v => v.lang.startsWith('ru'));
        if (ruVoice) utterance.voice = ruVoice;
        
        window.speechSynthesis.speak(utterance);
        
        // Возвращаем true, если речь была запущена
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
        localStorage.setItem('voiceOutputEnabled', enabled);
        if (!enabled) {
            this.stop();
        }
    },
    
    // Получить статус
    getEnabled() {
        return this.enabled;
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