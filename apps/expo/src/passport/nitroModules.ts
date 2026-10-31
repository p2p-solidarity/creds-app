import type { getNfcPassport as getNfcPassportFn } from '@solidarity/nitro-attest';

type GetNfcPassport = typeof getNfcPassportFn;

export interface PassportNitroModuleFactories {
  readonly getNfcPassport: () => ReturnType<GetNfcPassport>;
}

export interface PassportNitroModules {
  readonly nfc: ReturnType<GetNfcPassport> | null;
}

const DEFAULT_FACTORIES: PassportNitroModuleFactories = {
  getNfcPassport: () => {
    const mod = require('@solidarity/nitro-attest') as {
      readonly getNfcPassport: GetNfcPassport;
    };
    return mod.getNfcPassport();
  },
};

export function loadPassportNitroModules(
  factories: PassportNitroModuleFactories = DEFAULT_FACTORIES
): PassportNitroModules {
  return { nfc: loadOrNull(factories.getNfcPassport) };
}

function loadOrNull<T>(load: () => T): T | null {
  try {
    return load();
  } catch {
    return null;
  }
}
