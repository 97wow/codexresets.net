import {classifyPostsWithAI} from './ai-classifier.js';
import {AUTHOR,AUTHOR_ID,XError,deriveEvents,mergePosts} from './x-collector.js';
import {createdAtFromSnowflake} from './x-public-collector.js';

export const CATALOG_STATUS_URL='https://codex-resets.com/api/resets';
const cleanText=value=>String(value||'').replace(/(?:\s+https:\/\/t\.co\/\S+)+\s*$/i,'').trim();
const validCatalogEvent=event=>{
  if(!event||!/^[0-9]{10,25}$/.test(String(event.tweet_id))||!['regular','banked'].includes(event.reset_type))return false;
  if(typeof event.announced_at!=='string'||!Number.isFinite(Date.parse(event.announced_at)))return false;
  try{const url=new URL(event.tweet_url);if(url.protocol!=='https:'||url.hostname!=='x.com'||url.pathname!==`/${AUTHOR}/status/${event.tweet_id}`)return false;}catch{return false;}
  const text=cleanText(event.display_text||event.text);if(!text||text.length>100000)return false;
  return Math.abs(Date.parse(event.announced_at)-Date.parse(createdAtFromSnowflake(String(event.tweet_id))))<300000;
};
export async function collectCatalogStatus(previous,fetcher=fetch,ai){
  let response;try{response=await fetcher(CATALOG_STATUS_URL,{headers:{Accept:'application/json','User-Agent':'CodexResets-Fallback/1.0'},signal:AbortSignal.timeout(12000)});}catch{throw new XError('catalog_fallback_unavailable');}
  if(!response.ok)throw new XError('catalog_fallback_unavailable',response.status);
  const length=Number(response.headers.get('Content-Length')||0);if(length>2_000_000)throw new XError('invalid_response');
  const raw=await response.text();if(raw.length>2_000_000)throw new XError('invalid_response');
  let body;try{body=JSON.parse(raw);}catch{throw new XError('invalid_response');}
  if(!Array.isArray(body?.events))throw new XError('invalid_response');
  const known=new Set((previous.posts||[]).map(post=>post.id)),now=new Date().toISOString();
  const received=body.events.filter(validCatalogEvent).filter(event=>!known.has(String(event.tweet_id))).slice(0,10).map(event=>({id:String(event.tweet_id),authorId:AUTHOR_ID,text:cleanText(event.display_text||event.text),createdAt:event.announced_at,url:`https://x.com/${AUTHOR}/status/${event.tweet_id}`,references:[],isReply:false,edits:[String(event.tweet_id)],collectedAt:now,method:'catalog_status_fallback'}));
  if(!received.length)return {...previous,catalogStatusSource:CATALOG_STATUS_URL,catalogStatusCheckedAt:now};
  const posts=await classifyPostsWithAI(mergePosts(previous.posts||[],received),ai);
  return {...previous,posts,events:deriveEvents(posts),catalogStatusSource:CATALOG_STATUS_URL,catalogStatusCheckedAt:now};
}
