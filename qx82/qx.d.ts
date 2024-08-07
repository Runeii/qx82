/// <reference types="./types/global.d.ts" />
export declare function init(callback: () => void, config?: Partial<Config>): void;
export declare function frame(handler: () => void, fps?: number): void;
export declare function render(): void;
export declare function color(fg: number, bg: number): void;
export declare function getFgColor(): number;
export declare function getBgColor(): number;
export declare function cls(): void;
export declare function locate(col: number, row: number): void;
export declare function col(): number;
export declare function row(): number;
export declare function cursor(visible: boolean): void;
export declare function print(text: string): void;
export declare function printCentered(text: string, width: number): void;
export declare function drawText(x: number, y: number, text: string, fontId?: string): void;
export declare function measure(text: string): {
    cols: number;
    rows: number;
};
export declare function printChar(charCode: number | string, numTimes?: number): void;
export declare function printRect(widthCols: number, heightRows: number, charCode?: number): void;
export declare function printBox(widthCols: number, heightRows: number, fill?: boolean, borderChar?: number): void;
export declare function drawImage(x: number, y: number, image: HTMLImageElement): void;
export declare function drawImageRect(x: number, y: number, image: HTMLImageElement, srcX: number, srcY: number, width: number, height: number): void;
export declare function drawRect(x: number, y: number, width: number, height: number): void;
export declare function fillRect(x: number, y: number, width: number, height: number): void;
export declare function playSound(sfx: HTMLAudioElement, volume?: number, loop?: boolean): void;
export declare function spr(ch: number, x: number, y: number): void;
export declare function key(keyName: string): boolean;
export declare function keyp(keyName: string): boolean;
export declare function redefineColors(colors: string[]): void;
export declare function setFont(fontId?: string): void;
export declare function stopSound(sfx: HTMLAudioElement): void;
export declare function getContext(): never;
export declare function saveScreen(): never;
export declare function restoreScreen(screenData: ImageData): never;
