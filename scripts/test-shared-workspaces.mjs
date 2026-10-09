import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { createServer } from 'node:http';
import { Client } from 'pg';
import handler from '../server/handler.ts';
import { connectionOptions,transaction,closeDatabase,withWorkspaceActor } from '../server/database.ts';
import { createAccountInvitation } from '../server/invitations.ts';
import { newToken,tokenHash } from '../server/security.ts';
process.loadEnvFile('.env.local');
const db=new Client(connectionOptions(true));await db.connect();
const server=createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;process.env.DRIVEVISION_APP_ORIGIN=base;
const ids=[],run=randomUUID(),password='QA-'+randomUUID(),ip=`198.18.${Math.floor(Math.random()*254)}.83`;
async function request(path,body,cookie,method=body===undefined?'GET':'POST'){
 const res=await fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json','X-Forwarded-For':ip,...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const bytes=Buffer.from(await res.arrayBuffer());
 return {status:res.status,data:JSON.parse(res.headers.get('x-drivevision-encoding')==='gzip'?gunzipSync(bytes).toString():bytes.toString()),cookie:res.headers.get('set-cookie')?.split(';')[0]};
}
try{
 const operator=await createAccountInvitation('QA shared operator',`qa-${run}@drivevision.invalid`);ids.push(operator.id);
 await db.query('insert into drivevision.platform_admins(account_id) values($1)',[operator.id]);
 const token=newToken();await db.query("insert into drivevision.sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '10 minutes')",[tokenHash(token),operator.id]);
 const adminCookie=`drivevision_session=${token}`;
 const payload={name:'QA shared '+run,contact:'QA User',email:`qa-${randomUUID()}@drivevision.invalid`,plan:'Cortesia DriveData',password};
 async function create(extra={}){const input={...payload,email:`qa-${randomUUID()}@drivevision.invalid`,...extra};const r=await request('/api/admin/clients',input,adminCookie);assert.equal(r.status,200,JSON.stringify(r.data));ids.push(r.data.id);const login=await request('/api/login',{email:input.email,password});assert.equal(login.status,200,JSON.stringify(login.data));return {id:r.data.id,email:input.email,cookie:login.cookie};}
 const owner=await create(),outsider=await create(),member=await create({workspaceOwnerId:owner.id});
 assert.equal((await db.query('select 1 from drivevision.workspaces where owner_id=$1',[member.id])).rowCount,0);
 assert.equal((await db.query('select 1 from drivevision.billing_accounts where owner_id=any($1::uuid[])',[ids])).rowCount,0);
 const billing=await request('/api/billing',undefined,member.cookie);assert.equal(billing.data.shared,true);assert.equal(billing.data.required,false);
 assert.equal((await request('/api/billing/checkout',{},member.cookie)).status,403);
 assert.equal((await request('/api/admin/workspaces',undefined,member.cookie)).status,403);
 const options=await request('/api/admin/workspaces?q='+encodeURIComponent(run),undefined,adminCookie);
 assert.ok(options.data.workspaces.some(w=>w.id===owner.id));assert.ok(!options.data.workspaces.some(w=>w.id===member.id));
 for(const target of [operator.id,member.id,randomUUID()]){
  assert.equal((await request('/api/admin/clients',{...payload,email:`qa-${randomUUID()}@drivevision.invalid`,workspaceOwnerId:target},adminCookie)).status,400);
 }
 await assert.rejects(transaction(outsider.id,c=>c.query('insert into drivevision.workspace_members(account_id,workspace_owner_id,granted_by) values($1,$2,$1)',[outsider.id,owner.id])),e=>e.code==='42501');
 await assert.rejects(withWorkspaceActor(outsider.id,owner.id,()=>transaction(owner.id,c=>c.query('select 1'))),e=>e.status===403);
 assert.equal((await transaction(member.id,c=>c.query('select id from drivevision.workspaces where owner_id=$1',[owner.id]))).rowCount,0);
 const source={id:'shared-source',name:'Shared source',columns:['Value'],numeric:['Value'],dates:[],rows:[{Value:'42'}],demo:false,createdAt:new Date().toISOString()};
 const saved=await request('/api/workspace',{revision:0,workspace:{version:1,sources:[source],dashboards:[]}},member.cookie,'PUT');assert.equal(saved.status,200,JSON.stringify(saved.data));
 const readOwner=await request('/api/workspace',undefined,owner.cookie),readMember=await request('/api/workspace',undefined,member.cookie),readOutsider=await request('/api/workspace',undefined,outsider.cookie);
 assert.deepEqual(readOwner.data,readMember.data);assert.equal(readOwner.data.workspace.sources[0].rows[0].Value,'42');assert.equal(readOutsider.data.workspace.sources.length,0);
 assert.equal((await request('/api/workspace',{revision:0,workspace:{version:1,sources:[],dashboards:[]}},owner.cookie,'PUT')).status,409);
 assert.equal((await request('/api/workspace',{revision:1,workspace:{version:1,sources:[],dashboards:[]},workspaceOwnerId:outsider.id},member.cookie,'PUT')).status,400);
 assert.equal((await request('/api/connectors',undefined,member.cookie)).status,200);
 const listed=await request('/api/admin/clients?q='+encodeURIComponent(run),undefined,adminCookie);
 assert.equal(listed.data.clients.find(c=>c.id===member.id).workspaceOwnerId,owner.id);
 assert.equal(listed.data.clients.find(c=>c.id===member.id).shared,true);
 const invited=await request('/api/admin/clients',{...payload,email:`qa-${randomUUID()}@drivevision.invalid`,password:undefined,workspaceOwnerId:owner.id},adminCookie);
 assert.equal(invited.status,200);ids.push(invited.data.id);
 const activation=await request('/api/activate',{token:invited.data.invitationUrl.split('=')[1],password});
 assert.equal(activation.status,200);assert.deepEqual((await request('/api/workspace',undefined,activation.cookie)).data,readOwner.data);
 console.log('PASS complimentary creation, separate logins, shared read/write/revision, connectors, tenant isolation, no billing, no self-join, no admin or nested workspace attachment');
 await db.query("insert into drivevision.billing_accounts(owner_id,terms_version,next_reconcile_at) values($1,'qa','infinity')",[owner.id]);
 assert.equal((await request('/api/workspace',undefined,member.cookie)).status,402);
 await db.query('delete from drivevision.billing_accounts where owner_id=$1',[owner.id]);
 await request('/api/admin/clients/update',{id:owner.id,revision:0,name:payload.name,plan:'Cortesia',status:'suspended'},adminCookie);
 assert.equal((await request('/api/workspace',undefined,member.cookie)).status,402);
 await request('/api/admin/clients/update',{id:owner.id,revision:1,name:payload.name,plan:'Cortesia',status:'active'},adminCookie);
 assert.equal((await request('/api/workspace',undefined,member.cookie)).status,200);
 await request('/api/admin/clients/update',{id:member.id,revision:0,name:payload.name,plan:'Cortesia',status:'suspended'},adminCookie);
 assert.equal((await request('/api/workspace',undefined,member.cookie)).status,401);
 assert.equal((await request('/api/workspace',undefined,owner.cookie)).status,401); // owner sessions revoked by earlier suspension
 const ownerLogin=await request('/api/login',{email:owner.email,password});assert.equal(ownerLogin.status,200);
 const preserved=await request('/api/workspace',undefined,ownerLogin.cookie);assert.equal(preserved.status,200);assert.equal(preserved.data.workspace.sources[0].rows[0].Value,'42');
 await assert.rejects(withWorkspaceActor(member.id,owner.id,()=>transaction(owner.id,c=>c.query('select 1'))),e=>e.status===403);
 console.log('PASS owner billing and suspension apply to members; individual suspension revokes access without deleting shared data');
}finally{
 for(const id of [...ids].reverse()){
  await db.query('delete from drivevision.workspaces where owner_id=$1',[id]);
  await db.query("delete from drivevision.accounts where id=$1 and email like 'qa-%@drivevision.invalid'",[id]);
 }
 await closeDatabase();await db.end();await new Promise(r=>server.close(r));
}
