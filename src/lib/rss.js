import copy from '../data/copy.json';
import {escape,sourceURL} from './tracker.js';
import {localeBase,localeInfo,localizedSummary} from './i18n.js';
export function rssResponse(data,lang='en'){
  const t=copy[lang]||copy.en,base=`https://codexresets.net${localeBase(lang)}`;
  const items=(data.events||[]).map(e=>{const summary=localizedSummary(e,lang);return `<item><title>${escape(t[e.state]+': '+summary)}</title><link>${escape(sourceURL(e.source))}</link><guid isPermaLink="false">codexresets.net:x:${escape(e.id)}</guid><pubDate>${new Date(e.announcedAt).toUTCString()}</pubDate><description>${escape(summary+' '+e.text+' '+t.original+': '+sourceURL(e.source))}</description><source url="https://x.com/thsottiaux">Tibo on X</source></item>`;}).join('');
  const updated=data.lastSuccessAt||data.lastReviewAt;
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Codex Resets</title><link>${base}</link><description>${escape(t.feedDescription)}</description><language>${localeInfo[lang]?.html||'en'}</language>${updated?`<lastBuildDate>${new Date(updated).toUTCString()}</lastBuildDate>`:''}<atom:link href="${base}feed.xml" rel="self" type="application/rss+xml"/>${items}</channel></rss>`,{headers:{'Content-Type':'application/rss+xml; charset=utf-8'}});
}
