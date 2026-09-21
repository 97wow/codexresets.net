export const locales=['en','zh','zh-Hant','es','fr','de','pt','ru','ja','ko'];
export const localeInfo={
  en:{base:'/',label:'English',html:'en',date:'en-GB',content:'en'},
  zh:{base:'/zh/',label:'简体中文',html:'zh-CN',date:'zh-CN',content:'zh'},
  'zh-Hant':{base:'/zh-hant/',label:'繁體中文',html:'zh-Hant',date:'zh-TW',content:'zh'},
  es:{base:'/es/',label:'Español',html:'es',date:'es-ES',content:'en'},
  fr:{base:'/fr/',label:'Français',html:'fr',date:'fr-FR',content:'en'},
  de:{base:'/de/',label:'Deutsch',html:'de',date:'de-DE',content:'en'},
  pt:{base:'/pt/',label:'Português',html:'pt-BR',date:'pt-BR',content:'en'},
  ru:{base:'/ru/',label:'Русский',html:'ru',date:'ru-RU',content:'en'},
  ja:{base:'/ja/',label:'日本語',html:'ja',date:'ja-JP',content:'en'},
  ko:{base:'/ko/',label:'한국어',html:'ko',date:'ko-KR',content:'en'}
};
export const localeBase=lang=>localeInfo[lang]?.base||'/';
export const localePath=(lang,suffix='')=>`${localeBase(lang)}${suffix.replace(/^\//,'')}`;
export const contentLanguage=lang=>localeInfo[lang]?.content||'en';
export const localizedSummary=(event,lang)=>event?.summary?.[contentLanguage(lang)]||event?.summary?.en||event?.summary?.zh||event?.text||'';
