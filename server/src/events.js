import { EventEmitter } from "events";

const emitter = new EventEmitter();

export function emitEvent(sessionId, event) {
  emitter.emit(sessionId, event);
}

export function subscribe(sessionId, cb) {
  emitter.on(sessionId, cb);
  return () => emitter.off(sessionId, cb);
}
