# midi-emulicious

A virtual MIDI device that sends data to an Emulicious emulated serial port.

To install dependencies:

```bash
bun install
```

To run:

Start up Emulicious in host mode. You can run Emulicious manually and choose `Network > Host` from the menu. Or run it from command line:

```bash
$ java -jar /path/to/Emulicious/Emulicious.jar -- -link localhost path/to/rom.gb
```

Then run midi-emulicious to create the virtual MIDI device:

```bash
bun run index.ts
```

Choose the "Emulicious" MIDI device in your DAW and begin bleeping.
