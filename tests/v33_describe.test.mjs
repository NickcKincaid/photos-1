import test from 'node:test';
import assert from 'node:assert/strict';
import {extractText,cleanAlt,MODEL,onRequestPost} from '../functions/api/admin/describe.js';

test('Moondream answer and caption output shapes are handled',()=>{
  assert.equal(extractText({answer:'street scene'}),'street scene');
  assert.equal(extractText({caption:'street scene'}),'street scene');
  assert.equal(extractText({result:{answer:'sporting event'}}),'sporting event');
});
test('Alt text is bounded and strips caption boilerplate',()=>{
  assert.equal(cleanAlt('Alt text: A photograph of a boxing ring with red corner posts.'),'a boxing ring with red corner posts.');
  assert.ok(cleanAlt('A long scene '.repeat(60)).length<=240);
});
test('Authenticated inference endpoint uses documented Moondream data URI query fields',async()=>{
  let invoked=false;
  const jpeg=new Uint8Array(150).fill(0);jpeg[0]=255;jpeg[1]=216;jpeg[148]=255;jpeg[149]=217;
  const req=new Request('https://site.example/api/admin/describe',{method:'POST',headers:{'content-type':'image/jpeg'},body:jpeg,duplex:'half'});
  const response=await onRequestPost({request:req,env:{AI:{run:async(model,args)=>{
    invoked=true;assert.equal(model,MODEL);assert.equal(args.task,'query');
    assert.equal(args.stream,false);assert.match(args.image,/^data:image\/jpeg;base64,/);
    assert.ok(args.question.includes('MAIN visible action'));
    return {answer:'Two boxers face one another across the ropes of an outdoor boxing ring, one extending a blue glove toward an opponent in white.'};
  }}}});
  const data=await response.json();assert.equal(response.status,200);assert.equal(invoked,true);
  assert.match(data.alt,/boxers/);assert.equal(data.model,MODEL);
  assert.equal(Object.hasOwn(data,'usage'),false);
});
