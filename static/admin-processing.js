(() => {
  'use strict';
  const targetBytes = 2_600_000; // keep uploads below the server's 3 MB R2 request limit
  const enc = new TextEncoder();
  const xmp = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/" xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/"><dc:creator><rdf:Seq><rdf:li>Nicholas Kincaid</rdf:li></rdf:Seq></dc:creator><dc:rights><rdf:Alt><rdf:li xml:lang="x-default">© Nicholas Kincaid. All rights reserved.</rdf:li></rdf:Alt></dc:rights><photoshop:Credit>Nicholas Kincaid</photoshop:Credit><xmpRights:Marked>True</xmpRights:Marked></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
  function segment(payload) {
    const len = payload.byteLength + 2;
    if (len > 65535) throw new Error('Photo metadata segment too large');
    const result = new Uint8Array(len + 2);
    result[0] = 0xff;result[1] = 0xe1;result[2] = len >>> 8;result[3] = len & 255;
    result.set(payload, 4);return result;
  }
  const xmpPayload = (() => {
    const header = enc.encode('http://ns.adobe.com/xap/1.0/\0');
    const xml = enc.encode(xmp);
    const result = new Uint8Array(header.length + xml.length);
    result.set(header); result.set(xml,header.length); return segment(result);
  })();
  // Re-encode a safe copy of the embedded EXIF: fix Orientation and wipe the
  // GPS IFD and its referenced values, while retaining other camera settings.
  function normalizeOrientation(exif) {
    const result = new Uint8Array(exif);
    const tiff = 10;
    if (result.length < 24) return null;
    const le=result[tiff]===0x49 && result[tiff+1]===0x49;
    const be=result[tiff]===0x4d && result[tiff+1]===0x4d;
    if (!le && !be) return null;
    const view=new DataView(result.buffer);
    const get16=n=>view.getUint16(n,le), get32=n=>view.getUint32(n,le);
    const inside=(offset,length)=>Number.isSafeInteger(offset) && Number.isSafeInteger(length) && offset>=0 && length>=0 && offset+length<=result.length;
    if (get16(tiff+2)!==42) return null;
    const ifd=tiff+get32(tiff+4);
    if (!inside(ifd,2)) return null;
    const count=get16(ifd);
    if (count>500 || !inside(ifd+2,count*12+4)) return null;
    const gpsTypeSizes={1:1,2:1,3:2,4:4,5:8,6:1,7:1,8:2,9:4,10:8,11:4,12:8,13:4};
    for (let j=0;j<count;j++) {
      const at=ifd+2+j*12, tag=get16(at);
      if (tag===0x112 && get16(at+2)===3 && get32(at+4)===1) view.setUint16(at+8,1,le);
      if (tag!==0x8825) continue;
      if (get16(at+2)!==4 || get32(at+4)!==1) return null;
      const gps=tiff+get32(at+8);
      if (!inside(gps,2)) return null;
      const n=get16(gps);
      if (n>100 || !inside(gps+2,n*12+4)) return null;
      for (let j=0;j<n;j++) {
        const entry=gps+2+j*12;
        const sz=gpsTypeSizes[get16(entry+2)], items=get32(entry+4);
        if (!sz || !Number.isSafeInteger(items*sz)) return null;
        const length=items*sz;
        if (length>4) {
          const value=tiff+get32(entry+8);
          if (!inside(value,length)) return null;
          result.fill(0,value,value+length);
        }
      }
      result.fill(0,gps,gps+2+n*12+4);
      view.setUint32(at+8,0,le);
    }
    return result;
  }
  function exifSegment(bytes) {
    if (bytes[0]!==0xff || bytes[1]!==0xd8) return null;
    let at=2;
    while (at+4<bytes.length && bytes[at]===0xff) {
      const marker=bytes[at+1];
      if (marker===0xda || marker===0xd9) break;
      const length=(bytes[at+2]<<8)+bytes[at+3];
      if (length<2 || at+2+length>bytes.length) break;
      if (marker===0xe1 && bytes[at+4]===0x45 && bytes[at+5]===0x78 && bytes[at+6]===0x69 && bytes[at+7]===0x66 && bytes[at+8]===0 && bytes[at+9]===0) {
        return normalizeOrientation(bytes.slice(at,at+length+2));
      }
      at+=length+2;
    }
    return null;
  }
  async function toBlob(canvas,quality) {
    return new Promise((resolve,reject) => canvas.toBlob(blob => blob?resolve(blob):reject(new Error('JPEG export failed')),'image/jpeg',quality));
  }
  function cameraMetadata(jpeg) {
    // Small read-only EXIF parser for the exposure fields that were previously
    // extracted by Python from local GitHub files during a build.
    const raw=exifSegment(jpeg);
    if (!raw || raw.length < 24) return {};
    try {
      const start=10, view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);
      const le=raw[start]===0x49;
      const u16=at=>view.getUint16(at,le), u32=at=>view.getUint32(at,le);
      const valid=(at,n)=>at>=0 && n>=0 && at+n<=raw.length;
      const kinds={1:1,2:1,3:2,4:4,5:8,7:1,9:4,10:8};
      function fields(pos) {
        if(!valid(pos,2)) return new Map();
        const n=u16(pos);if(n>300 || !valid(pos+2,n*12+4))return new Map();
        const items=new Map();
        for(let i=0;i<n;i++){
          const at=pos+2+i*12, tag=u16(at),type=u16(at+2),count=u32(at+4);
          const bytes=(kinds[type]||0)*count;
          if(!bytes || bytes>2000)continue;
          const offset=bytes<=4?at+8:start+u32(at+8);
          if(!valid(offset,bytes))continue;
          if(type===2){const slice=raw.slice(offset,offset+bytes);items.set(tag,new TextDecoder('latin1').decode(slice).replace(/\0.*$/,'').trim());}
          else if(type===3 && count===1)items.set(tag,u16(offset));
          else if(type===4 && count===1)items.set(tag,u32(offset));
          else if((type===5 || type===10) && count===1){
            const a=type===5?u32(offset):view.getInt32(offset,le),b=type===5?u32(offset+4):view.getInt32(offset+4,le);
            if(b) items.set(tag,a/b);
          }
        }
        return items;
      }
      const root=fields(start+u32(start+4));
      const exif=fields(start+(root.get(0x8769)||0));
      const fmt=x=>Math.round(x*10)/10;
      const out={};
      if(root.get(0x0110))out.camera=root.get(0x0110);
      if(exif.get(0xA434))out.lens=exif.get(0xA434);
      if(exif.get(0x920A))out.focal_length=fmt(exif.get(0x920A))+' mm';
      if(exif.get(0x829D))out.aperture='f/'+fmt(exif.get(0x829D));
      if(exif.get(0x829A)){
        const secs=exif.get(0x829A);out.shutter_speed=secs<1?'1/'+Math.round(1/secs):fmt(secs)+' s';
      }
      if(exif.get(0x8827))out.iso=String(exif.get(0x8827));
      return out;
    }catch{return {};}
  }
  async function variants(blob) {
    const bitmap=await createImageBitmap(blob);
    try {
      const result=[];
      for(const width of [640,1280]) {
        const w=Math.min(width,bitmap.width);
        if(result.some(x=>x.width===w))continue;
        const h=Math.max(1,Math.round(bitmap.height*w/bitmap.width));
        const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
        canvas.getContext('2d').drawImage(bitmap,0,0,w,h);
        const thumb=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.78));
        if(thumb && thumb.type==='image/webp')result.push({width:w,blob:thumb});
      }
      return result;
    } finally {bitmap.close?.();}
  }
  async function prepare(file) {
    // Safari/iPhone photo support: fall back to HTMLImageElement when needed.
    // Always use the browser's upright rendering, then neutralize EXIF Orientation.
    let bitmap;
    let imageElement = null;
    if (typeof createImageBitmap === 'function') {
      try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
      catch { /* Some browser image decoders don't support HEIC/HEIF here. */ }
    }
    if (!bitmap) {
      const url = URL.createObjectURL(file);
      try {
        imageElement = new Image();
        imageElement.src = url;
        await imageElement.decode();
        bitmap = imageElement;
      } catch {
        throw new Error('This image format could not be opened. Try exporting a JPEG from Photos first.');
      } finally { URL.revokeObjectURL(url); }
    }
    let size=Math.min(1,2800/Math.max(bitmap.width,bitmap.height));
    let buffer;
    let exif=null;
    let camera={};
    if (/image\/jpeg/i.test(file.type) || /\.jpe?g$/i.test(file.name)) {
      const source=new Uint8Array(await file.arrayBuffer());
      exif=exifSegment(source);
      camera=cameraMetadata(source);
    }
    const addon = 2+xmpPayload.length+(exif?.length||0);
    let dimensions='', outputWidth=0, outputHeight=0;
    for (let round=0;round<12;round++) {
      const width=Math.max(1,Math.round(bitmap.width*size));
      const height=Math.max(1,Math.round(bitmap.height*size));
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d',{alpha:false});
      if (!ctx) throw new Error('Image processing unavailable');
      ctx.fillStyle='white';ctx.fillRect(0,0,width,height);
      ctx.drawImage(bitmap,0,0,width,height);
      dimensions=`${width} × ${height}`;
      outputWidth=width;outputHeight=height;
      for (const quality of [.88,.82,.75,.68,.58,.48]) {
        const jpeg=await toBlob(canvas,quality);
        if (jpeg.size+addon<=targetBytes) {buffer=new Uint8Array(await jpeg.arrayBuffer());break;}
      }
      if (buffer) break;
      size*=.82;
    }
    if (typeof bitmap.close === 'function') bitmap.close();
    if (!buffer) throw new Error('Could not reduce image below the upload size limit');
    const prefix=[buffer.subarray(0,2)];
    if (exif) prefix.push(exif);
    prefix.push(xmpPayload);
    prefix.push(buffer.subarray(2));
    const blob=new Blob(prefix,{type:'image/jpeg'});
    const filename=file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g,'-')+'-web.jpg';
    return {blob,filename,dimensions,width:outputWidth,height:outputHeight,meta:camera};
  }
  // Keep only a tiny editor preview in memory. Otherwise 90 prepared uploads
  // would pin up to ~234 MB of full-size JPEG blobs on a phone until navigation.
  async function preview(blob) {
    let image;
    try {
      image = await createImageBitmap(blob);
      const scale = Math.min(1, 360 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      const thumb = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.72));
      return thumb || blob;
    } catch {
      return blob; // Older browsers still get a functional preview.
    } finally {
      image?.close?.();
    }
  }
  function fmt(n) {return (n/1_000_000).toFixed(2)+' MB';}
  async function toGitHubBlobJSON(blob) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Could not encode photograph for upload'));
      reader.readAsDataURL(blob);
    });
    const prefix = 'data:image/jpeg;base64,';
    if (!dataUrl.startsWith(prefix)) throw new Error('Photo encoder returned an unexpected format');
    return JSON.stringify({ content: dataUrl.slice(prefix.length), encoding: 'base64' });
  }
  window.PhotoPrep = { prepare, preview, variants, fmt, toGitHubBlobJSON };
})();
