import fallback from '../src/data/snapshot.json';
import {collectX,XError} from '../src/lib/x-collector.js';
import {renderTracker} from '../src/lib/tracker.js';
import {rssResponse} from '../src/lib/rss.js';
export async function synchronize(env,fetcher=fetch){
  const previous=await env.RESETS.get('state','json')||fallback;
  try{
    const next=await collectX(previous,env.X_BEARER_TOKEN,fetcher);
    await env.RESETS.put('state',JSON.stringify(next));
    await env.RESETS.put('health',JSON.stringify({state:'connected',attemptedAt:next.lastAttemptAt}));
    return next;
  }catch(error){
    const code=error instanceof XError?error.code:'source_unavailable';
    await env.RESETS.put('health',JSON.stringify({state:'error',code,attemptedAt:new Date().toISOString()}));
    throw new XError(code);
  }
}
export function publicState(data,health){
  return {version:1,events:data.events,lastSuccessAt:data.lastSuccessAt,lastReviewAt:data.lastReviewAt,coverage:data.coverage,collectorState:health?.state==='error'?'error':data.collectorState};
}
const headers={'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin'};
export default {
  async scheduled(_event,env,ctx){
    if(env.COLLECTOR_ENABLED!=='true')return;
    const health=await env.RESETS.get('health','json');
    // Stop automatic retries on account failures; operator re-enables after validating access.
    if(['invalid_credentials','credits_required','access_denied'].includes(health?.code))return;
    ctx.waitUntil(synchronize(env));
  },
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD',...headers}});
    if(!['/','/zh/','/api/status','/feed.xml','/zh/feed.xml'].includes(url.pathname))return env.ASSETS.fetch(request);
    let data=fallback,health;
    try{data=await env.RESETS.get('state','json')||fallback;health=await env.RESETS.get('health','json');}catch{health={state:'error'};}
    const view=publicState(data,health);
    let response;
    if(url.pathname==='/api/status')response=Response.json(view);
    else if(url.pathname.endsWith('feed.xml'))response=rssResponse(view,url.pathname.startsWith('/zh/')?'zh':'en');
    else response=new HTMLRewriter().on('#tracker',{element(element){element.setInnerContent(renderTracker(view,url.pathname==='/zh/'?'zh':'en'),{html:true});}}).transform(await env.ASSETS.fetch(request));
    response=new Response(response.body,response);
    Object.entries(headers).forEach(([k,v])=>response.headers.set(k,v));
    response.headers.set('Cache-Control','public, max-age=30');
    return request.method==='HEAD'?new Response(null,response):response;
  }
};
