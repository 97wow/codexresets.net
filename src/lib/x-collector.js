export const AUTHOR_ID = '1953337039510003712';
export const AUTHOR = 'thsottiaux';
export class XError extends Error {
  constructor(code, status = 0) { super(code); this.code = code; this.status = status; }
}
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
export function normalizePost(post) {
  if (!post || !/^\d+$/.test(post.id) || post.author_id !== AUTHOR_ID || !validDate(post.created_at)) throw new XError('invalid_post');
  const text = post.note_tweet?.text || post.text;
  if (typeof text !== 'string' || !text.trim() || text.length > 100000) throw new XError('invalid_text');
  return {id:post.id,authorId:post.author_id,text,createdAt:post.created_at,url:`https://x.com/${AUTHOR}/status/${post.id}`,references:(post.referenced_tweets||[]).filter(r=>['quoted','replied_to','retweeted'].includes(r.type)&&/^\d+$/.test(r.id)),edits:(post.edit_history_tweet_ids||[post.id]).filter(id=>/^\d+$/.test(id)),collectedAt:new Date().toISOString(),method:'x_api'};
}
export function classify(post, context = []) {
  if (post.references.some(r=>r.type==='retweeted')) return null;
  if(post.editorial)return {id:post.id,state:post.editorial.state,kind:post.editorial.kind,text:post.text,announcedAt:post.createdAt,source:post.url,relatedPostIds:post.references.map(r=>r.id),timingText:'',review:'human_reviewed',method:post.method,excerpt:post.excerpt===true,summary:post.editorial.summary};
  const text=post.text.toLowerCase();
  const hasReset=/\b(reset\w*|replenish\w*)\b/.test(text);
  const inherited=context.some(p=>/\breset\w*\b/i.test(p.text));
  if(!hasReset && !(inherited && /\b(done|landed|live|propagat\w*)\b/.test(text)))return null;
  if(/\b(password|factory|git|hard drive)\s+reset\b|\breset\s+(?:(?:your|the|my)\s+)?(password|branch|pc)\b/.test(text))return null;
  const uncertain=/\b(maybe|perhaps|might|could|hope|wish|would|if|no reset|not resetting|won't reset)\b/.test(text);
  const future=/\b(will|going to|tonight|tomorrow|later|lands? (?:at|around|by|in)|in ~?\s*\d+\s*hours?)\b/.test(text);
  const complete=/\b(reset all propagated|all reset|(?:have|has|just) (?:been )?reset|reset (?:is |has )?(?:done|complete|completed)|reset\w*.*(?:has|have) (?:been )?(?:applied|propagated))\b/.test(text)||(inherited&&/\b(it is done|it’s done|all propagated)\b/.test(text));
  const rollout=/\b(rolling out|propagating|being applied|resetting|reseting)\b/.test(text);
  let state=uncertain?'signal':complete?'completed':rollout?'rollout':future?'announced':'signal';
  const kind=/\bbanked\b/.test(text)||(!hasReset&&context.some(p=>/\bbanked\b/i.test(p.text)))?'banked':'regular';
  return {id:post.id,state,kind,text:post.text,announcedAt:post.createdAt,source:post.url,relatedPostIds:post.references.filter(r=>r.type!=='retweeted').map(r=>r.id),timingText:post.text.split(/\n|(?<=[.!?])\s+/).filter(s=>/\b(tonight|tomorrow|today|lands?|\d+\s*(?:am|pm|hours?|minutes?)|PT|PST|PDT)\b/i.test(s)).join(' '),review:'rule_classified',method:post.method,excerpt:post.excerpt===true};
}
export function mergePosts(existing, incoming) {
  const map=new Map(existing.map(p=>[p.id,p]));
  for(const post of incoming){for(const old of post.edits||[])if(old!==post.id)map.delete(old);map.set(post.id,{...post,...(map.get(post.id)?.editorial?{editorial:map.get(post.id).editorial}:{})});}
  return [...map.values()].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
}
export function deriveEvents(posts) {
  const byId=new Map(posts.map(p=>[p.id,p]));
  return posts.map(post=>classify(post,post.references.map(r=>byId.get(r.id)).filter(Boolean))).filter(Boolean);
}
export async function collectX(previous, token, fetcher = fetch, options = {}) {
  if(!token)throw new XError('missing_credentials');
  const received=[];
  let next;
  let pages=0;
  do {
    const url=new URL(`https://api.x.com/2/users/${AUTHOR_ID}/tweets`);
    url.searchParams.set('max_results',String(options.maxResults||20));
    url.searchParams.set('exclude','retweets'); // Replies can carry reset updates.
    url.searchParams.set('tweet.fields','created_at,author_id,conversation_id,referenced_tweets,edit_history_tweet_ids,note_tweet');
    if(previous.cursor)url.searchParams.set('since_id',previous.cursor);
    if(next)url.searchParams.set('pagination_token',next);
    const response=await fetcher(url,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new XError(response.status===401?'invalid_credentials':response.status===402?'credits_required':response.status===403?'access_denied':response.status===429?'rate_limited':'source_unavailable',response.status);
    const body=await response.json();
    if(body.errors?.length||!body.meta||!Number.isInteger(body.meta.result_count))throw new XError('invalid_response');
    if(body.data!==undefined&&!Array.isArray(body.data))throw new XError('invalid_response');
    for(const raw of body.data||[])received.push(normalizePost(raw));
    next=body.meta.next_token;
    if(next&&typeof next!=='string')throw new XError('invalid_cursor');
    if(!previous.cursor)next=undefined;
    if(++pages>=5&&next)throw new XError('backlog_requires_backfill'); // Never advance past an uncollected page.
  }while(next);
  const posts=mergePosts(previous.posts||[],received);
  // First connection is a bounded seed. Do not mistake manually reviewed historic posts for the API cursor.
  const cursor=received.reduce((max,p)=>!max||BigInt(p.id)>BigInt(max)?p.id:max,previous.cursor||null);
  return {...previous,version:1,posts,events:deriveEvents(posts),cursor,lastAttemptAt:new Date().toISOString(),lastSuccessAt:new Date().toISOString(),collectorState:'connected',error:null,source:'https://x.com/thsottiaux',coverage:'partial'};
}
