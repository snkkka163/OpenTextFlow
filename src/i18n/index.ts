import { zh_CN } from './locales/zh_CN';
import { en_US } from './locales/en_US';

type Language = 'zh_CN' | 'en_US';

const messages: Record<Language, Record<string, string>> = {
    zh_CN,
    en_US,
};

let currentLanguage: Language = 'zh_CN';

export function setLanguage(lang: Language) {
    currentLanguage = lang;
    localStorage.setItem('ui_language', lang);
}

export function getLanguage(): Language {
    const saved = localStorage.getItem('ui_language') as Language | null;
    if (saved && (saved === 'zh_CN' || saved === 'en_US')) {
        currentLanguage = saved;
        return saved;
    }
    return currentLanguage;
}

export function t(key: string, defaultValue?: string): string {
    const lang = getLanguage();
    return messages[lang][key] || defaultValue || key;
}

export function initI18n() {
    return getLanguage();
}
