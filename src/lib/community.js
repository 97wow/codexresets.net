import {resetOpportunities} from './reset-state.js';
const encoder=new TextEncoder();
const validCountry=value=>typeof value==='string'&&/^[A-Z]{2}$/.test(value)?value:'XX';
const readNumber=async(kv,key)=>Math.max(0,Number.parseInt(await kv.get(key)||'0',10)||0);
const readCountries=async(kv,key)=>{try{const value=await kv.get(key,'json');return value&&typeof value==='object'?value:{};}catch{return {};}};
export const resetCycle=data=>resetOpportunities(data.events).find(event=>/^\d{10,25}$/.test(event.id))?.id||'none';
async function visitorHash(request,scope,secret){
  const ip=request.headers.get('CF-Connecting-IP')||'unknown';
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const digest=await crypto.subtle.sign('HMAC',key,encoder.encode(`${scope}:${ip}`));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
export async function communityStats(env,data,request){
  const cycle=resetCycle(data),country=validCountry(request.cf?.country||request.headers.get('CF-IPCountry'));
  const [visitors,begCount,countries]=await Promise.all([readNumber(env.RESETS,'community:visitors'),readNumber(env.RESETS,`community:beg:${cycle}:count`),readCountries(env.RESETS,`community:beg:${cycle}:countries`)]);
  return {visitors,beg:{cycle,count:begCount,countries},country};
}
export async function recordVisit(env,data,request){
  if(!env.STATS_SALT)throw new Error('stats_unavailable');
  const marker=`community:visitor:${await visitorHash(request,'visit',env.STATS_SALT)}`;
  if(!await env.RESETS.get(marker)){
    const count=await readNumber(env.RESETS,'community:visitors');
    await Promise.all([env.RESETS.put(marker,'1',{expirationTtl:34560000}),env.RESETS.put('community:visitors',String(count+1))]);
  }
  return communityStats(env,data,request);
}
export async function recordBeg(env,data,request){
  if(!env.STATS_SALT)throw new Error('stats_unavailable');
  const cycle=resetCycle(data),hash=await visitorHash(request,`beg:${cycle}`,env.STATS_SALT),marker=`community:beg:${cycle}:visitor:${hash}`;
  let added=false;
  if(!await env.RESETS.get(marker)){
    const countKey=`community:beg:${cycle}:count`,countriesKey=`community:beg:${cycle}:countries`,country=validCountry(request.cf?.country||request.headers.get('CF-IPCountry'));
    const [count,countries]=await Promise.all([readNumber(env.RESETS,countKey),readCountries(env.RESETS,countriesKey)]);
    countries[country]=(Number(countries[country])||0)+1;
    await Promise.all([env.RESETS.put(marker,'1',{expirationTtl:15552000}),env.RESETS.put(countKey,String(count+1)),env.RESETS.put(countriesKey,JSON.stringify(countries))]);
    added=true;
  }
  return {...await communityStats(env,data,request),added};
}
