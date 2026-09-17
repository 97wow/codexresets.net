import {AUTHOR,AUTHOR_ID,XError,deriveEvents,mergePosts} from './x-collector.js';

const statusPattern=new RegExp(`https://x\\.com/${AUTHOR}/status/(\\d{10,25})`,'g');
const decodeMarkdown=value=>value
  .replace(/\\([\\_*\[\]()~`>#+\-=|{}.!])/g,'$1')
  .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
  .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();

export function createdAtFromSnowflake(id){
  if(!/^\d{10,25}$/.test(id))throw new XError('invalid_post');
  const milliseconds=(BigInt(id)>>22n)+1288834974657n;
  const date=new Date(Number(milliseconds));
  if(!Number.isFinite(date.getTime()))throw new XError('invalid_post');
  return date.toISOString();
}

export function parsePublicTimeline(markdown,now=new Date().toISOString()){
  if(typeof markdown!=='string'||markdown.length<100||markdown.length>2_000_000)throw new XError('invalid_response');
  const posts=[];
  const items=markdown.split(/\n- (?=\[!\[@thsottiaux\])/);
  for(const item of items){
    statusPattern.lastIndex=0;
    const match=statusPattern.exec(item);
    if(!match)continue;
    const [link,id]=match;
    let text=item.slice(match.index+link.length+1);
    const engagement=text.indexOf(`](https://x.com/i/status/${id})`);
    if(engagement>=0)text=text.slice(0,text.lastIndexOf('[',engagement));
    const quote=text.search(/\s\[!\[@/);
    const media=text.search(/\s\[!\[.*?\]\(https:\/\/pbs\.twimg\.com\/media\//);
    const cut=[quote,media].filter(value=>value>=0).sort((a,b)=>a-b)[0];
    if(cut!==undefined)text=text.slice(0,cut);
    text=decodeMarkdown(text);
    if(!text||text.length>100000)continue;
    posts.push({id,authorId:AUTHOR_ID,text,createdAt:createdAtFromSnowflake(id),url:`https://x.com/${AUTHOR}/status/${id}`,references:[],edits:[id],collectedAt:now,method:'browser_rendering'});
  }
  return [...new Map(posts.map(post=>[post.id,post])).values()];
}

export async function collectXPublic(previous,browser){
  if(!browser?.quickAction)throw new XError('browser_unavailable');
  let result,markdown;
  try{
    result=await browser.quickAction('markdown',{url:`https://x.com/${AUTHOR}`,gotoOptions:{waitUntil:'domcontentloaded',timeout:30000},waitForSelector:{selector:'article',timeout:15000},waitForTimeout:750});
    if(result instanceof Response){
      if(!result.ok)throw new XError(result.status===429?'rate_limited':'source_unavailable',result.status);
      const body=await result.json();
      if(body?.success!==true)throw new XError('invalid_response');
      markdown=body.result;
    }else markdown=typeof result==='string'?result:result?.result;
  }catch{throw new XError('source_unavailable');}
  const received=parsePublicTimeline(markdown);
  if(!received.length)throw new XError('invalid_response');
  const posts=mergePosts(previous.posts||[],received);
  const now=new Date().toISOString();
  return {...previous,version:1,posts,events:deriveEvents(posts),lastAttemptAt:now,lastSuccessAt:now,collectorState:'connected',collectorMethod:'browser_rendering',error:null,source:`https://x.com/${AUTHOR}`,coverage:'partial'};
}
