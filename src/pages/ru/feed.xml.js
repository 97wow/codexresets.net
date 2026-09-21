import snapshot from '../../data/snapshot.json';
import {rssResponse} from '../../lib/rss.js';
export const GET=()=>rssResponse(snapshot,'ru');
