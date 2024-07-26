import { CONFIG, setConfig } from "../config";
import { TextRenderer } from "./textrenderer";
import { InputSys } from "./input";
import { CursorRenderer } from "./cursorrenderer";
import * as qut from "../qut";
import * as vjoy from "./vjoy";
import type * as importedTv3d from "./tv3d";

// This is the tv3d module, which we import on init, only if this effect is enabled.
let tv3d: typeof importedTv3d;

export let textRenderer: TextRenderer;
export let inputSys: InputSys;
export let cursorRenderer: CursorRenderer;

export let realCanvas: HTMLCanvasElement;

export let realCtx: CanvasRenderingContext2D;  // Will always be null if THREE_SETTINGS is on.

export let canvas: HTMLCanvasElement;

export let ctx: CanvasRenderingContext2D;

let lastFrameTime: null | number = null;
let crashed = false;

export let deltaTime = 0;  // Time elapsed since last frame.

export const drawState = {
  fgColor: 7,
  bgColor: 0,  // -1 means transparent

  cursorCol: 0,
  cursorRow: 0,

  cursorVisible: false, // Don't change this directly, use cursorRenderer.setCursorVisible()
};

// If set, initialization has successfully concluded.
let initDone = false;
// If set, this is the callback to call on every animation frame.
let frameHandler: (() => void) | null = null;
// If frameHandler is set, this is the target interval at which to call it.
// This is the reciprocal of the FPS, so if FPS is 30, this will be 1/30.
let frameHandlerTargetInterval: number | null = null;
// If true, there's an animation frame pending run (it was requested but not run yet).
let animFrameRequested = false;
// Time remaining in seconds to call the next frame handler.
let timeToNextFrame = 0;

// HTML element for the "scan lines" effect, if created.
let scanLinesEl: HTMLElement | null = null;

// If this is not null, then there is currently an async API call in progress,
// which means other API calls can't be called. If not null, this is an object with:
// {
//   name: the name of the async function that was called.
//   resolve: the promise resolve function to call.
//   reject: the reject function to call if there is an error.
// }
let pendingAsync: {
  name: string,
  resolve: (result: unknown) => void,
  reject: (error: unknown) => void,
} | null = null;

// If this is true, then the screen is "dirty" and needs to render.
let dirty = false;

export function init(callback: () => void, userConfig?: Partial<Config>) {
  qut.checkFunction("callback", callback);

  if (userConfig) {
    setConfig(userConfig);
  }

  qut.log(`Using config:, ${JSON.stringify(CONFIG)}`)
  asyncInit(callback);
}

const SCREEN_WIDTH = CONFIG.SCREEN_COLS * CONFIG.CHR_WIDTH;
const SCREEN_HEIGHT = CONFIG.SCREEN_ROWS * CONFIG.CHR_HEIGHT;

let SCREEN_EL_WIDTH = 0;
let SCREEN_EL_HEIGHT = 0;
let SCREEN_REAL_WIDTH = 0;
let SCREEN_REAL_HEIGHT = 0;


