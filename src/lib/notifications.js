import {AwsClient} from 'aws4fetch';
import {localizedSummary} from './i18n.js';

const encoder=new TextEncoder();
const eventStates=new Set(['signal','announced','rollout','completed','compensation']);
const supportedLanguages=new Set(['en','zh','zh-Hant','ja','ko']);
const langOf=value=>supportedLanguages.has(value)?value:'en';
const bytesToHex=bytes=>[...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('');
const randomToken=(length=24)=>{const bytes=new Uint8Array(length);crypto.getRandomValues(bytes);return bytesToHex(bytes);};
const digest=async value=>bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))));
const hmac=async(secret,value)=>{const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return bytesToHex(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value))));};
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const jsonBody=async request=>{if(Number(request.headers.get('Content-Length')||0)>4096)throw new NotifyError('payload_too_large',413);let body;try{body=await request.json();}catch{throw new NotifyError('invalid_json',400);}if(!body||typeof body!=='object'||Array.isArray(body))throw new NotifyError('invalid_json',400);return body;};

export class NotifyError extends Error{constructor(code,status=400){super(code);this.code=code;this.status=status;}}
export const validEmail=value=>typeof value==='string'&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
export function validateWebhookUrl(value){
  let url;try{url=new URL(value);}catch{throw new NotifyError('invalid_webhook');}
  if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||url.pathname.length>1000)throw new NotifyError('invalid_webhook');
  const host=url.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  if(!host||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal'))throw new NotifyError('invalid_webhook');
  if(host.includes(':'))throw new NotifyError('invalid_webhook');
  const ipv4=host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if(ipv4){const parts=ipv4.slice(1).map(Number);if(parts.some(part=>part>255)||parts[0]===10||parts[0]===127||parts[0]===0||(parts[0]===169&&parts[1]===254)||(parts[0]===172&&parts[1]>=16&&parts[1]<=31)||(parts[0]===192&&parts[1]===168))throw new NotifyError('invalid_webhook');}
  return url.href;
}
async function rateLimit(env,request,scope,limit){
  if(!env.NOTIFY_SALT)throw new NotifyError('notifications_unavailable',503);
  const ip=request.headers.get('CF-Connecting-IP')||'unknown',window=Math.floor(Date.now()/3600000),key=`notify:rate:${scope}:${await hmac(env.NOTIFY_SALT,`${window}:${ip}`)}`;
  const count=Math.max(0,Number.parseInt(await env.RESETS.get(key)||'0',10)||0);
  if(count>=limit)throw new NotifyError('rate_limited',429);
  await env.RESETS.put(key,String(count+1),{expirationTtl:7200});
}
function emailWords(lang){return ({
  zh:{confirmSubject:'确认 Codex Resets 邮件提醒',confirmTitle:'确认邮件提醒',confirmText:'点击下面的按钮确认订阅。确认后，出现新的重置信号、预告或完成消息时，我们会发邮件提醒你。',confirmAction:'确认订阅',alertSubject:'Codex 有新的重置动态',alertTitle:'新的 Codex 重置动态',source:'查看 X 原帖',unsubscribe:'取消邮件提醒'},
  'zh-Hant':{confirmSubject:'確認 Codex Resets 郵件提醒',confirmTitle:'確認郵件提醒',confirmText:'點擊下方按鈕確認訂閱。出現新的重置信號、預告、發放進度或完成消息時，我們會寄信提醒你。',confirmAction:'確認訂閱',alertSubject:'Codex 有新的重置動態',alertTitle:'新的 Codex 重置動態',source:'查看 X 原文',unsubscribe:'取消郵件提醒'},
  ja:{confirmSubject:'Codex Resets メール通知を確認',confirmTitle:'メール通知を確認',confirmText:'下のボタンで購読を確認してください。新しいリセットの兆候、予告、展開状況、完了確認をメールでお知らせします。',confirmAction:'通知を確認',alertSubject:'Codexリセットの新しい更新',alertTitle:'Codexリセットの新しい更新',source:'Xの原文を開く',unsubscribe:'メール通知を解除'},
  ko:{confirmSubject:'Codex Resets 이메일 알림 확인',confirmTitle:'이메일 알림 확인',confirmText:'아래 버튼을 눌러 구독을 확인하세요. 새로운 재설정 신호, 예고, 배포 진행 또는 완료 소식이 있으면 이메일로 알려드립니다.',confirmAction:'알림 확인',alertSubject:'새로운 Codex 재설정 소식',alertTitle:'새로운 Codex 재설정 소식',source:'X 원문 열기',unsubscribe:'이메일 알림 해지'},
  en:{confirmSubject:'Confirm your Codex Resets alerts',confirmTitle:'Confirm email alerts',confirmText:'Confirm your subscription below. We will email you when a new reset signal, announcement, rollout or completion update appears.',confirmAction:'Confirm alerts',alertSubject:'New Codex reset update',alertTitle:'New Codex reset update',source:'Open the X post',unsubscribe:'Unsubscribe'}
})[lang]||({confirmSubject:'Confirm your Codex Resets alerts',confirmTitle:'Confirm email alerts',confirmText:'Confirm your subscription below. We will email you when a new reset update appears.',confirmAction:'Confirm alerts',alertSubject:'New Codex reset update',alertTitle:'New Codex reset update',source:'Open the X post',unsubscribe:'Unsubscribe'});}
async function sendEmail(env,{to,subject,text,html}){
  if(!env.SES_ACCESS_KEY_ID||!env.SES_SECRET_ACCESS_KEY||!env.EMAIL_FROM)throw new NotifyError('email_unavailable',503);
  const region=env.SES_REGION||'us-east-1',aws=new AwsClient({accessKeyId:env.SES_ACCESS_KEY_ID,secretAccessKey:env.SES_SECRET_ACCESS_KEY,region,service:'ses'});
  const response=await aws.fetch(`https://email.${region}.amazonaws.com/v2/email/outbound-emails`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({FromEmailAddress:env.EMAIL_FROM,Destination:{ToAddresses:[to]},Content:{Simple:{Subject:{Data:subject,Charset:'UTF-8'},Body:{Text:{Data:text,Charset:'UTF-8'},Html:{Data:html,Charset:'UTF-8'}}}}})});
  if(!response.ok)throw new NotifyError('email_delivery_failed',502);
}
export async function requestEmailSubscription(env,request,origin){
  await rateLimit(env,request,'email',5);const body=await jsonBody(request),email=String(body.email||'').trim().toLowerCase(),lang=langOf(body.lang);
  if(!validEmail(email))throw new NotifyError('invalid_email');
  const emailHash=await digest(email),cooldown=`notify:email:cooldown:${emailHash}`;
  if(await env.RESETS.get(cooldown))return {ok:true,pending:true};
  const token=randomToken(),tokenHash=await digest(token);
  await env.RESETS.put(`notify:pending:${tokenHash}`,JSON.stringify({channel:'email',email,lang}),{expirationTtl:86400});
  await env.RESETS.put(cooldown,'1',{expirationTtl:900});
  const words=emailWords(lang),confirmUrl=`${origin}/api/notify/confirm?token=${token}`;
  try{await sendEmail(env,{to:email,subject:words.confirmSubject,text:`${words.confirmText}\n\n${confirmUrl}`,html:`<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;padding:32px;color:#302b49"><h1 style="font-size:24px">${words.confirmTitle}</h1><p style="line-height:1.7">${words.confirmText}</p><p><a href="${escape(confirmUrl)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#6255c7;color:#fff;text-decoration:none;font-weight:700">${words.confirmAction}</a></p><p style="font-size:12px;color:#777">CodexResets.net</p></div>`});}catch(error){await Promise.all([env.RESETS.delete?.(`notify:pending:${tokenHash}`),env.RESETS.delete?.(cooldown)]);throw error;}
  return {ok:true,pending:true};
}
export async function confirmEmailSubscription(env,token){
  if(typeof token!=='string'||!/^\w{32,128}$/.test(token))throw new NotifyError('invalid_token');
  const pendingKey=`notify:pending:${await digest(token)}`,pending=await env.RESETS.get(pendingKey,'json');
  if(!pending||pending.channel!=='email'||!validEmail(pending.email))throw new NotifyError('invalid_token',404);
  const id=await digest(pending.email),key=`notify:subscriber:email:${id}`,unsubscribe=randomToken();
  await Promise.all([env.RESETS.put(key,JSON.stringify({channel:'email',email:pending.email,lang:langOf(pending.lang),createdAt:new Date().toISOString()})),env.RESETS.put(`notify:unsubscribe:${await digest(unsubscribe)}`,key),env.RESETS.delete?.(pendingKey)]);
  return {ok:true,channel:'email',lang:langOf(pending.lang),unsubscribeToken:unsubscribe};
}
export async function unsubscribe(env,token){
  if(typeof token!=='string'||!/^\w{32,128}$/.test(token))throw new NotifyError('invalid_token');
  const mapKey=`notify:unsubscribe:${await digest(token)}`,subscriberKey=await env.RESETS.get(mapKey);
  if(!subscriberKey?.startsWith('notify:subscriber:'))throw new NotifyError('invalid_token',404);
  await Promise.all([env.RESETS.delete(subscriberKey),env.RESETS.delete(mapKey)]);return {ok:true};
}
export async function requestWebhookSubscription(env,request,fetcher=fetch){
  await rateLimit(env,request,'webhook',5);const body=await jsonBody(request),url=validateWebhookUrl(body.url),lang=langOf(body.lang),challenge=randomToken(16),secret=randomToken();
  const payload=JSON.stringify({type:'codexresets.verification',challenge,site:'https://codexresets.net'}),signature=await hmac(secret,payload);
  let response;try{response=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'CodexResets-Webhook/1.0','X-CodexResets-Signature':`sha256=${signature}`},body:payload,redirect:'error',signal:AbortSignal.timeout(8000)});}catch{throw new NotifyError('webhook_verification_failed',422);}
  let reply;try{reply=await response.json();}catch{reply=null;}if(!response.ok||reply?.challenge!==challenge)throw new NotifyError('webhook_verification_failed',422);
  const id=await digest(url),key=`notify:subscriber:webhook:${id}`,unsubscribeToken=randomToken();
  await Promise.all([env.RESETS.put(key,JSON.stringify({channel:'webhook',url,secret,lang,createdAt:new Date().toISOString()})),env.RESETS.put(`notify:unsubscribe:${await digest(unsubscribeToken)}`,key)]);
  return {ok:true,channel:'webhook',secret,unsubscribeToken};
}
export async function telegramConfig(env){return {enabled:Boolean(env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_BOT_USERNAME&&env.TELEGRAM_WEBHOOK_SECRET),username:env.TELEGRAM_BOT_USERNAME||null};}
export async function requestTelegramConnection(env,request){
  await rateLimit(env,request,'telegram',10);const config=await telegramConfig(env);if(!config.enabled)throw new NotifyError('telegram_unavailable',503);
  const body=await jsonBody(request),token=randomToken(12);await env.RESETS.put(`notify:telegram:pending:${await digest(token)}`,JSON.stringify({lang:langOf(body.lang)}),{expirationTtl:1800});
  return {ok:true,url:`https://t.me/${config.username}?start=${token}`};
}
async function telegramSend(env,chatId,text){const response=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,text,disable_web_page_preview:true}),signal:AbortSignal.timeout(10000)});if(!response.ok)throw new NotifyError('telegram_delivery_failed',502);}
export async function handleTelegramUpdate(env,request){
  if(!env.TELEGRAM_WEBHOOK_SECRET||request.headers.get('X-Telegram-Bot-Api-Secret-Token')!==env.TELEGRAM_WEBHOOK_SECRET)throw new NotifyError('forbidden',403);
  const body=await jsonBody(request),message=body.message,text=String(message?.text||''),chatId=message?.chat?.id;
  if(!chatId)return {ok:true};
  if(text==='/stop'){const key=`notify:subscriber:telegram:${await digest(String(chatId))}`,subscriber=await env.RESETS.get(key,'json'),messages={zh:'Codex Resets 提醒已关闭。','zh-Hant':'Codex Resets 提醒已關閉。',ja:'Codex Resetsの通知を解除しました。',ko:'Codex Resets 알림을 껐습니다.',en:'Codex Resets notifications are off.'};await env.RESETS.delete(key);await telegramSend(env,chatId,messages[subscriber?.lang]||messages.en);return {ok:true};}
  const match=text.match(/^\/start\s+([a-f0-9]{24})$/i);if(!match){await telegramSend(env,chatId,'Open CodexResets.net and use the Telegram button to connect alerts.');return {ok:true};}
  const pendingKey=`notify:telegram:pending:${await digest(match[1])}`,pending=await env.RESETS.get(pendingKey,'json');if(!pending){await telegramSend(env,chatId,'This connection link expired. Please create a new one on CodexResets.net.');return {ok:true};}
  const confirmations={zh:'已开启 Codex 重置提醒。发送 /stop 可随时关闭。','zh-Hant':'已開啟 Codex 重置提醒。傳送 /stop 可隨時關閉。',ja:'Codexリセット通知を有効にしました。/stop でいつでも解除できます。',ko:'Codex 재설정 알림을 켰습니다. /stop으로 언제든 해지할 수 있습니다.',en:'Codex reset alerts are on. Send /stop at any time to unsubscribe.'};await env.RESETS.put(`notify:subscriber:telegram:${await digest(String(chatId))}`,JSON.stringify({channel:'telegram',chatId:String(chatId),lang:langOf(pending.lang),createdAt:new Date().toISOString()}));await env.RESETS.delete(pendingKey);await telegramSend(env,chatId,confirmations[pending.lang]||confirmations.en);return {ok:true};
}
const eventText=(event,lang)=>localizedSummary(event,lang);
async function deliver(env,subscriber,event,subscriberKey){
  const lang=langOf(subscriber.lang),summary=eventText(event,lang),source=event.source,origin='https://codexresets.net';
  if(subscriber.channel==='email'){
    const words=emailWords(lang),unsubscribeToken=randomToken(),mapKey=`notify:unsubscribe:${await digest(unsubscribeToken)}`;await env.RESETS.put(mapKey,subscriberKey);
    const unsubscribeUrl=`${origin}/api/notify/unsubscribe?token=${unsubscribeToken}`;
    await sendEmail(env,{to:subscriber.email,subject:words.alertSubject,text:`${summary}\n\n${source}\n\n${words.unsubscribe}: ${unsubscribeUrl}`,html:`<div style="font-family:system-ui,sans-serif;max-width:600px;margin:auto;padding:32px;color:#302b49"><h1 style="font-size:22px">${words.alertTitle}</h1><p style="font-size:16px;line-height:1.7">${escape(summary)}</p><p><a href="${escape(source)}" style="color:#6255c7;font-weight:700">${words.source}</a></p><p style="margin-top:32px;font-size:11px"><a href="${escape(unsubscribeUrl)}" style="color:#777">${words.unsubscribe}</a></p></div>`});
  }else if(subscriber.channel==='webhook'){
    const payload=JSON.stringify({type:'codexresets.reset_update',createdAt:new Date().toISOString(),event:{id:event.id,state:event.state,kind:event.kind,summary,announcedAt:event.announcedAt,sourceUrl:source}}),signature=await hmac(subscriber.secret,payload),response=await fetch(subscriber.url,{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'CodexResets-Webhook/1.0','X-CodexResets-Event':event.id,'X-CodexResets-Signature':`sha256=${signature}`},body:payload,redirect:'error',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new NotifyError('webhook_delivery_failed',502);
  }else if(subscriber.channel==='telegram'){const titles={zh:'Codex 重置动态','zh-Hant':'Codex 重置動態',ja:'Codexリセット更新',ko:'Codex 재설정 소식',en:'Codex reset update'};await telegramSend(env,subscriber.chatId,`${titles[lang]||titles.en}\n\n${summary}\n\n${source}`);}
}
export function changedEvents(previous,next){const before=new Map((previous.events||[]).map(event=>[event.id,event.state]));return (next.events||[]).filter(event=>eventStates.has(event.state)&&before.get(event.id)!==event.state);}
export async function dispatchNotifications(env,previous,next){
  const events=changedEvents(previous,next);if(!events.length||typeof env.RESETS.list!=='function')return {events:0,deliveries:0};
  let cursor,keys=[];do{const page=await env.RESETS.list({prefix:'notify:subscriber:',cursor,limit:500});keys.push(...page.keys.map(item=>item.name));cursor=page.list_complete?undefined:page.cursor;}while(cursor&&keys.length<2000);
  let deliveries=0;for(const event of events)for(const key of keys){const marker=`notify:delivered:${event.id}:${await digest(key)}`;if(await env.RESETS.get(marker))continue;try{const subscriber=await env.RESETS.get(key,'json');if(!subscriber)continue;await deliver(env,subscriber,event,key);await env.RESETS.put(marker,'1',{expirationTtl:31536000});deliveries++;}catch(error){console.error('notification_delivery_failed',{eventId:event.id,channel:key.split(':')[2],code:error?.code||'unknown'});}}
  return {events:events.length,deliveries};
}
