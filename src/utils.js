// to generate the random job id
import { v4 as uuidv4 } from 'uuid';

export function nowIso() {
  return new Date().toISOString();
}

export function delayMs(seconds) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, seconds*1000)));
}

export { uuidv4 };
