import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeExposureValue, exposureCaption} from '../admin-lib/exposure.js';
const cases = [
  ['aperture','f8','f/8'], ['aperture','F/8.0','f/8'], ['aperture','2.8','f/2.8'],
  ['focal_length','35','35mm'],['focal_length','35 mm','35mm'],['focal_length','50.0MM','50mm'],
  ['iso','400','ISO 400'],['iso','iso640','ISO 640'],['iso','ISO 100','ISO 100'],
  ['shutter_speed','1/250','1/250s'], ['shutter_speed','1/125 s','1/125s'],
  ['shutter_speed','0.5 sec','1/2s'], ['shutter_speed','0.008s','1/125s'], ['shutter_speed','2s','2s']
];
for(const [key,input,expected] of cases) test(`${key} ${input} -> ${expected}`,()=>assert.equal(normalizeExposureValue(key,input),expected));
test('malformed and zero values fail rather than being silently misinterpreted',()=>{
 for(const [key,input] of [['aperture','f0'],['iso','ISO banana'],['focal_length','35cm'],['shutter_speed','1/0'],['shutter_speed','abc'],['iso','0']]){
   assert.equal(normalizeExposureValue(key,input),null);
 }
 assert.equal(normalizeExposureValue('shutter_speed','250'),'250s'); // Never silently turn seconds into 1/250.
});
test('caption uses one consistent order and format',()=>{
 assert.equal(exposureCaption({focal_length:'35 mm',aperture:'f8',shutter_speed:'1/250 s',iso:'400'}),'35mm · f/8 · 1/250s · ISO 400');
});

import vm from 'node:vm';
import fs from 'node:fs';
test('admin browser formatter matches save API formatter',()=>{
  const sandbox={window:{}};
  vm.runInNewContext(fs.readFileSync(new URL('../static/admin-exposure.js',import.meta.url),'utf8'),sandbox);
  for(const key of ['focal_length','aperture','shutter_speed','iso']) {
    for(const value of ['', '35', 'f8', '1/250', '0.008s', 'ISO400', 'invalid']) {
      assert.equal(sandbox.window.PortfolioExposure.normalizeExposureValue(key,value),normalizeExposureValue(key,value));
    }
  }
});
