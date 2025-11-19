'use strict';

var mitt = require('mitt');

function _interopDefault (e) { return e && e.__esModule ? e : { default: e }; }

var mitt__default = /*#__PURE__*/_interopDefault(mitt);

// src/eventBus.ts
var eventBus = mitt__default.default();
var useEventBus = () => {
  return {
    emit(event, ...args) {
      eventBus.emit(event, args);
    },
    on(event, callback) {
      const listener = (args) => callback(...args);
      eventBus.on(event, listener);
      return listener;
    },
    fire(event, ...args) {
      eventBus.emit(event, args);
    },
    off(event, listener) {
      eventBus.off(event, listener);
    },
    once(event, callback) {
      const listener = (args) => callback(...args);
      const wrappedListener = (args) => {
        listener(args);
        eventBus.off(event, wrappedListener);
      };
      eventBus.on(event, wrappedListener);
      return wrappedListener;
    }
  };
};

exports.eventBus = eventBus;
exports.useEventBus = useEventBus;
