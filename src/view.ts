/// <reference lib="dom" />
/* The results webview's script (out/view.js): each render of src/panel.ts loads it afresh, so a new run starts unsorted.
 * Copying and saving go to the extension, which has the clipboard and the save dialog. */
import { attach } from "./grid.ts";

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const vscode = acquireVsCodeApi();

attach(document, {
  copy: (text) => vscode.postMessage({ copy: text }),
  save: (name, text) => vscode.postMessage({ save: { name, text } }),
});
