import copy from '../data/copy.json';
export const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function sourceURL(source){
  try{const u=new URL(typeof source==='string'?source:source?.url);return u.protocol==='https:'&&['x.com','twitter.com'].includes(u.hostname)&&/^\/thsottiaux(?:\/status\/\d+)?\/?$/.test(u.pathname)?u.href:'https://x.com/thsottiaux';}catch{return 'https://x.com/thsottiaux';}
}
export function dateLabel(date,lang){return date&&Number.isFinite(Date.parse(date))?new Intl.DateTimeFormat(lang==='zh'?'zh-CN':'en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(date))+' UTC':'—';}
export function elapsedLabel(date,lang,now=Date.now()){
  const elapsed=Math.max(0,now-Date.parse(date));
  const days=Math.floor(elapsed/86400000),hours=Math.floor(elapsed%86400000/3600000);
  if(days)return lang==='zh'?`${days} 天 ${hours} 小时`:`${days}d ${hours}h`;
  const minutes=Math.max(1,Math.floor(elapsed/60000));
  return lang==='zh'?`${hours} 小时 ${minutes%60} 分钟`:`${hours}h ${minutes%60}m`;
}
export function renderTracker(data,lang='en',now=Date.now()){
  const t=copy[lang],events=data.events||[],live=data.collectorState==='connected',fresh=live&&data.lastSuccessAt&&now-Date.parse(data.lastSuccessAt)<900000;
  const sourceLink=event=>`<a href="${escape(sourceURL(event.source))}" target="_blank" rel="noopener noreferrer">${t.original} ↗</a>`;
  const row=(event,index)=>{
    const date=new Date(event.announcedAt);
    const day=Number.isFinite(date.getTime())?String(date.getUTCDate()).padStart(2,'0'):'—';
    const month=Number.isFinite(date.getTime())?new Intl.DateTimeFormat(lang==='zh'?'zh-CN':'en-GB',{month:'short',year:'numeric',timeZone:'UTC'}).format(date):'';
    return `<article class="message-row" id="event-${escape(event.id)}" data-kind="${escape(event.state)}" data-index="${index}">
      <div class="date-block" aria-hidden="true"><strong>${day}</strong><span>${month}</span></div>
      <div class="message-body"><div class="message-heading"><span class="type-tag ${escape(event.state)}">${t[event.state]}</span><time datetime="${escape(event.announcedAt)}">${dateLabel(event.announcedAt,lang)}</time></div>
      <p class="summary">${escape(event.summary?.[lang]||event.text)}</p>
      <details class="message-details" id="detail-${escape(event.id)}"><summary>${t.readMore}<span aria-hidden="true">＋</span></summary><div class="detail-content">
      <span class="excerpt-label">${event.excerpt?t.excerptLabel:t.original}</span><blockquote lang="en">${escape(event.text)}</blockquote>
      ${event.timingText?`<p>${t.scheduledTime}: ${escape(event.timingText)}</p>`:''}
      ${event.relatedPostIds.length?`<div class="related-posts">${event.relatedPostIds.map((id,i)=>`<a href="${escape(sourceURL('https://x.com/thsottiaux/status/'+id))}" target="_blank" rel="noopener noreferrer">${t.related}${event.relatedPostIds.length>1?' '+(i+1):''} ↗</a>`).join(' ')}</div>`:''}
      <div class="message-meta">${sourceLink(event)}<span>${event.review==='human_reviewed'?t.sourceChecked:t.ruleLabel}</span></div></div></details></div></article>`;
  };
  const active=events.filter(e=>e.state==='announced'&&!events.some(other=>['completed','rollout'].includes(other.state)&&other.relatedPostIds.includes(e.id)));
  const completed=events.filter(e=>e.state==='completed').sort((a,b)=>Date.parse(b.announcedAt)-Date.parse(a.announcedAt));
  const lastCompleted=completed[0];
  const intervals=completed.slice(0,-1).map((event,index)=>Date.parse(event.announcedAt)-Date.parse(completed[index+1].announcedAt)).filter(value=>value>0);
  const average=intervals.length?Math.round(intervals.reduce((sum,value)=>sum+value,0)/intervals.length/86400000):null;
  const feed=lang==='zh'?'/zh/feed.xml':'/feed.xml';
  return `<section class="status-panel" aria-labelledby="status-title"><div class="status-top"><div><p>${t.headline}</p><h1 id="status-title">${t.statusHeadline}</h1></div><a class="source-profile" href="https://x.com/thsottiaux" target="_blank" rel="noopener noreferrer"><span class="author-monogram" aria-hidden="true">T</span><span><strong>Tibo</strong><span>@thsottiaux ↗</span></span></a></div>
    <div class="status-grid"><div class="last-reset"><span>${t.lastConfirmed}</span><strong>${lastCompleted?elapsedLabel(lastCompleted.announcedAt,lang,now):t.noConfirmed}</strong><time datetime="${escape(lastCompleted?.announcedAt||'')}">${lastCompleted?dateLabel(lastCompleted.announcedAt,lang):''}</time></div><div class="status-facts"><div><span>${t.nextReset}</span><strong>${active.length?t.nextAnnounced:t.noAnnouncement}</strong><small>${active.length?t.checkAnnouncement:t.noAnnouncementNote}</small></div><div><span>${t.averageInterval}</span><strong>${average!==null?`${average} ${t.days}`:t.collecting}</strong><small>${completed.length} ${t.confirmedSamples}${average!==null?` · ${t.confirmedAverage}`:''}</small></div></div></div>
    <div class="alert-box"><div><strong>${t.getNotified}</strong><span class="notify-note">${t.notifyNote}</span></div><div class="alert-actions"><button class="notify-toggle" type="button">${t.notifyAction}</button><a href="${feed}">${t.rss} ↗</a></div></div>
    <div class="status-foot"><span class="collection-mode ${fresh?'connected':''}"><i aria-hidden="true"></i>${fresh?t.liveMode:t.reviewMode}</span><button class="refresh" type="button">↻ ${t.refresh}</button></div></section>
    <p class="connection-warning" role="status" ${fresh?'hidden':''}>${live?t.stale:t.collectorBlocked}</p>
    ${active.length?`<section class="upcoming"><h2>${t.announced}</h2>${active.map(e=>`<p>${escape(e.summary?.[lang]||e.text)}</p>${sourceLink(e)}`).join('')}<small>${t.pendingNote}</small></section>`:''}
    <section class="message-history" id="archive"><div class="section-heading"><h2>${t.historyTitle}</h2><span>${t.historyIntro}</span></div>
    <div class="filters" role="group" aria-label="${t.filterLabel}"><button data-filter="all" aria-pressed="true">${t.all}</button>${['announced','rollout','completed','compensation','signal'].filter(state=>events.some(e=>e.state===state)).map(state=>`<button data-filter="${state}" aria-pressed="false">${t[state]}</button>`).join('')}</div>
    <div class="message-list">${events.map(row).join('')}</div><p class="empty-state" hidden>${t.empty}</p><button class="show-more" hidden>${t.more}</button></section>
    <details class="data-note" id="source-details"><summary>${t.sourceDetails}</summary><div class="freshness"><p>${live?t.sync:t.manualReview} <time datetime="${escape(data.lastSuccessAt||data.lastReviewAt||'')}">${dateLabel(data.lastSuccessAt||data.lastReviewAt,lang)}</time></p></div><p>${t.partial}</p><p>${t.provenance} <a href="https://x.com/thsottiaux" target="_blank" rel="noopener noreferrer">@thsottiaux ↗</a></p><p>${t.liveNote}</p></details>`;
}
