import {
  type AccountString,
  type Branded,
  type HashString,
  type PrivateKeyString,
  type PublicKeyString,
  type RawAmountString,
  type RootString,
  type SeedString,
  type SignatureString,
  type WorkString,
  NanoAddress,
  NanoAmount,
  NOMS,
  isAccountString,
  isHashString,
} from '@openrai/nano-core';

type Assert<T extends true> = T;
type IsAssignable<From, To> = [From] extends [To] ? true : false;

type _PlainStringIsNotHash = Assert<IsAssignable<string, HashString> extends false ? true : false>;
type _HashIsNotRoot = Assert<IsAssignable<HashString, RootString> extends false ? true : false>;
type _AccountIsNotPublicKey = Assert<IsAssignable<AccountString, PublicKeyString> extends false ? true : false>;
type _WorkIsNotSignature = Assert<IsAssignable<WorkString, SignatureString> extends false ? true : false>;
type _SeedIsNotPrivateKey = Assert<IsAssignable<SeedString, PrivateKeyString> extends false ? true : false>;
type _GenericBrandIsNotPlainString = Assert<IsAssignable<string, Branded<string, 'ConsumerFixture'>> extends false ? true : false>;

const address = NanoAddress.parse('nano_1111111111111111111111111111111111111111111111111111hifc8npp');
const account: AccountString = address.toString();
const publicKey: PublicKeyString = address.publicKey;
const amount: RawAmountString = NanoAmount.fromRaw('1').raw;
const messageHash: HashString = NOMS.hashMessage('public API type check');

declare const candidate: unknown;

if (isAccountString(candidate)) {
  const narrowed: AccountString = candidate;
  void narrowed;
}

if (isHashString(candidate)) {
  const narrowed: HashString = candidate;
  void narrowed;
}

void account;
void publicKey;
void amount;
void messageHash;
