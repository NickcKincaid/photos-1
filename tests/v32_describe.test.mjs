import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestPost, MODEL, cleanAlt, classifyAIError} from '../functions/api/admin/describe.js';
import {summarizeDeployment, onRequestGet} from '../functions/api/admin/deployment.js';

const jpg=()=>{
  const bytes=new Uint8Array(300).fill(22);
  bytes[0]=0xff;bytes[1]=0xd8;bytes[2]=0xff;
  bytes[bytes.length-2]=0xff;bytes[bytes.length-1]=0xd9;
  return bytes;
};
const req=(bytes=jpg(),type='image/jpeg')=>new Request('https://nickckincaid.com/api/admin/describe',{
  method:'POST',headers:{'content-type':type},body:bytes,duplex:'half'
});
const body=async result=>({status:result.status,body:await result.json()});

test('seven independent photos use Moondream query with base64 image input and response shape',async()=>{
  let calls=0;
  const env={AI:{run:async(model,options)=>{
    assert.equal(model,MODEL);
    assert.equal(model,'@cf/moondream/moondream3.1-9B-A2B');
    assert.equal(options.task,'query');
    assert.ok(options.image.startsWith('data:image/jpeg;base64,'));
    assert.equal(options.stream,false);
    assert.ok(options.question.includes('accessibility alt-text'));
    assert.ok(options.question.includes('fixed storefront awning')); 
    calls++;
    return {answer:'Orange flowers in front of a textured gray stone wall with diffused sunlight.',metrics:{input_tokens:52,output_tokens:19}};
  }}};
  for(let i=0;i<7;i++){
    const result=await body(await onRequestPost({request:req(),env}));
    assert.equal(result.status,200);
    assert.match(result.body.alt,/Orange flowers/);
  }
  assert.equal(calls,7);
});

test('empty descriptions fail instead of silently publishing',async()=>{
  const result=await body(await onRequestPost({request:req(),env:{AI:{run:async()=>({description:' '})}}}));
  assert.equal(result.status,502);assert.equal(result.body.code,'EMPTY_DESCRIPTION');
});

test('missing binding fails clearly',async()=>{
  const result=await body(await onRequestPost({request:req(),env:{}}));
  assert.equal(result.status,503);assert.equal(result.body.code,'AI_BINDING');
});

test('non JPEG rejects with 415',async()=>{
  const result=await body(await onRequestPost({request:req(jpg(),'image/png'),env:{AI:{run:async()=>({})}}}));
  assert.equal(result.status,415);
});

test('incomplete JPEG rejects with 400 and never calls AI',async()=>{
  const img=jpg();img[img.length-1]=0;
  const result=await body(await onRequestPost({request:req(img),env:{AI:{run:async()=>{throw Error('should not run');}}}}));
  assert.equal(result.status,400);
});

test('large preview rejects before AI',async()=>{
  const img=new Uint8Array(900_002).fill(5);img[0]=255;img[1]=216;img[900000]=255;img[900001]=217;
  const result=await body(await onRequestPost({request:req(img),env:{AI:{run:async()=>{throw Error('should not run');}}}}));
  assert.equal(result.status,413);
});

test('Cloudflare quota errors are classified with actionable code',()=>{
  assert.equal(classifyAIError({status:429,message:'quota reached'}).code,'AI_LIMIT');
  assert.equal(classifyAIError({status:403,message:'model requires paid plan'}).code,'AI_ACCESS');
  assert.equal(classifyAIError({status:408,message:'timeout'}).code,'AI_TIMEOUT');
});

test('alternative text cleaning keeps visible content but removes boilerplate',()=>{
  assert.equal(cleanAlt('Alt text: A photograph of green trees under a cloudy sky.'),'green trees under a cloudy sky.');
  assert.equal(cleanAlt('hi'), '');
  assert.ok(cleanAlt('a '.repeat(200)).length<=250);
});

test('deployment stages are mapped correctly',()=>{
  assert.equal(summarizeDeployment({latest_stage:{name:'deploy',status:'success'}}).status,'success');
  assert.equal(summarizeDeployment({latest_stage:{name:'build',status:'active'}}).status,'building');
  assert.equal(summarizeDeployment({latest_stage:{name:'deploy',status:'failure'}}).status,'failed');
});

test('missing deployment env variables fail closed',async()=>{
  const result=await body(await onRequestGet({env:{}}));
  assert.equal(result.status,503);
  assert.match(result.body.error,/CF_ACCOUNT_ID/);
});

test('deployment API picks newest production deployment without exposing secret',async()=>{
  const old=globalThis.fetch;
  globalThis.fetch=async (url,options)=>{
    assert.match(url,/env=production/);
    assert.equal(options.headers.Authorization,'Bearer PRIVATE_TEST_TOKEN');
    return new Response(JSON.stringify({success:true,result:[
      {id:'old',environment:'production',created_on:'2026-10-18T00:00:00Z',latest_stage:{name:'deploy',status:'success'}},
      {id:'new',environment:'production',created_on:'2026-10-20T00:00:00Z',latest_stage:{name:'deploy',status:'success'}},
      {id:'preview',environment:'preview',created_on:'2026-10-22T00:00:00Z',latest_stage:{name:'deploy',status:'success'}}
    ]}),{status:200});
  };
  try{
    const result=await body(await onRequestGet({env:{CF_ACCOUNT_ID:'a'.repeat(32),CF_PAGES_PROJECT:'photos-1',CF_PAGES_READ_TOKEN:'PRIVATE_TEST_TOKEN'}}));
    assert.equal(result.status,200);
    assert.equal(result.body.deployment_id,'new');
    assert.equal(JSON.stringify(result.body).includes('PRIVATE_TEST_TOKEN'),false);
  }finally{globalThis.fetch=old;}
});