async function asyncInit(callback: () => void) {
  qut.log("Sys init.");

  if (CONFIG.THREE_SETTINGS) {
    qut.log("Initializing 3D.");
    tv3d = await import("./tv3d");
    qut.log("3D module loaded.");
  }

  // Set up the real canvas (the one that really exists onscreen).
  realCanvas = document.createElement("canvas");
  if (CONFIG.CANVAS_SETTINGS && CONFIG.CANVAS_SETTINGS.CANVAS_ID) {
    realCanvas.setAttribute("id", CONFIG.CANVAS_SETTINGS.CANVAS_ID);
  }
  if (CONFIG.CANVAS_SETTINGS && CONFIG.CANVAS_SETTINGS.CANVAS_CLASSES) {
    for (const className of CONFIG.CANVAS_SETTINGS.CANVAS_CLASSES) {
      realCanvas.classList.add(className);
    }
  }
  // Prevent default touch behavior on touch devices.
  realCanvas.addEventListener("touchstart", e => e.preventDefault());

  // Figure out where to add the canvas.
  let container: HTMLElement | null = document.body;
  if (CONFIG.CANVAS_SETTINGS && CONFIG.CANVAS_SETTINGS.CONTAINER) {
    // Ok, where do you want your canvas?
    const containerSpec = CONFIG.CANVAS_SETTINGS.CONTAINER as null | HTMLElement;
    if (typeof (containerSpec) === "string") {
      // This is the ID of an HTML element, so go get it.
      container = document.getElementById(containerSpec);
      if (!container) {
        console.error("QX82: Could not find container element with ID: " + containerSpec);
        container = document.body;
      }
    } else if (containerSpec instanceof HTMLElement) {
      // This is directly an HTMLElement instance, so use that.
      container = containerSpec;
    } else {
      // No idea what this is.
      console.error("QX82: CONFIG.CANVAS_SETTINGS.CONTAINER must be either an ID of an HTMLElement.");
      container = document.body;
    }
  }

  // Put the canvas in the container.
  container.appendChild(realCanvas);

  // Set up the virtual canvas (the one we render to). This canvas isn't part of the document
  // (it's not added to document.body), it only exists off-screen.
  canvas = document.createElement("canvas");
  canvas.width = SCREEN_WIDTH;
  canvas.height = SCREEN_HEIGHT;
  canvas.style.width = SCREEN_WIDTH + "px";
  canvas.style.height = SCREEN_HEIGHT + "px";

  ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = false;

  // Initialize subsystems
  textRenderer = new TextRenderer();
  inputSys = new InputSys();
  cursorRenderer = new CursorRenderer();

  await textRenderer.initAsync();

  // Update the positioning and size of the canvas.
  updateLayout(false);
  window.addEventListener("resize", () => updateLayout(true));

  if (tv3d) {
    tv3d.setup(realCanvas, canvas);
    // Needs to update again because THREE.js messes around with the canvas. I think.
    updateLayout(false);
  }

  if (isMobile()) {
    vjoy.setup();
  }

  initDone = true;

  // Work around an init bug where text would initially not render
  // on Firefox. I'm not entirely sure I understand why, but this seems
  // to fix it (perhaps waiting 1 frame gives the canvas time to initialize).
  await new Promise(resolve => setTimeout(resolve, 1));

  await callback();
  render();
}

export function getContext() {
  return ctx;
}

// Checks that the given API method can be called right now.
export function preflight(apiMethod: string) {
  if (crashed) {
    throw new Error(`Can't call API method ${apiMethod}() because the engine has crashed.`);
  }
  if (!initDone) {
    qut.fatal(`Can't call API method ${apiMethod}(): API not initialized. ` +
      `Call initAsync() wait until it finishes before calling API methods.`);
  }
  if (pendingAsync) {
    qut.fatal(`Can't call API method ${apiMethod}() because there is a pending async ` +
      `call to ${pendingAsync.name}() that hasn't finished running yet. Are you missing ` +
      `an 'await' keyword to wait for the async method? Use 'await ${pendingAsync.name}()',` +
      `not just '${pendingAsync.name}()'`);
  }
}

export function startAsync(asyncMethodName: string, resolve: (value: unknown) => void, reject: () => void) {
  if (pendingAsync) {
    throw new Error("Internal bug: startAsync called while pendingAsync is not null. " +
      "Missing preflight() call?");
  }
  pendingAsync = {
    name: asyncMethodName,
    resolve,
    reject,
  }
  render();
}

export function hasPendingAsync(asyncMethodName: string) {
  return pendingAsync && pendingAsync.name === asyncMethodName;
}

function endAsyncImpl(asyncMethodName: string, isError: boolean, result: unknown) {
  if (!pendingAsync) {
    throw new Error(`Internal bug: endAsync(${asyncMethodName}) called with no pendingAsync`);
  }
  if (pendingAsync.name !== asyncMethodName) {
    throw new Error(`Internal bug: endAsync(${asyncMethodName}) called but pendingAsync.name ` +
      `is ${pendingAsync.name}`);
  }
  const fun = isError ? pendingAsync.reject : pendingAsync.resolve;
  pendingAsync = null;
  fun(result);
}

