const { ipcRenderer } = require("electron");

const describeValue = (value) => {
  if (value instanceof Error) {
    return value.stack ?? value.message;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

window.addEventListener(
  "error",
  (event) => {
    ipcRenderer.send("t06-renderer-diagnostic", {
      kind: "error",
      message: event.error
        ? describeValue(event.error)
        : `${event.message} (${event.filename}:${event.lineno}:${event.colno})`
    });
  },
  true
);

window.addEventListener("unhandledrejection", (event) => {
  ipcRenderer.send("t06-renderer-diagnostic", {
    kind: "unhandledrejection",
    message: describeValue(event.reason)
  });
});
