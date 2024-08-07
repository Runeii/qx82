/// <reference types="./types/global.d.ts" />
import { TextRenderer } from "./textrenderer";
import { InputSys } from "./input";
import { CursorRenderer } from "./cursorrenderer";
export declare let textRenderer: TextRenderer;
export declare let inputSys: InputSys;
export declare let cursorRenderer: CursorRenderer;
export declare let realCanvas: HTMLCanvasElement;
export declare let realCtx: CanvasRenderingContext2D;
export declare let canvas: HTMLCanvasElement;
export declare let ctx: CanvasRenderingContext2D;
export declare let deltaTime: number;
export declare const drawState: {
    fgColor: number;
    bgColor: number;
    cursorCol: number;
    cursorRow: number;
    cursorVisible: boolean;
};
export declare function init(callback: () => void, userConfig?: Partial<Config>): void;
export declare function getContext(): CanvasRenderingContext2D;
export declare function preflight(apiMethod: string): void;
export declare function startAsync(asyncMethodName: string, resolve: (value: unknown) => void, reject: () => void): void;
export declare function hasPendingAsync(asyncMethodName: string): boolean | null;
export declare function resolveAsync(asyncMethodName: string, result: unknown): void;
export declare function failAsync(asyncMethodName: string, error: Error): void;
export declare function setFrameHandler(callback: () => void, targetFps: number): void;
export declare function render(): void;
export declare function markDirty(): void;
export declare function cls(): void;
export declare function defineColors(colors: string[]): void;
export declare function setColor(fg: number, bg: number): void;
export declare function setCursorLocation(col: number, row: number): void;
export declare function getColorHex(c: number | string): string;
export declare function getNow(): number;
export declare function drawImage(img: HTMLImageElement, x: number, y: number, srcX?: number, srcY?: number, width?: number, height?: number): void;
export declare function drawRect(x: number, y: number, width: number, height: number): void;
export declare function fillRect(x: number, y: number, width: number, height: number): void;
export declare function saveScreen(): ImageData;
export declare function restoreScreen(screenData: ImageData): void;
export declare function handleCrash(errorMessage?: string): void;
