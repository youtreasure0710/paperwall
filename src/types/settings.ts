export type ReaderMode = 'system' | 'custom';

export interface AppSettings {
  reader_mode: ReaderMode;
  external_reader_path?: string;
}
