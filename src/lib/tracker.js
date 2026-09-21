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
function calendarHeatmap(completed,lang,t,now){
  const dayMs=86400000,reference=new Date(now),end=new Date(Date.UTC(reference.getUTCFullYear(),reference.getUTCMonth(),reference.getUTCDate()));
  const start=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()-6,1));
  const alignedStart=new Date(start);alignedStart.setUTCDate(start.getUTCDate()-((start.getUTCDay()+6)%7));
  const alignedEnd=new Date(end);alignedEnd.setUTCDate(end.getUTCDate()+((7-((end.getUTCDay()+6)%7)-1)%7));
  const weeks=Math.round((alignedEnd-alignedStart)/dayMs/7)+1;
  const key=date=>date.toISOString().slice(0,10),byDay=new Map(completed.map(event=>[key(new Date(event.announcedAt)),event]));
  const cells=[];
  for(let time=alignedStart.getTime();time<=alignedEnd.getTime();time+=dayMs){
    const date=new Date(time),inRange=date>=start&&date<=end,event=inRange?byDay.get(key(date)):null;
    if(!inRange){cells.push('<span class="heat-day outside" aria-hidden="true"></span>');continue;}
    const label=new Intl.DateTimeFormat(lang==='zh'?'zh-CN':'en-GB',{dateStyle:'medium',timeZone:'UTC'}).format(date);
    if(event){const tooltipId=`calendar-tip-${escape(event.id)}`,summary=event.summary?.[lang]||event.text;cells.push(`<a class="heat-day reset-day ${event.kind==='banked'?'banked':''}" href="${escape(sourceURL(event.source))}" target="_blank" rel="noopener noreferrer" aria-label="${escape(label)}, ${t.completed}, ${t.original}" aria-describedby="${tooltipId}"><span class="calendar-tooltip" id="${tooltipId}" role="tooltip"><strong>${escape(dateLabel(event.announcedAt,lang))}</strong><b>${escape(t[event.state]||t.completed)}</b><span>${escape(summary)}</span><em>${t.original} ↗</em></span></a>`);}
    else cells.push('<span class="heat-day" aria-hidden="true"></span>');
  }
  const months=[];
  for(let month=new Date(start);month<=end;month=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,1))){const week=Math.floor((month-alignedStart)/dayMs/7)+1,label=new Intl.DateTimeFormat(lang==='zh'?'zh-CN':'en-GB',{month:'short',timeZone:'UTC'}).format(month);months.push(`<span style="grid-column:${week}/span 4">${escape(label)}</span>`);}
  const weekdays=lang==='zh'?['一','','三','','五','','']:['M','','W','','F','',''];
  return `<div class="heatmap-scroll"><div class="heatmap-board" style="--heat-weeks:${weeks}"><div class="heatmap-months">${months.join('')}</div><div class="heatmap-body"><div class="heatmap-weekdays" aria-hidden="true">${weekdays.map(day=>`<span>${day}</span>`).join('')}</div><div class="heatmap-grid">${cells.join('')}</div></div></div></div>`;
}
export function renderTracker(data,lang='en',now=Date.now()){
  const t=copy[lang],events=data.events||[],posts=(data.posts||[]).slice().sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)),live=data.collectorState==='connected',fresh=live&&data.lastSuccessAt&&now-Date.parse(data.lastSuccessAt)<900000;
  const sourceLink=event=>`<a href="${escape(sourceURL(event.source))}" target="_blank" rel="noopener noreferrer">${t.original} ↗</a>`;
  const active=events.filter(e=>e.state==='announced'&&!events.some(other=>['completed','rollout'].includes(other.state)&&other.relatedPostIds.includes(e.id)));
  const completed=events.filter(e=>e.state==='completed').sort((a,b)=>Date.parse(b.announcedAt)-Date.parse(a.announcedAt));
  const lastCompleted=completed[0];
  const intervals=completed.slice(0,-1).map((event,index)=>Date.parse(event.announcedAt)-Date.parse(completed[index+1].announcedAt)).filter(value=>value>0);
  const average=intervals.length?Math.round(intervals.reduce((sum,value)=>sum+value,0)/intervals.length/86400000):null;
  const longest=intervals.length?Math.round(Math.max(...intervals)/86400000):null;
  const metrics=`<section class="reset-metrics" aria-label="${t.metricBasis}"><article><span aria-hidden="true">↻</span><div><small>${t.resetCount}</small><strong>${completed.length}</strong></div></article><article><span aria-hidden="true">≈</span><div><small>${t.averageInterval}</small><strong>${average!==null?`${average} ${t.days}`:t.collecting}</strong></div></article><article><span aria-hidden="true">⌛</span><div><small>${t.longestWait}</small><strong>${longest!==null?`${longest} ${t.days}`:t.collecting}</strong></div></article></section>`;
  const community=`<aside class="community-card"><div class="community-art" aria-hidden="true">☁<span>✦</span></div><h2>${t.communityTitle}</h2><p>${t.communityText}</p><button class="beg-button" type="button">${t.begAction}</button><div class="beg-feedback" role="status" aria-live="polite"></div><div class="community-counts"><strong><span class="beg-total">0</span> ${t.begCount}</strong><span><span class="visitor-total">—</span> ${t.visitorCount}</span></div><div class="country-flags" aria-label="${t.begCount}"></div><small>${t.onePerIp}</small></aside>`;
  const calendar=`<div class="insight-grid"><section class="calendar-section history-calendar" id="calendar"><div class="section-heading"><div><h2>${t.calendarTitle}</h2><p>${t.calendarIntro}</p></div><div class="heatmap-legend"><span><i class="regular"></i>${t.calendarRegular}</span><span><i class="banked"></i>${t.banked}</span><span><i></i>${t.calendarNone}</span></div></div>${calendarHeatmap(completed,lang,t,now)}</section>${community}</div>`;
  const eventById=new Map(events.map(event=>[event.id,event]));
  const postCards=posts.map((post,index)=>{const event=eventById.get(post.id),displayText=String(post.text||'').replace(/\s+When you make a selection it cannot be changed.*$/i,'').trim();return `<article class="x-post-card ${index===0?'featured':''}" data-post-index="${index}" ${event?`data-event-id="${escape(event.id)}"`:''} ${index>=3?'hidden':''}><div class="x-post-top"><div class="post-author"><img class="tibo-avatar" src="/tibo.jpg" alt="" width="48" height="48"><span class="author-copy"><strong>Tibo <i class="verified" aria-label="Verified">✓</i></strong><small>@thsottiaux · ${dateLabel(post.createdAt,lang)}</small></span></div><span class="post-more" aria-hidden="true">•••</span></div><p lang="en">${escape(displayText)}</p>${event?`<div class="post-context"><span class="type-tag ${escape(event.state)}">${t[event.state]}</span><span>${escape(event.summary?.[lang]||'')}</span></div>`:''}<footer><span class="x-post-kind ${event?'reset':''}">${event?t.xResetPost:t.xGeneralPost}</span><span class="post-actions" aria-hidden="true">♡　↻　⌁</span><a href="${escape(sourceURL(post.url))}" target="_blank" rel="noopener noreferrer">${t.xOpenPost} ↗</a></footer></article>`;}).join('');
  const xStream=posts.length?`<section class="x-stream" id="posts"><div class="section-heading x-heading"><div><span class="live-spark"><i aria-hidden="true"></i>${fresh?t.xStreamFresh:t.manualReview}</span><h2>${t.xStreamTitle}</h2><p>${t.xStreamIntro}</p></div><strong>${posts.length} ${t.xCaptured}</strong></div><div class="x-post-grid">${postCards}</div>${posts.length>3?`<button class="post-show-more" type="button" aria-expanded="false">${t.morePosts} (${posts.length-3})</button>`:''}</section>`:'';
  const feed=lang==='zh'?'/zh/feed.xml':'/feed.xml',feedPage=lang==='zh'?'/zh/rss/':'/rss/';
  const notificationCenter=`<section class="notify-center" id="alerts" aria-labelledby="notify-title"><div class="notify-center-head"><span class="notify-kicker">✦ ${t.getNotified}</span><h2 id="notify-title">${t.notificationCenterTitle}</h2><p>${t.notificationCenterIntro}</p></div><div class="notify-channels">
    <article class="notify-channel browser-channel"><span class="notify-icon" aria-hidden="true">◉</span><div><h3>${t.channelBrowser}</h3><p>${t.channelBrowserDesc}</p></div><button class="notify-toggle channel-action" type="button">${t.browserAction}</button></article>
    <article class="notify-channel email-channel"><span class="notify-icon" aria-hidden="true">✉</span><div><h3>${t.channelEmail}</h3><p>${t.channelEmailDesc}</p></div><form class="notify-form email-form"><input type="email" name="email" maxlength="254" autocomplete="email" placeholder="${t.emailPlaceholder}" required><button type="submit">${t.emailAction}</button></form></article>
    <article class="notify-channel telegram-channel"><span class="notify-icon" aria-hidden="true">➤</span><div><h3>${t.channelTelegram}</h3><p>${t.channelTelegramDesc}</p></div><button class="telegram-connect channel-action" type="button">${t.telegramAction}</button><small class="telegram-unavailable" hidden>${t.telegramUnavailable}</small></article>
    <article class="notify-channel webhook-channel"><span class="notify-icon" aria-hidden="true">⌁</span><div><h3>${t.channelWebhook}</h3><p>${t.channelWebhookDesc}</p></div><form class="notify-form webhook-form"><input type="url" name="url" maxlength="1000" inputmode="url" autocomplete="url" placeholder="${t.webhookPlaceholder}" required><button type="submit">${t.webhookAction}</button></form></article>
    <article class="notify-channel rss-channel"><span class="notify-icon" aria-hidden="true">◔</span><div><h3>${t.channelRss}</h3><p>${t.channelRssDesc}</p></div><a class="channel-action" href="${feedPage}">${t.rssAction}</a></article>
  </div><div class="notify-result" role="status" aria-live="polite"></div><p class="notify-privacy">${t.notifyPrivacy}</p></section>`;
  return `<section class="status-panel" aria-labelledby="status-title"><div class="status-top"><div><p>${t.headline}</p><h1 id="status-title">${t.statusHeadline}</h1></div><a class="source-profile" href="https://x.com/thsottiaux" target="_blank" rel="noopener noreferrer"><img class="tibo-avatar" src="/tibo.jpg" alt="" width="42" height="42"><span><strong>Tibo <i class="verified" aria-label="Verified">✓</i></strong><span>@thsottiaux ↗</span></span></a></div>
    <div class="status-grid"><div class="last-reset"><span>${t.lastConfirmed}</span><strong>${lastCompleted?elapsedLabel(lastCompleted.announcedAt,lang,now):t.noConfirmed}</strong><time datetime="${escape(lastCompleted?.announcedAt||'')}">${lastCompleted?dateLabel(lastCompleted.announcedAt,lang):''}</time></div><div class="status-facts"><div><span>${t.nextReset}</span><strong>${active.length?t.nextAnnounced:t.noAnnouncement}</strong><small>${active.length?t.checkAnnouncement:t.noAnnouncementNote}</small></div><div><span>${t.averageInterval}</span><strong>${average!==null?`${average} ${t.days}`:t.collecting}</strong><small>${completed.length} ${t.confirmedSamples}${average!==null?` · ${t.confirmedAverage}`:''}</small></div></div></div>
    <div class="alert-box"><div><strong>${t.getNotified}</strong><span class="notify-note">${t.notifyNote}</span></div><div class="alert-actions"><a class="notify-open" href="#alerts">${t.notifyAction}</a><a href="${feedPage}">${t.rss} ↗</a></div></div>
    <div class="status-foot"><span class="collection-mode ${fresh?'connected':''}"><i aria-hidden="true"></i>${fresh?t.liveMode:t.reviewMode}</span><button class="refresh" type="button">↻ ${t.refresh}</button></div></section>
    ${notificationCenter}
    <p class="connection-warning" role="status" ${fresh?'hidden':''}>${live?t.stale:t.collectorBlocked}</p>
    ${active.length?`<section class="upcoming"><h2>${t.announced}</h2>${active.map(e=>`<p>${escape(e.summary?.[lang]||e.text)}</p>${sourceLink(e)}`).join('')}<small>${t.pendingNote}</small></section>`:''}
    ${metrics}
    ${calendar}
    ${xStream}
    <details class="data-note" id="source-details"><summary>${t.sourceDetails}</summary><div class="freshness"><p>${live?t.sync:t.manualReview} <time datetime="${escape(data.lastSuccessAt||data.lastReviewAt||'')}">${dateLabel(data.lastSuccessAt||data.lastReviewAt,lang)}</time></p></div><p>${t.partial}</p><p>${t.provenance} <a href="https://x.com/thsottiaux" target="_blank" rel="noopener noreferrer">@thsottiaux ↗</a></p><p>${t.liveNote}</p></details>`;
}
