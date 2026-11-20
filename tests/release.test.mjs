import test from 'node:test';
import assert from 'node:assert/strict';
import {versionParts,releaseNotes} from '../scripts/release.mjs';

test('calendar versions preserve zero padding and reject invalid or injected input',()=>{
  assert.deepEqual(versionParts('2026.11.01'),[2026,11,1]);
  assert.deepEqual(versionParts('2026.11.100'),[2026,11,100]);
  for(const value of ['2026.13.01','2026.00.01','2026.11.00','2026.11.1','v2026.11.01','2026.11.01\n','$(id)','2026.11.01; echo x'])assert.throws(()=>versionParts(value));
});

test('release notes use exactly the requested section and retain previous history',()=>{
  const text='# Versión 2026.11.02 (2026-11-21)\n\n- Nuevo.\n\n## Validación\n\nCorrecta.\n\n# Versión 2026.11.01 (2026-11-20)\n\n- Anterior.\n\n# 0.1.2\n\n- Histórico.\n';
  assert.equal(releaseNotes(text,'2026.11.02'),'- Nuevo.\n\n## Validación\n\nCorrecta.\n');
  assert.equal(releaseNotes(text,'2026.11.01'),'- Anterior.\n');
  assert.throws(()=>releaseNotes(text,'2026.11.03'));
  assert.throws(()=>releaseNotes(text+text,'2026.11.01'));
  assert.throws(()=>releaseNotes('# Versión 2026.11.01 (2026-11-20)\n','2026.11.01'));
});
