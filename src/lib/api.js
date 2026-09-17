const states=new Set(['announced','rollout','completed','signal','compensation']);
const safeSource=value=>{try{const url=new URL(value);return url.protocol==='https:'&&['x.com','twitter.com'].includes(url.hostname)&&/^\/thsottiaux\/status\/\d{10,25}\/?$/.test(url.pathname)?url.href:null;}catch{return null;}};
const safeEvent=event=>({
  id:String(event.id),
  state:states.has(event.state)?event.state:'signal',
  kind:event.kind==='banked'?'banked':'regular',
  summary:event.summary&&typeof event.summary==='object'?{en:String(event.summary.en||''),zh:String(event.summary.zh||'')} : null,
  sourceText:String(event.text||''),
  announcedAt:String(event.announcedAt||''),
  sourceUrl:safeSource(event.source),
  relatedPostIds:Array.isArray(event.relatedPostIds)?event.relatedPostIds.map(String):[],
  review:event.review==='human_reviewed'?'human_reviewed':'rule_classified'
});
export function apiDocument(data){
  const events=(data.events||[]).map(safeEvent);
  const posts=(data.posts||[]).filter(post=>post?.authorId==='1953337039510003712'&&/^\d{10,25}$/.test(post.id)&&typeof post.text==='string'&&Number.isFinite(Date.parse(post.createdAt))).map(post=>({id:post.id,text:post.text,createdAt:post.createdAt,sourceUrl:`https://x.com/thsottiaux/status/${post.id}`,resetEvent:events.some(event=>event.id===post.id)}));
  const completed=events.filter(event=>event.state==='completed').sort((a,b)=>Date.parse(b.announcedAt)-Date.parse(a.announcedAt));
  const pending=events.find(event=>event.state==='announced'&&!events.some(other=>['completed','rollout'].includes(other.state)&&other.relatedPostIds.includes(event.id)))||null;
  const intervals=completed.slice(0,-1).map((event,index)=>Date.parse(event.announcedAt)-Date.parse(completed[index+1].announcedAt)).filter(value=>value>0);
  return {apiVersion:'1.0',generatedAt:data.lastSuccessAt||data.lastReviewAt||null,source:{account:'@thsottiaux',url:'https://x.com/thsottiaux',collection:data.collectorMethod||'browser_review',coverage:data.coverage||'partial'},status:{lastConfirmedReset:completed[0]||null,pendingAnnouncement:pending,confirmedResetCount:completed.length,averageIntervalSeconds:intervals.length?Math.round(intervals.reduce((sum,value)=>sum+value,0)/intervals.length/1000):null},events,posts};
}
export function openAPI(origin='https://codexresets.net'){
  return {openapi:'3.1.0',info:{title:'Codex Resets API',version:'1.0.0',description:'Public reset announcements and captured posts from Tibo’s public X profile.'},servers:[{url:origin}],paths:{'/api/v1/status':{get:{summary:'Current reset status',responses:{200:{description:'Current status'}}}},'/api/v1/events':{get:{summary:'Reset event archive',responses:{200:{description:'Event list'}}}},'/api/v1/posts':{get:{summary:'Captured public posts',responses:{200:{description:'Post list'}}}},'/api/v1/events/{id}':{get:{summary:'One reset event',parameters:[{name:'id',in:'path',required:true,schema:{type:'string',pattern:'^[0-9]{10,25}$'}}],responses:{200:{description:'Event'},404:{description:'Not found'}}}}}};
}
