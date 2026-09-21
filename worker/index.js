import fallback from '../src/data/snapshot.json';
import {collectX,XError} from '../src/lib/x-collector.js';
import {collectXPublic,cleanPublicPostText} from '../src/lib/x-public-collector.js';
import {apiDocument,openAPI} from '../src/lib/api.js';
import {renderTracker} from '../src/lib/tracker.js';
import {rssResponse} from '../src/lib/rss.js';
import {communityStats,recordBeg,recordVisit} from '../src/lib/community.js';
import {NotifyError,confirmEmailSubscription,dispatchNotifications,handleTelegramUpdate,requestEmailSubscription,requestTelegramConnection,requestWebhookSubscription,telegramConfig,unsubscribe} from '../src/lib/notifications.js';
import {localeBase,locales} from '../src/lib/i18n.js';

export async function synchronize(env,fetcher=fetch){
  const previous=await env.RESETS.get('state','json')||fallback;
  let next,officialError;
  try{if(env.X_BEARER_TOKEN)next=await collectX(previous,env.X_BEARER_TOKEN,fetcher);}catch(error){officialError=error;}
  try{
    if(!next)next=await collectXPublic(previous,env.BROWSER);
    await env.RESETS.put('state',JSON.stringify(next));
    await env.RESETS.put('health',JSON.stringify({state:'connected',method:next.collectorMethod||'x_api',attemptedAt:next.lastAttemptAt,officialApi:officialError instanceof XError?officialError.code:undefined}));
    try{await dispatchNotifications(env,previous,next);}catch(error){console.error('notification_dispatch_failed',{code:error?.code||'unknown'});}
    return next;
  }catch(error){
    const sourceError=error instanceof XError&&error.code!=='browser_unavailable'?error:officialError||error;
    const code=sourceError instanceof XError?sourceError.code:'source_unavailable';
    await env.RESETS.put('health',JSON.stringify({state:'error',code,attemptedAt:new Date().toISOString()}));
    throw new XError(code);
  }
}
export function publicState(data,health){
  const posts=(data.posts||[]).filter(post=>post?.authorId==='1953337039510003712'&&/^\d{10,25}$/.test(post.id)&&typeof post.text==='string'&&post.text.length<=100000&&Number.isFinite(Date.parse(post.createdAt))).map(post=>({id:post.id,text:cleanPublicPostText(post.text),createdAt:post.createdAt,url:`https://x.com/thsottiaux/status/${post.id}`}));
  return {version:1,events:data.events,posts,lastSuccessAt:data.lastSuccessAt,lastReviewAt:data.lastReviewAt,coverage:data.coverage,collectorMethod:health?.method||data.collectorMethod||null,collectorState:health?.state==='error'?'error':data.collectorState};
}
const securityHeaders={'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin'};
const apiHeaders={...securityHeaders,'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Cache-Control':'public, max-age=60, s-maxage=300'};
const json=(body,status=200)=>Response.json(body,{status,headers:apiHeaders});
const allowedMutation=request=>{const origin=request.headers.get('Origin');return !origin||origin===new URL(request.url).origin;};
const notifyResponse=(body,status=200)=>{const response=json(body,status);response.headers.set('Cache-Control','no-store');return response;};
const confirmationPage=token=>{const safe=/^[a-f0-9]{32,128}$/i.test(token||'')?token:'';return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Confirm Codex Resets alerts</title><style>body{font-family:system-ui,sans-serif;background:#f5f3ff;color:#302b49;display:grid;place-items:center;min-height:100vh;margin:0}.card{width:min(460px,calc(100% - 40px));background:#fff;border-radius:22px;padding:30px;box-shadow:0 20px 60px #554a9425}h1{font-size:24px}p{line-height:1.7;color:#6f6980}button{border:0;border-radius:11px;padding:12px 18px;background:#6255c7;color:#fff;font-weight:700;cursor:pointer}</style><main class="card"><h1>Confirm reset alerts</h1><p>确认开启 Codex Resets 邮件提醒。邮件安全扫描器访问此页面不会自动完成订阅。</p><form method="post" action="/api/notify/confirm"><input type="hidden" name="token" value="${safe}"><button type="submit">Confirm · 确认订阅</button></form></main>`,{status:safe?200:400,headers:{...securityHeaders,'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});};
const unsubscribePage=token=>{const safe=/^[a-f0-9]{32,128}$/i.test(token||'')?token:'';return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Turn off Codex Resets alerts</title><style>body{font-family:system-ui,sans-serif;background:#fff9df;color:#302b49;display:grid;place-items:center;min-height:100vh;margin:0}.card{width:min(460px,calc(100% - 40px));background:#fff;border-radius:22px;padding:30px;box-shadow:0 20px 60px #554a9425}h1{font-size:24px}p{line-height:1.7;color:#6f6980}button{border:0;border-radius:11px;padding:12px 18px;background:#6255c7;color:#fff;font-weight:700;cursor:pointer}</style><main class="card"><h1>Turn off alerts</h1><p>确认取消 Codex Resets 邮件提醒。仅打开此页面不会取消订阅。</p><form method="post" action="/api/notify/unsubscribe"><input type="hidden" name="token" value="${safe}"><button type="submit">Unsubscribe · 取消提醒</button></form></main>`,{status:safe?200:400,headers:{...securityHeaders,'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});};

export default {
  async scheduled(_event,env,ctx){if(env.COLLECTOR_ENABLED==='true')ctx.waitUntil(synchronize(env));},
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.hostname==='www.codexresets.net'){url.hostname='codexresets.net';return Response.redirect(url,308);}
    if(url.pathname.startsWith('/api/')&&request.method==='OPTIONS')return new Response(null,{status:204,headers:apiHeaders});
    if(url.pathname.startsWith('/api/notify/')){
      try{
        let result;
        if(url.pathname==='/api/notify/config'&&request.method==='GET')result={ok:true,channels:{browser:true,email:Boolean(env.SES_ACCESS_KEY_ID&&env.SES_SECRET_ACCESS_KEY&&env.EMAIL_FROM),webhook:true,telegram:await telegramConfig(env),rss:true}};
        else if(url.pathname==='/api/notify/email'&&request.method==='POST'){if(!allowedMutation(request))throw new NotifyError('forbidden',403);result=await requestEmailSubscription(env,request,url.origin);}
        else if(url.pathname==='/api/notify/webhook'&&request.method==='POST'){if(!allowedMutation(request))throw new NotifyError('forbidden',403);result=await requestWebhookSubscription(env,request);}
        else if(url.pathname==='/api/notify/telegram/connect'&&request.method==='POST'){if(!allowedMutation(request))throw new NotifyError('forbidden',403);result=await requestTelegramConnection(env,request);}
        else if(url.pathname==='/api/notify/telegram/update'&&request.method==='POST')result=await handleTelegramUpdate(env,request);
        else if(url.pathname==='/api/notify/confirm'&&request.method==='GET')return confirmationPage(url.searchParams.get('token'));
        else if(url.pathname==='/api/notify/confirm'&&request.method==='POST'){if(!allowedMutation(request))throw new NotifyError('forbidden',403);const form=await request.formData();result=await confirmEmailSubscription(env,form.get('token'));return Response.redirect(`${url.origin}${localeBase(result.lang)}?notify=email-confirmed`,303);}
        else if(url.pathname==='/api/notify/unsubscribe'&&request.method==='GET')return unsubscribePage(url.searchParams.get('token'));
        else if(url.pathname==='/api/notify/unsubscribe'&&request.method==='POST'){if(!allowedMutation(request))throw new NotifyError('forbidden',403);const form=await request.formData();await unsubscribe(env,form.get('token'));return Response.redirect(`${url.origin}/?notify=unsubscribed`,303);}
        else return notifyResponse({error:'not_found'},404);
        return notifyResponse(result);
      }catch(error){const status=error instanceof NotifyError?error.status:500,code=error instanceof NotifyError?error.code:'notification_error';if(status>=500)console.error('notification_api_error',{path:url.pathname,code});return notifyResponse({error:code},status);}
    }
    if(url.pathname.startsWith('/api/community/')){
      if(!['GET','POST','HEAD'].includes(request.method))return json({error:'method_not_allowed'},405);
      if(request.method==='POST'&&!allowedMutation(request))return json({error:'forbidden'},403);
      let data=fallback;try{data=await env.RESETS.get('state','json')||fallback;}catch{}
      try{
        const result=url.pathname==='/api/community/stats'?await communityStats(env,data,request):url.pathname==='/api/community/visit'&&request.method==='POST'?await recordVisit(env,data,request):url.pathname==='/api/community/beg'&&request.method==='POST'?await recordBeg(env,data,request):null;
        if(!result)return json({error:'not_found'},404);
        const response=json(result);response.headers.set('Cache-Control','no-store');return request.method==='HEAD'?new Response(null,response):response;
      }catch(error){console.error('community_stats_error',error);return json({error:'stats_unavailable'},503);}
    }
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD',...securityHeaders}});
    if(url.pathname==='/api/'||url.pathname==='/api')return env.ASSETS.fetch(request);
    const localizedRoutes=locales.flatMap(lang=>[localeBase(lang),`${localeBase(lang)}feed.xml`]);
    const dynamic=[...localizedRoutes,'/api/status','/api/v1/status','/api/v1/events','/api/v1/posts','/api/v1/openapi.json'];
    const eventMatch=url.pathname.match(/^\/api\/v1\/events\/(\d{10,25})$/);
    if(!dynamic.includes(url.pathname)&&!eventMatch)return env.ASSETS.fetch(request);
    let data=fallback,health;
    try{data=await env.RESETS.get('state','json')||fallback;health=await env.RESETS.get('health','json');}catch{health={state:'error'};}
    const view=publicState(data,health);
    let response;
    if(url.pathname==='/api/status')response=json(view);
    else if(url.pathname==='/api/v1/openapi.json')response=json(openAPI(url.origin));
    else if(url.pathname.startsWith('/api/v1/')){
      const document=apiDocument({...data,collectorMethod:view.collectorMethod});
      if(url.pathname==='/api/v1/status')response=json({apiVersion:document.apiVersion,generatedAt:document.generatedAt,source:document.source,status:document.status});
      else if(url.pathname==='/api/v1/events')response=json({apiVersion:document.apiVersion,generatedAt:document.generatedAt,events:document.events});
      else if(url.pathname==='/api/v1/posts')response=json({apiVersion:document.apiVersion,generatedAt:document.generatedAt,posts:document.posts});
      else {const event=document.events.find(item=>item.id===eventMatch?.[1]);response=event?json({apiVersion:document.apiVersion,event}):json({error:'not_found'},404);}
    }else if(url.pathname.endsWith('feed.xml')){const lang=locales.find(code=>url.pathname===`${localeBase(code)}feed.xml`)||'en';response=rssResponse(view,lang);}
    else {const lang=locales.find(code=>url.pathname===localeBase(code))||'en';response=new HTMLRewriter().on('#tracker',{element(element){element.setInnerContent(renderTracker(view,lang),{html:true});}}).transform(await env.ASSETS.fetch(request));}
    response=new Response(response.body,response);
    Object.entries(url.pathname.startsWith('/api/')?apiHeaders:securityHeaders).forEach(([key,value])=>response.headers.set(key,value));
    if(!url.pathname.startsWith('/api/'))response.headers.set('Cache-Control','public, max-age=30');
    return request.method==='HEAD'?new Response(null,response):response;
  }
};
