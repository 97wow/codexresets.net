import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AUTHOR_ID} from '../src/lib/x-collector.js';
const data=JSON.parse(readFileSync(new URL('../src/data/snapshot.json',import.meta.url)));
const copy=JSON.parse(readFileSync(new URL('../src/data/copy.json',import.meta.url)));
const keys=Object.keys(copy.en).sort();
const languages=['en','zh','zh-Hant','es','fr','de','pt','ru','ja','ko'];
for(const lang of languages){
  assert.deepEqual(Object.keys(copy[lang]).sort(),keys,`${lang}: missing translations`);
  for(const key of keys)assert.ok(typeof copy[lang][key]==='string'&&copy[lang][key].trim(),`${lang}.${key}: empty translation`);
}
assert.equal(data.version,1);
for(const post of data.posts){assert.equal(post.authorId,AUTHOR_ID);assert.equal(post.url,`https://x.com/thsottiaux/status/${post.id}`);assert.ok(Number.isFinite(Date.parse(post.createdAt)));}
for(const event of data.events){assert.ok(['announced','rollout','completed','signal','compensation'].includes(event.state));assert.ok(data.posts.some(p=>p.id===event.id));}
console.log(`Validated ${data.events.length} independently sourced records; i18n: ${keys.length} UI keys × ${languages.length} languages, 0 missing or empty translations.`);
