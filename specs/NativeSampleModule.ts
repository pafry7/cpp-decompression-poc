import {TurboModule, TurboModuleRegistry} from 'react-native';

export interface Spec extends TurboModule {
  readonly reverseString: (input: string) => string;
  readonly decompressGzip: (filePath: string) => string;
  readonly applySqliteDelta: (deltaDbPath: string, mainDbPath: string) => string;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeSampleModule');
