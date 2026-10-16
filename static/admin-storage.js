/* On-demand, authenticated storage dashboard and download-only metadata export. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const byteText=bytes=>{
    const gb=bytes/1e9;
    return gb>=1?gb.toFixed(2)+' GB':(bytes/1e6).toFixed(1)+' MB';
  };
  async function refresh() {
    $('storage-refresh').disabled=true;
    $('storage-status').textContent='Checking your R2 bucket…';
    try {
      const r=await fetch('/api/admin/storage',{cache:'no-store',credentials:'same-origin'});
      const body=await r.json();
      if(!r.ok) throw Error(body.error || 'Storage lookup failed.');
      $('storage-stats').hidden=false;
      $('storage-objects').textContent=Number(body.objects).toLocaleString();
      $('storage-photos').textContent=Number(body.photographs).toLocaleString();
      $('storage-bytes').textContent=byteText(body.bytes);
      const estimatedOverage=Math.max(0,body.bytes/1e9-10)*0.015;
      $('storage-cost').textContent='~$'+estimatedOverage.toFixed(2)+' USD';
      $('storage-caveat').textContent=body.incomplete
        ? 'Large bucket: only the first '+body.objects+' objects were scanned. These are partial totals; pricing also depends on other buckets and operations.'
        : 'Approximate R2 Standard storage only. The first 10 GB-month free allowance is account-wide, not per bucket. Requests and other buckets may add charges.';
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
      const response=await fetch('/api/admin/backup',{credentials:'same-origin',cache:'no-store'});
      if(!response.ok) {
        let result;try{result=await response.json();}catch{}
        throw Error(result?.error||'Metadata export failed.');
      }
      const blob=await response.blob();
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download='nickckincaid-metadata-'+new Date().toISOString().slice(0,10)+'.json';
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),3000);
      $('backup-status').textContent='Downloaded. Keep this file somewhere separate from GitHub. No R2 photos are included.';
    }catch(error){$('backup-status').textContent=error.message||'Download failed.';}
    finally{button.disabled=false;}
  });
  // Never list every R2 object just to load the editor. Run only on explicit request.
})();
