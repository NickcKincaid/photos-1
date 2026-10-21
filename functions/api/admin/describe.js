// V33: higher-quality, owner-initiated, private image accessibility descriptions.
// Protected by functions/api/admin/_middleware.js; this endpoint never publishes metadata.
import { json, readLimited } from '../../../admin-lib/session.js';

// Moondream 3.1 accepts image data URIs and supports specific questions about images.
// Unlike the V32 LLaVA model, it is designed for detailed visual reasoning.
export const MODEL = '@cf/moondream/moondream3.1-9B-A2B';
const MAX_BYTES = 900_000;
const QUESTION = [
  'Write exactly one detailed accessibility alt-text sentence for this photograph, roughly 20 to 38 words.',
  'Identify the MAIN visible action and the relationship between subjects, with distinctive verifiable environmental detail.',
  'For a sporting event, describe the sport and what each participant is physically doing, if clear.',
  'For a street scene, distinguish a fixed storefront awning from a handheld umbrella; describe the structures accurately.',
  'Be accurate, visually grounded, and neutral. Do not guess people\'s identities, ethnicity, age, location, emotion, or motives.',
  'Do not invent objects, signs, titles or text. Do not include camera equipment, SEO keywords, or "image of" boilerplate.',
  'Give only the alt text, not an explanation.'
].join(' ');

export function cleanAlt(value) {
  let text = String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g,' ').trim();
  text=text.replace(/^(?:(?:alt(?:ernative)? text|description|caption)\s*:\s*|["'“”\s])+/i,'').replace(/["'“”]+$/g,'').trim();
  text=text.replace(/^(?:this (?:photo(?:graph)?|image) (?:shows|depicts)|(?:a |an )?(?:photo(?:graph)?|image|picture) of)\s+/i,'');
  if(text.length < 15) return '';
  if(text.length > 240) text=text.slice(0,240).replace(/\s+\S*$/,'').replace(/[,. ;:]+$/,'');
  return text;
}

function b64(data) {
  // Avoid stack overflow: btoa does not accept Uint8Array directly.
  const chunks=[];
  for(let i=0;i<data.length;i+=16384) chunks.push(String.fromCharCode(...data.subarray(i,i+16384)));
  return btoa(chunks.join(''));
}

export function extractText(result) {
  const v=result?.answer ?? result?.caption ?? result?.description ?? result?.response ??
    result?.result?.answer ?? result?.result?.caption ?? result?.result?.description ?? result?.result?.response ?? result;
  return typeof v === 'string' ? v : '';
}

export function extractUsage(result) {
  // Model metrics are optional and can vary. NEVER estimate neurons from token counts.
  const metrics=result?.usage ?? result?.metrics ?? result?.result?.usage ?? result?.result?.metrics ?? {};
  const number=(...names)=>{
    for(const name of names){const val=metrics[name];if(Number.isFinite(val) && val >= 0) return Math.floor(val);}
    return null;
  };
  return {
    input_tokens:number('prompt_tokens','input_tokens','inputTokens'),
    output_tokens:number('completion_tokens','output_tokens','outputTokens')
  };
}

export function classifyAIError(error) {
  const status=Number(error?.status ?? error?.cause?.status ?? error?.response?.status ?? 0);
  const text=String(error?.message ?? '')+' '+String(error?.code ?? '');
  if(status===429 || /\b(429|3036|3040|quota|rate.limit|neurons)\b/i.test(text))
    return {status:429,code:'AI_LIMIT',error:'Cloudflare Workers AI quota or rate limit reached. Check Workers AI usage.'};
  if(status===403 || /\b(403|license|agreement|access denied|paid plan)\b/i.test(text))
    return {status:503,code:'AI_ACCESS',error:'Cloudflare refused the model request. Check model access and your Workers AI plan.'};
  if(status===400 || /\b(400|invalid input|no such model|not found)\b/i.test(text))
    return {status:502,code:'AI_INPUT',error:'Cloudflare did not accept the image or model request. Check model availability and Pages logs.'};
  if(status===408 || /\b(408|timeout|timed out)\b/i.test(text))
    return {status:504,code:'AI_TIMEOUT',error:'Image description timed out. Try again.'};
  return {status:502,code:'AI_SERVICE',error:'Cloudflare could not analyze this photo. Check Workers AI and Pages Functions logs.'};
}

export async function onRequestPost({request,env}) {
  if(!env?.AI || typeof env.AI.run!=='function')
    return json({code:'AI_BINDING',error:'Add a Workers AI binding named AI to your Production Pages environment and redeploy.'},503);
  if((request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='image/jpeg')
    return json({code:'BAD_TYPE',error:'Send a reduced JPEG preview.'},415);
  try {
    const bytes=await readLimited(request,MAX_BYTES);
    if(bytes.length<100 || bytes[0]!==0xff || bytes[1]!==0xd8 || bytes.at(-2)!==0xff || bytes.at(-1)!==0xd9)
      return json({code:'BAD_JPEG',error:'The photo preview is not a complete JPEG.'},400);
    const result=await env.AI.run(MODEL,{
      task:'query',
      image:'data:image/jpeg;base64,'+b64(bytes),
      question:QUESTION,
      reasoning:false,
      temperature:0.1,
      max_tokens:200,
      stream:false
    });
    const alt=cleanAlt(extractText(result));
    if(!alt) return json({code:'EMPTY_DESCRIPTION',error:'Cloudflare returned no usable description. Try again or write your own.'},502);
    return json({alt,model:MODEL,usage:extractUsage(result)});
  }catch(error) {
    if(error?.status===413)return json({code:'PHOTO_TOO_LARGE',error:'Photo preview exceeds 900 KB. Reduce image size.'},413);
    const classified=classifyAIError(error);
    console.error('V33 Workers AI description:',classified.code,String(error?.message??'').slice(0,280));
    return json(classified,classified.status);
  }
}