export function resolveAsync(asyncMethodName: string, result: unknown) {
  endAsyncImpl(asyncMethodName, false, result);
}

export function failAsync(asyncMethodName: string, error: Error) {
  endAsyncImpl(asyncMethodName, true, error);
}

export function setFrameHandler(callback: () => void, targetFps: number) {
  frameHandler = callback;
  frameHandlerTargetInterval = 1.0 / (targetFps || 30);
  timeToNextFrame = 0;
  // If we didn't already, request an animation frame.
  if (!animFrameRequested) {
    window.requestAnimationFrame(doFrame);
  }
}

export function render() {
  if (crashed) return;
  if (tv3d) {
    tv3d.updateScreen();
    return;
  }
  realCtx.imageSmoothingEnabled = false;
  realCtx.clearRect(0, 0, realCanvas.width, realCanvas.height);
  realCtx.drawImage(canvas,
    0, 0, realCanvas.width, realCanvas.height)
  dirty = false;
  cursorRenderer.drawCursor(realCtx, realCanvas.width, realCanvas.height);
}

// Marks the screen as dirty and renders it at the next available opportunity.
export function markDirty() {
  if (dirty) return;
  dirty = true;
  // Render at the next available opportunity. Note that we never schedule more than one
  // of these calls because we only schedule when dirty was false and becomes true.
  setTimeout(render, 1);
}

export function cls() {
  ctx.fillStyle = getColorHex(drawState.bgColor);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  setCursorLocation(0, 0);
  markDirty();
}

export function defineColors(colors: string[]) {
  qut.checkArray("colors", colors);
  CONFIG.COLORS = colors.slice();
  textRenderer.regenColors();
}

export function setColor(fg: number, bg: number) {
  qut.checkNumber("fg", fg);
  drawState.fgColor = Math.round(fg);
  if (bg !== undefined) {
    qut.checkNumber("bg", bg);
    drawState.bgColor = Math.round(bg);
  }
}

export function setCursorLocation(col: number, row: number) {
  qut.checkNumber("col", col);
  if (row !== undefined) qut.checkNumber("row", row);
  drawState.cursorCol = Math.round(col);
  if (row !== undefined) drawState.cursorRow = Math.round(row);
}

export function getColorHex(c: number | string) {
  if (typeof (c) !== "number") return "#f0f";
  if (c < 0) return "#000";
  c = qut.clamp(Math.round(c), 0, CONFIG.COLORS.length - 1);
  return CONFIG.COLORS[c];
}

export function getNow() {
  return window.performance.now ?
    window.performance.now() : (new Date()).getTime();
}

export function drawImage(img: HTMLImageElement, x: number, y: number, srcX?: number, srcY?: number, width?: number, height?: number) {
  qut.checkInstanceOf("img", img, HTMLImageElement);
  qut.checkNumber("x", x);
  qut.checkNumber("y", y);
  if (srcX !== undefined) qut.checkNumber("srcX", srcX);
  if (srcY !== undefined) qut.checkNumber("srcY", srcY);
  if (width !== undefined) qut.checkNumber("width", width);
  if (height !== undefined) qut.checkNumber("height", height);
  if (srcX !== undefined && srcY !== undefined &&
    width !== undefined && height !== undefined) {
    ctx.drawImage(img, srcX, srcY, width, height, x, y, width, height);
  } else {
    ctx.drawImage(img, x, y);
  }
}

export function drawRect(x: number, y: number, width: number, height: number) {
  qut.checkNumber("x", x);
  qut.checkNumber("y", y);
  qut.checkNumber("width", width);
  qut.checkNumber("height", height);
  let oldStrokeStyle = ctx.strokeStyle;
  ctx.strokeStyle = getColorHex(drawState.fgColor);
  // Must add 0.5 to x and y so we draw in the "middle"
  // of the pixel. Weird canvas floating-point coords.
  ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5,
    Math.round(width) - 1, Math.round(height) - 1);
  ctx.strokeStyle = oldStrokeStyle;
}

