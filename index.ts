import midi from "@julusian/midi";
import { Emulicious } from "./src/emulicious";
import { toHex } from "./utils";

const LOG_LEVEL = process.env.LOG_LEVEL || "info";

// hacks.. TODO: find the simplest log lib
switch (LOG_LEVEL) {
  case "warn":
    console.info = () => {};
  case "info":
    console.debug = () => {};
  case "debug":
    break;
}

// Create a virtual input port.
const midiIn = new midi.Input();
midiIn.openVirtualPort("Emulicious");

const emu = new Emulicious();

process.on("SIGINT", () => {
  emu.disconnect();
  midiIn.closePort();
  process.exit();
});

const MIDI_STATUS_POLY_AFTERTOUCH = 0xa0;
const MIDI_STATUS_CC = 0xb0;

midiIn.on("message", (_deltaTime, message) => {
  // ignore poly AT until I can figure out perf issues
  const [status] = message;
  if (status >= MIDI_STATUS_POLY_AFTERTOUCH && status < MIDI_STATUS_CC) {
    return;
  }

  console.info("MIDI: ", message.map(toHex));
  emu.sendBytes(message);
});
