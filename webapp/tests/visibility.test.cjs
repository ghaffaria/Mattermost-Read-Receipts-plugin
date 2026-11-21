// Copyright 2026 Alireza Ghaffari
// SPDX-License-Identifier: MPL-2.0

const {test} = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../visibility.ts'), 'utf8');
const mod = {exports:{}};
vm.runInNewContext(ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2019}}).outputText,
    {exports:mod.exports, module:mod, Map, Set});
const {VisibilityClock, mergeReaders} = mod.exports;
test('continuous dwell honors the exact threshold and zero', () => {
    const c = new VisibilityClock(); c.update('p', true, 1000);
    assert.equal(c.due('p',2999,2000),false);
    assert.equal(c.due('p',3000,2000),true);
    assert.equal(c.due('p',1000,0),true);
});
test('scroll out and back starts a fresh interval', () => {
    const c=new VisibilityClock();c.update('p',true,1000);c.update('p',false,2500);c.update('p',true,2600);
    assert.equal(c.due('p',3100,2000),false);assert.equal(c.due('p',4600,2000),true);
});
test('hidden tab and channel changes discard all previous dwell', () => {
    const c=new VisibilityClock();c.update('p',true,1000);c.clear();c.update('p',true,3000);
    assert.equal(c.due('p',3100,2000),false);
});
test('removed posts lose dwell and do not inherit timers on remount',()=>{
    const c=new VisibilityClock();c.update('p',true,1000);c.keep(new Set());c.update('p',true,4000);
    assert.equal(c.due('p',4000,2000),false);
});
test('stale HTTP and duplicate WebSocket events cannot delete readers',()=>{
    assert.deepEqual(Array.from(mergeReaders(['a','b'],['a'])),['a','b']);
    assert.deepEqual(Array.from(mergeReaders(['a'],['b','b'])),['a','b']);
});
