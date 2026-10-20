/* Pure helpers for dashboard completeness, batching and read-only image checks. */
(() => {
  'use strict';
  const required = ['focal_length', 'aperture', 'shutter_speed', 'iso'];
  function metadataReport(project) {
    const paths = [...new Set([project?.cover, ...(project?.gallery || [])].filter(Boolean))];
    const details = new Map((project?.photo_details || []).filter(Boolean).map(item => [item.image, item]));
    const missing = paths.filter(path => required.some(key => !String(details.get(path)?.[key] ?? '').trim())).length;
    return {total:paths.length, missing};
  }
  function reorderedPhotos(photos, selected, position) {
    const chosen=photos.filter(p=>selected.has(p.path));
    const remaining=photos.filter(p=>!selected.has(p.path));
    return position==='first' ? [...chosen,...remaining] : [...remaining,...chosen];
  }
  function imageLinks(photos) {
    return photos.flatMap((p, index) => {
      const urls=[{path:p.path,number:index+1,variant:'Original'}];
      for(const v of p.variants || p.meta?.variants || []) if(v?.url) urls.push({path:v.url,number:index+1,variant:`${v.width}px thumbnail`});
      return urls;
    }).filter(x => /^\/media\/[A-Za-z0-9_./-]+\.(?:jpe?g|webp|png|tiff?)$/i.test(x.path) && !x.path.includes('..'));
  }
  async function checkImages(assets, {fetcher=fetch, onProgress=()=>{}, signal}={}) {
    let offset=0, done=0;
    const results = new Array(assets.length);
    const count=Math.min(4,assets.length);
    await Promise.all(Array.from({length:count},async()=>{
      while(offset<assets.length && !signal?.aborted) {
        const i=offset++, asset=assets[i];
        try {
          const response=await fetcher(asset.path,{method:'HEAD',cache:'no-store',credentials:'same-origin',signal});
          results[i]={...asset,ok:response.ok,status:response.status};
        }catch(error){
          if(signal?.aborted) break;
          results[i]={...asset,ok:false,status:0,error:'Network request failed'};
        }
        done++;
        onProgress(done,assets.length);
      }
    }));
    return results.filter(Boolean);
  }
  window.PortfolioTools=Object.freeze({metadataReport,reorderedPhotos,imageLinks,checkImages});
})();
