import {AUTHOR,XError} from './x-collector.js';

export const CATALOG_STATUS_URL='https://codex-resets.com/api/resets';
const cleanText=value=>String(value||'').replace(/(?:\s+https:\/\/t\.co\/\S+)+\s*$/i,'').trim();
const statusSummary=kind=>kind==='banked'?{
  en:'codex-resets.com reports that the latest reset is a banked reset ready to redeem.',
  zh:'codex-resets.com 将最近一次状态标记为可手动启用的备用重置。'
}:{
  en:'codex-resets.com reports that the latest Codex reset has completed.',
  zh:'codex-resets.com 将最近一次状态标记为已完成重置。'
};
const normalizeCatalogEvent=event=>{
  if(!event||!['regular','banked'].includes(event.reset_type))return null;
  if(typeof event.announced_at!=='string'||!Number.isFinite(Date.parse(event.announced_at)))return false;
  let source,id;try{source=new URL(event.tweet_url);const match=source.pathname.match(new RegExp(`^/${AUTHOR}/status/(\\d{10,25})/?$`));if(source.protocol!=='https:'||source.hostname!=='x.com'||!match)return null;id=match[1];}catch{return null;}
  const text=cleanText(event.display_text||event.text);if(!text||text.length>100000)return false;
  const kind=event.reset_type;
  return {id,state:kind==='banked'?'available':'completed',kind,text,announcedAt:event.announced_at,source:source.href,relatedPostIds:[],timingText:'',review:'source_reported',method:'catalog_status',summary:statusSummary(kind)};
};
export async function collectCatalogStatus(previous,fetcher=fetch){
  let response;try{response=await fetcher(CATALOG_STATUS_URL,{headers:{Accept:'application/json','User-Agent':'CodexResets-Status/1.0'},signal:AbortSignal.timeout(12000)});}catch{throw new XError('catalog_status_unavailable');}
  if(!response.ok)throw new XError('catalog_status_unavailable',response.status);
  const length=Number(response.headers.get('Content-Length')||0);if(length>2_000_000)throw new XError('invalid_response');
  const raw=await response.text();if(raw.length>2_000_000)throw new XError('invalid_response');
  let body;try{body=JSON.parse(raw);}catch{throw new XError('invalid_response');}
  if(!Array.isArray(body?.events))throw new XError('invalid_response');
  const latest=body.events.map(normalizeCatalogEvent).filter(Boolean).sort((a,b)=>Date.parse(b.announcedAt)-Date.parse(a.announcedAt))[0];
  if(!latest)throw new XError('invalid_response');
  const now=new Date().toISOString();
  return {...previous,catalogStatusEvent:latest,catalogStatusSource:CATALOG_STATUS_URL,catalogStatusCheckedAt:now};
}
