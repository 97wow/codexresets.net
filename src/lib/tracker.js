import copy from '../data/copy.json';
export const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function sourceURL(source){
  try{const u=new URL(typeof source==='string'?source:source?.url);return u.protocol==='https:'&&['x.com','twitter.com'].includes(u.hostname)&&/^\/thsottiaux(?:\/status\/\d+)?\/?$/.test(u.pathname)?u.href:'https://x.com/thsottiaux';}catch{return 'https://x.com/thsottiaux';}
}
export function dateLabel(date,lang){return date&&Number.isFinite(Date.parse(date))?new Intl.DateTimeFormat(lang==='zh'?'zh-CN':'en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(date))+' UTC':'—';}
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
  return `<div class="source-bar"><a class="source-profile" href="https://x.com/thsottiaux" target="_blank" rel="noopener noreferrer"><span class="author-monogram" aria-hidden="true">T</span><span><strong>Tibo</strong><span>@thsottiaux ↗</span></span></a><span class="collection-mode ${fresh?'connected':''}"><i aria-hidden="true"></i>${fresh?t.liveMode:t.reviewMode}</span><button class="refresh" type="button">↻ ${t.refresh}</button></div>
    <p class="connection-warning" role="status" ${fresh?'hidden':''}>${live?t.stale:t.collectorBlocked}</p>
    ${active.length?`<section class="upcoming"><h2>${t.announced}</h2>${active.map(e=>`<p>${escape(e.summary?.[lang]||e.text)}</p>${sourceLink(e)}`).join('')}<small>${t.pendingNote}</small></section>`:''}
    <section class="message-history" id="archive"><div class="section-heading"><h2>${t.historyTitle}</h2><span>${t.historyIntro}</span></div>
    <div class="filters" role="group" aria-label="${t.filterLabel}"><button data-filter="all" aria-pressed="true">${t.all}</button>${['announced','rollout','completed','compensation','signal'].filter(state=>events.some(e=>e.state===state)).map(state=>`<button data-filter="${state}" aria-pressed="false">${t[state]}</button>`).join('')}</div>
    <div class="message-list">${events.map(row).join('')}</div><p class="empty-state" hidden>${t.empty}</p><button class="show-more" hidden>${t.more}</button></section>
    <details class="data-note" id="source-details"><summary>${t.sourceDetails}</summary><div class="freshness"><p>${live?t.sync:t.manualReview} <time datetime="${escape(data.lastSuccessAt||data.lastReviewAt||'')}">${dateLabel(data.lastSuccessAt||data.lastReviewAt,lang)}</time></p></div><p>${t.partial}</p><p>${t.provenance} <a href="https://x.com/thsottiaux" target="_blank" rel="noopener noreferrer">@thsottiaux ↗</a></p><p>${t.liveNote}</p></details>`;
}
