/* On-demand, authenticated storage tools. No estimated AI usage is tracked here. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  // The timestamp is embedded by the website build. No Cloudflare API token,
  // background polling, or R2 inventory request is needed to show it.
  const built=$('website-last-updated');
  if (built) {
    // UTC stays in the machine-readable datetime; each accessor sees the date
    // converted by their own browser to their own time zone and locale.
    const date=new Date(built.getAttribute('datetime'));
    if(Number.isFinite(date.getTime())) {
      try {
        const formatted=new Intl.DateTimeFormat(undefined,{
          year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'
        }).format(date);
        built.textContent=formatted;
        built.title='Build time (UTC): '+date.toISOString();
        const note=$('website-timezone-note');
        if(note)note.textContent='(your local time · latest site build)';
      } catch {} // Keep the explicit UTC fallback when formatting is unavailable.
    }
  }
  const byteText=bytes=>{
    const gb=bytes/1e9;
    return gb>=1?gb.toFixed(2)+' GB':(bytes/1e6).toFixed(1)+' MB';
  };
  async function requestWithDeadline(path, seconds, parse) {
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),seconds*1000);
    try {
      const response=await fetch(path,{cache:'no-store',credentials:'same-origin',signal:controller.signal});
      return await parse(response);
    } catch(error) {
      if(controller.signal.aborted)throw Error(`Request timed out after ${seconds} seconds. Try again.`);
      throw error;
    } finally {clearTimeout(timeout);}
  }
  async function refresh() {
    $('storage-refresh').disabled=true;
    $('storage-status').textContent='Checking your R2 bucket…';
    try {
      const body=await requestWithDeadline('/api/admin/storage',20,async response=>{
        let result;
        try {result=await response.json();} catch {throw Error(`Storage service returned HTTP ${response.status}, not JSON.`);}
        if(!response.ok)throw Error(result?.error||`Storage lookup failed (${response.status}).`);
        return result;
      });
      if(!Number.isFinite(Number(body.objects)) || !Number.isFinite(Number(body.bytes)) || !Number.isFinite(Number(body.photographs)))
        throw Error('Cloudflare returned an incomplete storage summary. Please retry.');
      $('storage-stats').hidden=false;
      $('storage-objects').textContent=Number(body.objects).toLocaleString();
      $('storage-photos').textContent=Number(body.photographs).toLocaleString();
      $('storage-bytes').textContent=byteText(Number(body.bytes));
      const estimatedOverage=Math.max(0,Number(body.bytes)/1e9-10)*0.015;
      $('storage-cost').textContent=body.incomplete ? 'Incomplete scan' : '~$'+estimatedOverage.toFixed(2)+' USD';
      $('storage-caveat').textContent=body.incomplete
        ? 'Large bucket: only the first '+body.objects+' objects were scanned. These are partial totals; pricing also depends on other buckets and operations.'
        : 'Approximate R2 Standard storage only. The first 10 GB-month free allowance is account-wide, not per bucket. Requests and other buckets may add charges.';
      const checkedAt=new Date();
      const clock=$('storage-last-checked-time');
      clock.dateTime=checkedAt.toISOString();
      clock.textContent=new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(checkedAt);
      $('storage-last-checked').hidden=false;
      $('storage-status').textContent=body.incomplete?'Partial scan complete.':'Storage totals checked.';
    } catch(error) {
      $('storage-status').textContent=error.message || 'Unable to check storage.';
    } finally { $('storage-refresh').disabled=false; }
  }
  $('storage-refresh')?.addEventListener('click',refresh);
  $('download-metadata')?.addEventListener('click',async()=>{
    const button=$('download-metadata');button.disabled=true;
    $('backup-status').textContent='Preparing project and Notes backup…';
    try {
      const blob=await requestWithDeadline('/api/admin/backup',90,async response=>{
        if(!response.ok) {
          let result;try{result=await response.json();}catch{}
          throw Error(result?.error||`Metadata export failed (${response.status}).`);
        }
        return response.blob();
      });
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download='nickckincaid-metadata-'+new Date().toISOString().slice(0,10)+'.json';
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),3000);
      $('backup-status').textContent='Downloaded. Keep this file somewhere separate from GitHub. No R2 photos are included.';
    }catch(error){$('backup-status').textContent=error.message||'Download failed.';}
    finally{button.disabled=false;}
  });
  // Never list every R2 object automatically when the editor loads.
})();
