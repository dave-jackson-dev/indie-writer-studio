import {
  BRIDGE_NAME,
  REQUEST_CHANNEL,
  type IndieWriterBridge,
} from '@indie-writer-studio/ipc-bridge';
import { contextBridge, ipcRenderer } from 'electron';

/**
 * The page's only route to the main process (ADR-004 D3): two functions over one channel.
 * `ipcRenderer` itself is never handed to the page. Runs in the sandbox, so it is bundled to a
 * single CommonJS file.
 */
const bridge: IndieWriterBridge = {
  request: (operation, input, options) =>
    ipcRenderer.invoke(REQUEST_CHANNEL, {
      operation,
      input,
      correlationId: options?.correlationId,
    }),
  help: (topic) =>
    ipcRenderer.invoke(REQUEST_CHANNEL, {
      operation: 'help',
      input: topic === undefined ? {} : { topic },
    }),
};

contextBridge.exposeInMainWorld(BRIDGE_NAME, bridge);
