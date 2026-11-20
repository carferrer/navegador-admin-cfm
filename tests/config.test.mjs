import test from 'node:test';
import assert from 'node:assert/strict';
import {validate,render} from '../admin_browser/rootfs/opt/cfm/configure.mjs';

test('configuration fails closed, preserves TLS validation and has no shell interpolation',()=>{
  const r=render(validate({}));
  assert.match(r.accessMap,/default 0/);
  assert.match(r.accessServer,/\$remote_addr != 172\.30\.32\.2/);
  assert.match(r.accessServer,/return 403/);
  assert.equal(r.policies.policies.PasswordManagerEnabled,false);
  assert.ok(!JSON.stringify(r).includes('ignore-certificate'));
});
test('reject injection and invalid options',()=>{
  for(const v of [
    {admin_user_ids:['x"; allow all; #']},{display_width:'$(id)'},{persist_profile:'false'},
    {bookmarks:[{name:'x',url:'javascript:alert(1)'}]},
    {bookmarks:[{name:'x',url:'https://user:secret@router.local'}]},
    {bookmarks:[{name:'x',url:'https://router.local/\nattack'}]},
    {exchange_cleanup:'all'}, {display_height:0}
  ]) assert.throws(()=>validate(v));
});
test('bookmarks escape HTML and retain local URLs',()=>{
  const o=validate({bookmarks:[{name:'<script>"&',url:'https://192.0.2.1/'}]});
  const r=render(o);
  assert.ok(!r.home.includes('<script>'));
  assert.ok(r.home.includes('&lt;script&gt;'));
  assert.equal(r.policies.policies.ManagedBookmarks[1].url,'https://192.0.2.1/');
});
