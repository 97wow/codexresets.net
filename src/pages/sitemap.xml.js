import snapshot from '../data/snapshot.json';
import {localeBase,locales} from '../lib/i18n.js';
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
export const GET=()=>{
  const pages=[...locales.flatMap(lang=>[[localeBase(lang),snapshot.lastReviewAt],[`${localeBase(lang)}rss/`,snapshot.lastReviewAt]]),['/api/',snapshot.lastReviewAt],...snapshot.events.flatMap(event=>locales.map(lang=>[`${localeBase(lang)}resets/${event.id}/`,event.announcedAt]))];
  const xml=`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map(([path,lastmod])=>`<url><loc>${escape(`https://codexresets.net${path}`)}</loc>${lastmod?`<lastmod>${escape(new Date(lastmod).toISOString())}</lastmod>`:''}</url>`).join('')}</urlset>`;
  return new Response(xml,{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=3600'}});
};
