// Real production authentication modules, synthetic credentials and mocked provider only.
import assert from 'node:assert/strict';
import auth from '../api/auth.js';
import {requireToolsAuth, sessionToken, SESSION_COOKIE} from '../lib/tools-auth.js';
const token='fixture.payload.signature';
const approvedUser={id:'member-1',email:'member@example.test',email_confirmed_at:'2026-01-01',app_metadata:{research_access:true}};
const cookie=SESSION_COOKIE+'='+token;
let calls=[], user=approvedUser, providerStatus=200, fail=false;
globalThis.fetch=async(url,options={})=>{
 calls.push({url,options}); if(fail)throw new Error('private provider error');
 assert.ok(url.startsWith('https://auth.example.test/auth/v1/'),'unexpected provider request');
 const data=url.includes('/token?')?{access_token:token,refresh_token:'private-refresh-token',expires_in:7200,user:{...approvedUser,id:'unverified-response'}}:user;
 return {ok:providerStatus===200,status:providerStatus,json:async()=>data};
};
function response(){return {code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};}
async function request(method='GET',body,headers={}){const res=response();await auth({method,body,headers:{origin:'https://quant-club.vercel.app','content-type':'application/json','x-real-ip':'test-'+Math.random(),...headers}},res);return res;}
async function guard(headers={},query={},allowQuery=false){const res=response();const allowed=await requireToolsAuth({headers,query},res,allowQuery);return {res,allowed};}
delete process.env.SUPABASE_URL;delete process.env.SUPABASE_PUBLISHABLE_KEY;
process.env.TOOLS_PASSWORD='synthetic-test-password';
assert.deepEqual((await request()).body,{mode:'legacy',user:null});
assert.equal((await guard({'x-tools-password':'synthetic-test-password'})).allowed,true);
assert.equal((await guard({}, {k:'synthetic-test-password'})).allowed,false);
assert.equal((await guard({}, {k:'synthetic-test-password'},true)).allowed,true);
assert.equal((await guard({'x-tools-password':'wrong'})).res.code,401);
process.env.SUPABASE_URL='https://auth.example.test';
assert.equal((await guard({'x-tools-password':'synthetic-test-password'})).res.code,503,'partial configuration must fail closed');
process.env.SUPABASE_PUBLISHABLE_KEY='synthetic-publishable-key';
assert.equal((await guard({'x-tools-password':'synthetic-test-password'})).allowed,false,'legacy password must not bypass accounts');
assert.equal((await guard({cookie})).allowed,true);
assert.equal((await request('GET',null,{cookie})).body.user.id,'member-1');
assert.equal(sessionToken({headers:{cookie:cookie+'; '+cookie}}),'','duplicate cookie');
assert.equal(sessionToken({headers:{cookie:SESSION_COOKIE+'=invalid'}}),'');
assert.equal(sessionToken({headers:{cookie:SESSION_COOKIE+'='+'a'.repeat(3601)+'.b.c'}}),'');
const login={action:'login',email:'member@example.test',password:'synthetic-login-password'};
let r=await request('POST',login);
assert.equal(r.code,200);assert.equal(r.body.user.id,'member-1','identity must come from verified user endpoint');
assert.match(r.headers['Set-Cookie'],/^__Host-gpmc-session=fixture.payload.signature; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600$/);
assert.equal(r.headers['Cache-Control'],'private, no-store');
assert.ok(!JSON.stringify(r.body).includes(token));assert.ok(!JSON.stringify(r.body).includes('refresh'));
for(const invalid of [{...approvedUser,app_metadata:{},user_metadata:{research_access:true}},{...approvedUser,email_confirmed_at:null},{...approvedUser,app_metadata:{research_access:false}}]){
 user=invalid; assert.equal((await guard({cookie})).res.code,401);
 r=await request('POST',login);assert.equal(r.code,403);assert.equal(r.headers['Set-Cookie'],undefined);
}
user=approvedUser;
for(const headers of [{origin:'https://evil.example'}, {'sec-fetch-site':'cross-site'},{'content-type':'text/plain'},{origin:''}]){
 const before=calls.length;assert.equal((await request('POST',login,headers)).code,403);assert.equal(calls.length,before,'CSRF rejection before provider');
}
assert.equal((await request('DELETE')).code,405);
assert.equal((await request('POST','{')).code,400);
assert.equal((await request('POST',{action:'login',email:'bad',password:'x'})).code,400);
providerStatus=401;assert.equal((await guard({cookie})).res.code,401);assert.equal((await request('POST',login)).code,401);
providerStatus=429;assert.equal((await request('POST',login)).code,429);
providerStatus=503;r=await guard({cookie});assert.equal(r.res.code,503);
providerStatus=200;fail=true;
r=await request('POST',login);assert.equal(r.code,503);assert.ok(!JSON.stringify(r.body).includes('private'));
r=await request('POST',{action:'logout'},{cookie});assert.equal(r.code,200);assert.match(r.headers['Set-Cookie'],/Max-Age=0$/);
fail=false;
for(let i=0;i<20;i++)assert.equal((await request('POST',login,{'x-real-ip':'rate-limit-test'})).code,200);
const before=calls.length;r=await request('POST',login,{'x-real-ip':'rate-limit-test'});assert.equal(r.code,429);assert.equal(calls.length,before);
// Every shipped data API must reject anonymous access before spending provider credits.
for(const name of ['quote','factors','fundamentals','search','style-rotation','usage']){
 const {default:handler}=await import('../api/'+name+'.js');
 const before=calls.length, res=response();await handler({method:'GET',headers:{},query:{}},res);
 assert.equal(res.code,401,name);assert.equal(calls.length,before,name+' reached provider');assert.equal(res.headers['Cache-Control'],'private, no-store');
}
console.log('PASS: real session verification, member approval, legacy transition, cookie security, CSRF, rate limiting, outages, logout and all six API guards');
