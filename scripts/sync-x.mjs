import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {collectX,XError} from '../src/lib/x-collector.js';
const path=new URL('../src/data/snapshot.json',import.meta.url);
const previous=JSON.parse(readFileSync(path));
try{
  const next=await collectX(previous,process.env.X_BEARER_TOKEN);
  const temporary=new URL('../src/data/snapshot.tmp.json',import.meta.url);
  writeFileSync(temporary,JSON.stringify(next,null,2)+'\n');
  renameSync(temporary,path);
  console.log(`Collected directly from X: ${next.posts.length} stored posts, ${next.events.length} reset-related messages.`);
}catch(error){console.error(`Collection did not update local records: ${error instanceof XError?error.code:'source_unavailable'}`);process.exitCode=1;}
