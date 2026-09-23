const actionableStates=new Set(['completed','available']);
const progressStates=new Set(['rollout',...actionableStates]);
export const isResetOpportunity=event=>Boolean(event&&actionableStates.has(event.state));
export const resetOpportunities=events=>(events||[]).filter(isResetOpportunity).sort((a,b)=>Date.parse(b.announcedAt)-Date.parse(a.announcedAt));
export function announcementResolved(announcement,events){
  const announcedAt=Date.parse(announcement?.announcedAt);
  return (events||[]).some(event=>{
    if(!event||event.id===announcement?.id||!progressStates.has(event.state))return false;
    if((event.relatedPostIds||[]).includes(announcement.id))return true;
    const eventAt=Date.parse(event.announcedAt);
    return actionableStates.has(event.state)&&Number.isFinite(announcedAt)&&Number.isFinite(eventAt)&&eventAt>announcedAt&&eventAt-announcedAt<=14*86400000;
  });
}
