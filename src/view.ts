/// <reference lib="dom" />
/* The results webview's script (out/view.js): each render of src/panel.ts loads it afresh, so a new run starts unsorted. */
import { attach } from "./grid.ts";

attach(document);
