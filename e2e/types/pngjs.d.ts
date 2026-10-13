// The part of pngjs the visual comparison uses (the package ships no types).
declare module 'pngjs' {
  export class PNG {
    constructor(options: { width: number; height: number });
    width: number;
    height: number;
    data: Buffer;
    static sync: { read(buffer: Buffer): PNG; write(png: PNG): Buffer };
    static bitblt(source: PNG, target: PNG, sx: number, sy: number, width: number, height: number, dx: number, dy: number): void;
  }
}
