import fallback from '../src/data/snapshot.json';
import {collectX,XError} from '../src/lib/x-collector.js';
import {collectXPublic,cleanPublicPostText} from '../src/lib/x-public-collector.js';
import {apiDocument,openAPI} from '../src/lib/api.js';
import {renderTracker} from '../src/lib/tracker.js';
import {rssResponse} from '../src/lib/rss.js';

export async function synchronize(env,fetcher=fetch){
  const previous=await env.RESETS.get('state','json')||fallback;
  let next,officialError;
  try{if(env.X_BEARER_TOKEN)next=await collectX(previous,env.X_BEARER_TOKEN,fetcher);}catch(error){officialError=error;}
  try{
    if(!next)next=await collectXPublic(previous,env.BROWSER);
    await env.RESETS.put('state',JSON.stringify(next));
    await env.RESETS.put('health',JSON.stringify({state:'connected',method:next.collectorMethod||'x_api',attemptedAt:next.lastAttemptAt,officialApi:officialError instanceof XError?officialError.code:undefined}));
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
const apiHeaders={...securityHeaders,'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS','Cache-Control':'public, max-age=60, s-maxage=300'};
const json=(body,status=200)=>Response.json(body,{status,headers:apiHeaders});

export default {
  async scheduled(_event,env,ctx){if(env.COLLECTOR_ENABLED==='true')ctx.waitUntil(synchronize(env));},
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.hostname==='www.codexresets.net'){url.hostname='codexresets.net';return Response.redirect(url,308);}
    if(url.pathname.startsWith('/api/')&&request.method==='OPTIONS')return new Response(null,{status:204,headers:apiHeaders});
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD',...securityHeaders}});
    if(url.pathname==='/api/'||url.pathname==='/api')return env.ASSETS.fetch(request);
    const dynamic=['/','/zh/','/api/status','/api/v1/status','/api/v1/events','/api/v1/posts','/api/v1/openapi.json','/feed.xml','/zh/feed.xml'];
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
    }else if(url.pathname.endsWith('feed.xml'))response=rssResponse(view,url.pathname.startsWith('/zh/')?'zh':'en');
    else response=new HTMLRewriter().on('#tracker',{element(element){element.setInnerContent(renderTracker(view,url.pathname==='/zh/'?'zh':'en'),{html:true});}}).transform(await env.ASSETS.fetch(request));
    response=new Response(response.body,response);
    Object.entries(url.pathname.startsWith('/api/')?apiHeaders:securityHeaders).forEach(([key,value])=>response.headers.set(key,value));
    if(!url.pathname.startsWith('/api/'))response.headers.set('Cache-Control','public, max-age=30');
    return request.method==='HEAD'?new Response(null,response):response;
  }
};
