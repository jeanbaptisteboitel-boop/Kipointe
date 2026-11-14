declare module "heic-decode" {
  export interface ImageDecodee {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }
  export interface ImageADecoder {
    width: number;
    height: number;
    decode(): Promise<ImageDecodee>;
  }
  const decode: {
    (p: { buffer: Uint8Array }): Promise<ImageDecodee>;
    all(p: { buffer: Uint8Array }): Promise<ImageADecoder[] & { dispose?: () => void }>;
  };
  export default decode;
}
