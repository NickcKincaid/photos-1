/* Safe Notes live preview. Builds DOM nodes, never injects note HTML. */
(() => {
  'use strict';
  const token = /\[([^\]\n]{1,150})\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`/g;
  const youtube = /^[a-zA-Z0-9_-]{11}$/;
  const spotify = /^[a-zA-Z0-9]{22}$/;
  const allowedKinds = new Set(['track','album','playlist','episode','show']);
  function embedSource(raw) {
    if (typeof raw !== 'string' || /\s/.test(raw.trim())) return null;
    let url;
    try { url = new URL(raw.trim()); } catch { return null; }
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
    const host = url.hostname.toLowerCase();
    let parts = url.pathname.split('/').filter(Boolean);
    if (['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be','www.youtu.be','www.youtube-nocookie.com'].includes(host)) {
      let id = '';
      if (host.endsWith('youtu.be')) id = parts.length === 1 ? parts[0] : '';
      else if (parts[0] === 'watch') id = url.searchParams.get('v') || '';
      else if (parts.length === 2 && ['shorts','live','embed'].includes(parts[0])) id = parts[1];
      if (youtube.test(id)) return {kind:'youtube', url:`https://www.youtube-nocookie.com/embed/${id}`, title:'YouTube video'};
    }
    if (host === 'open.spotify.com') {
      if (/^intl-[a-z]{2}$/.test(parts[0] || '')) parts = parts.slice(1);
      if (parts[0] === 'embed') parts = parts.slice(1);
      if (parts.length === 2 && allowedKinds.has(parts[0]) && spotify.test(parts[1])) {
        return {kind:'spotify', url:`https://open.spotify.com/embed/${parts[0]}/${parts[1]}`, title:`Spotify ${parts[0]}`};
      }
    }
    return null;
  }
  const el = (tag, className='') => {
    const result=document.createElement(tag);
    if (className) result.className = className;
    return result;
  };
  function inline(parent, raw) {
    let start = 0;
    token.lastIndex = 0;
    for (const match of raw.matchAll(token)) {
      parent.append(document.createTextNode(raw.slice(start, match.index)));
      if (match[1] != null) {
        const anchor = el('a');
        // Protocol was constrained in the token; check once more before assigning.
        const url = match[2];
        if (/^(https?:\/\/|mailto:)/.test(url)) {
          anchor.href = url; anchor.target='_blank';anchor.rel='noopener noreferrer';
          anchor.textContent=match[1];parent.append(anchor);
        } else parent.append(document.createTextNode(match[0]));
      } else {
        const tag=match[3] != null?'strong':match[4] != null?'em':'code';
        const content=match[3] ?? match[4] ?? match[5];
        const node=el(tag);node.textContent=content;parent.append(node);
      }
      start = match.index + match[0].length;
    }
    parent.append(document.createTextNode(raw.slice(start)));
  }
  function render(target, text) {
    target.replaceChildren();
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    let currentP=null, list=null, listKind='';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) {currentP=null;list=null;listKind='';continue;}
      const embed = embedSource(line);
      const heading=line.match(/^(#{1,2})\s+(.+)$/);
      const bullet=line.match(/^[-*]\s+(.+)$/);
      const number=line.match(/^\d{1,3}\.\s+(.+)$/);
      const quotation=line.match(/^>\s?(.+)$/);
      if (embed) {
        currentP=null;list=null;listKind='';
        const wrapper=el('div','note-embed note-embed-'+(embed.kind==='youtube'?'video':'spotify'));
        const frame=el('iframe'); frame.src=embed.url;frame.title=embed.title;
        frame.loading='lazy';frame.referrerPolicy='strict-origin-when-cross-origin';
        frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';
        frame.allowFullscreen=true;
        if (embed.kind === 'spotify') frame.height=embed.url.includes('/track/') || embed.url.includes('/episode/') ? '152' : '352';
        wrapper.append(frame);target.append(wrapper);
      } else if (heading || quotation) {
        currentP=null;list=null;listKind='';
        const block=el(quotation?'blockquote':heading[1].length===1?'h2':'h3');
        inline(block, (quotation||heading)[quotation?1:2]);target.append(block);
      } else if (bullet || number) {
        currentP=null;
        const kind=bullet?'ul':'ol';
        if (!list || kind!==listKind) {list=el(kind);listKind=kind;target.append(list);}
        const li=el('li');inline(li,(bullet||number)[1]);list.append(li);
      } else {
        list=null;listKind='';
        if (!currentP) {currentP=el('p');target.append(currentP);} else currentP.append(el('br'));
        inline(currentP,line);
      }
    }
  }
  window.NoteFormatter = Object.freeze({render, embedSource});
})();
