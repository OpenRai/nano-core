import assert from 'node:assert/strict';
import * as core from '@openrai/nano-core';

const guards = [
  'isAccountString',
  'isHashString',
  'isRootString',
  'isRawAmountString',
  'isWorkString',
  'isSignatureString',
  'isPublicKeyString',
  'isSeedString',
];

for (const guard of guards) {
  assert.equal(typeof core[guard], 'function', `${guard} must be exported from the package root`);
}

assert.equal(core.isAccountString('nano_1111111111111111111111111111111111111111111111111111hifc8npp'), true);
assert.equal(core.isHashString('A'.repeat(64)), true);
assert.equal(core.isRawAmountString('340282366920938463463374607431768211455'), true);