export function fillRect(x: number, y: number, width: number, height: number) {
  qut.checkNumber("x", x);
  qut.checkNumber("y", y);
  qut.checkNumber("width", width);
  qut.checkNumber("height", height);
  ctx.fillStyle = getColorHex(drawState.fgColor);
  // Must add 0.5 to x and y so we draw in the "middle"
  // of the pixel. Weird canvas floating-point coords.
  ctx.fillRect(Math.round(x) + 0.5, Math.round(y) + 0.5,
    Math.round(width) - 1, Math.round(height) - 1);
}

export function saveScreen() {
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export function restoreScreen(screenData: ImageData) {
  qut.checkInstanceOf("screenData", screenData, ImageData);
  ctx.putImageData(screenData, 0, 0);
}

async function doFrame() {
  animFrameRequested = false;

  const now = getNow();
  deltaTime = lastFrameTime !== null ? 0.001 * (now - lastFrameTime) : (1 / 60.0);
  deltaTime = Math.min(deltaTime, 0.05);
  lastFrameTime = now;

  timeToNextFrame += deltaTime;

  let numFramesDone = 0;
  if (!frameHandlerTargetInterval) {
    throw new Error('Internal bug: frameHandlerTargetInterval is null');
  }
  while (frameHandler && numFramesDone < 4 && timeToNextFrame > frameHandlerTargetInterval) {
    await frameHandler();
    inputSys.onEndFrame();
    timeToNextFrame -= frameHandlerTargetInterval;
    ++numFramesDone;
  }
  render();

  // If we still have a frame handler, request the next animation frame.
  if (frameHandler) {
    animFrameRequested = true;
    window.requestAnimationFrame(doFrame);
  }
}

function updateLayout(renderNow: unknown) {
  if (CONFIG.THREE_SETTINGS) updateLayout3d();
  else updateLayout2d();
  if (renderNow) render();
}

function updateLayout3d() {
  const autoSize = !CONFIG.CANVAS_SETTINGS || CONFIG.CANVAS_SETTINGS.AUTO_SIZE;
  const autoPos = !CONFIG.CANVAS_SETTINGS || CONFIG.CANVAS_SETTINGS.AUTO_POSITION;

  if (!tv3d) {
    throw new Error("Internal bug: updateLayout3d() called but 3D effect is disabled.");
  }

  // Get the desired canvas size. This already takes into account the auto-size setting.
  const size = tv3d.getDesiredCanvasSize(realCanvas);
  // Width and height of screen as displayed in HTML.
  SCREEN_EL_WIDTH = size.width;
  SCREEN_EL_HEIGHT = size.height;
  // Real width and height of screen.
  SCREEN_REAL_WIDTH = size.width;
  SCREEN_REAL_HEIGHT = size.height;
  if (autoSize) {
    realCanvas.style.width = size.width + "px";
    realCanvas.style.height = size.height + "px";
  }
  if (autoPos) {
    realCanvas.style.position = "absolute";
    realCanvas.style.left = "0px";
    realCanvas.style.top = "0px";
  }
}

function updateLayout2d() {
  const autoSize = !CONFIG.CANVAS_SETTINGS || CONFIG.CANVAS_SETTINGS.AUTO_SIZE;
  const autoPos = !CONFIG.CANVAS_SETTINGS || CONFIG.CANVAS_SETTINGS.AUTO_POSITION;

  // Does the user want the canvas scale factor to be computed automatically?
  let useAutoScale = typeof (CONFIG.SCREEN_SCALE) !== 'number';
  // Computed canvas scale factor.
  let scale: number;

  if (useAutoScale) {
    const frac = CONFIG.MAX_SCREEN_FRACTION || 0.8;
    // Depending on whether or not auto-sizing is on, the available size will be either the
    // full screen size, or the actual current size.
    const availableSize = autoSize ?
      { width: frac * window.innerWidth, height: frac * window.innerHeight } :
      realCanvas.getBoundingClientRect();
    // Find the biggest scale factor for which the canvas will still fit on the available size.
    scale = Math.floor(Math.min(
      availableSize.width / SCREEN_WIDTH,
      availableSize.height / SCREEN_HEIGHT));
    // That's the scale factor, but clamp it between 1 and 5 for sanity.
    scale = Math.min(Math.max(scale, 1), 5);
    qut.log(`Auto-scale: available size ${availableSize.width} x ${availableSize.height}, scale ${scale}, dpr ${window.devicePixelRatio}`);
  } else {
    // Fixed scale.
    // @ts-expect-error If this was auto, wouldn't multiplication below fail?
    scale = CONFIG.SCREEN_SCALE;
  }

  // Width and height of screen as displayed in HTML.
  SCREEN_EL_WIDTH = SCREEN_WIDTH * scale;
  SCREEN_EL_HEIGHT = SCREEN_HEIGHT * scale;
  // Real width and height of screen.
  SCREEN_REAL_WIDTH = SCREEN_WIDTH * scale;
  SCREEN_REAL_HEIGHT = SCREEN_HEIGHT * scale;

  if (autoSize) {
    // Set its size based on what we computed above.
    realCanvas.style.width = SCREEN_EL_WIDTH + "px";
    realCanvas.style.height = SCREEN_EL_HEIGHT + "px";
    realCanvas.width = SCREEN_REAL_WIDTH;
    realCanvas.height = SCREEN_REAL_HEIGHT;
  } else {
    // Set its resolution to match its actual size.
    const actualSize = realCanvas.getBoundingClientRect();
    realCanvas.width = actualSize.width;
    realCanvas.height = actualSize.height;
  }
  realCtx = realCanvas.getContext("2d") as CanvasRenderingContext2D;
  realCtx.imageSmoothingEnabled = false;

  if (autoPos) {
    realCanvas.style.position = "absolute";
    realCanvas.style.left = Math.round((window.innerWidth - realCanvas.width) / 2) + "px";
    realCanvas.style.top = Math.round((window.innerHeight - realCanvas.height) / 2) + "px";
  }

  const scanLinesOp = CONFIG.SCAN_LINES_OPACITY || 0;
  if (scanLinesOp > 0) {
    if (autoPos && autoSize) {
      if (!scanLinesEl) {
        scanLinesEl = document.createElement("div");
        document.body.appendChild(scanLinesEl);
      }
      scanLinesEl.style.background =
        "linear-gradient(rgba(0, 0, 0, 0) 50%, rgba(0, 0, 0, 1) 50%), " +
        "linear-gradient(90deg, rgba(255, 0, 0, .6), rgba(0, 255, 0, .2), rgba(0, 0, 255, .6))";
      scanLinesEl.style.backgroundSize = `100% 4px, 3px 100%`;
      scanLinesEl.style.opacity = `${scanLinesOp}`;
      scanLinesEl.style.position = "absolute";
      scanLinesEl.style.left = realCanvas.style.left;
      scanLinesEl.style.top = realCanvas.style.top;
      scanLinesEl.style.width = realCanvas.style.width;
      scanLinesEl.style.height = realCanvas.style.height;
      scanLinesEl.style.zIndex = "1";
    } else {
      console.error("QX82: 2D scanlines effect only works if CONFIG.CANVAS_SETTINGS.AUTO_POS and AUTO_SIZE are both on.");
    }
  }
}

let crashing = false;
export function handleCrash(errorMessage = "Fatal error") {
  if (crashed || crashing) return;
  crashing = true;
  setColor(CONFIG.COLORS.length - 1, 0);
  cls();
  drawState.cursorCol = drawState.cursorRow = 1;
  textRenderer.print("*** CRASH ***:\n" + errorMessage);
  render();
  crashing = false;
  crashed = true;
}

function isMobile() {
  return isIOS() || isAndroid();
}

function isIOS() {
  return /(ipad|ipod|iphone)/i.test(navigator.userAgent);
}

function isAndroid() {
  return /android/i.test(navigator.userAgent);
}

