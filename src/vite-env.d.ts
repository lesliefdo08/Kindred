/// <reference types="vite/client" />

import type { KindredApi } from "./types";

declare global {
  interface Window {
    kindredAPI?: KindredApi;
  }
}

export {};
