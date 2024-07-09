import net, { Socket } from "node:net";
import { toHex } from "../utils";

const DEFAULT_HOSTNAME = "127.0.0.1";
const DEFAULT_PORT = 5887;

const SIOF_XFER_START = 0b10000000; /**< Serial IO: Start Transfer. Automatically cleared at the end of transfer */
const SIOF_CLOCK_INT = 0b00000001; /**< Serial IO: Use Internal clock */

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T | PromiseLike<T>) => void;
  reject: (e: Error) => void;
}

function makeDeferred<T>(): Deferred<T> {
  const deferred: Deferred<T> = {
    promise: new Promise<T>(() => {}),
    resolve: () => {
      throw new Error("Should never run");
    },
    reject: () => {},
  };

  deferred.promise = new Promise<T>((res, rej) => {
    deferred.resolve = res;
    deferred.reject = rej;
  });

  return deferred;
}

/** Initiates a new byte send */
const XFER_START = SIOF_XFER_START | SIOF_CLOCK_INT;

export class Emulicious {
  private dataSocket: net.Socket;
  private ackSocket: net.Socket;

  private readonly hostname: string;
  private readonly port: number;

  private readonly queue = new FifoQueue<number>();

  constructor({
    hostname = DEFAULT_HOSTNAME,
    port = DEFAULT_PORT,
    onDisconnect,
  }: {
    hostname?: string;
    port?: number;
    onDisconnect?: () => void;
  } = {}) {
    this.hostname = hostname;
    this.port = port;
    this.dataSocket = this.createSocket("DATA");
    this.ackSocket = this.createSocket("ACK");

    this.connect(onDisconnect);
  }

  async connect(onDisconnect?: () => void) {
    // data must connect first
    await this._connect(this.dataSocket, onDisconnect);
    await this._connect(this.ackSocket);
  }

  private async _connect(socket: Socket, onClose?: () => void) {
    return new Promise<void>((resolve, reject) => {
      socket.connect(this.port, this.hostname, resolve);

      socket.on("error", reject);
      onClose && socket.on("close", onClose);
    });
  }

  disconnect() {
    this.dataSocket.destroy();
    this.ackSocket.destroy();
  }

  sendBytes(bytes: number[]) {
    for (const byte of bytes) {
      this.queue.add(byte);
    }
    this.drainQueue();
  }

  private isDrainingQueue = false;

  private async drainQueue() {
    if (this.isDrainingQueue) return;

    this.isDrainingQueue = true;

    console.debug("drainQueue", this.queue.size());

    while (this.queue.hasNext()) {
      const byte = this.queue.next()!; // TODO: make a Symbol.iterator
      console.debug(byte);
      await this._send(byte);
    }
    this.isDrainingQueue = false;
  }

  private async _send(byte: number) {
    console.debug("DATA: -->", toHex(byte));

    // SEND BYTE:
    // 1. ---> DATA: [data, SC_REG]
    // 2. ---> ACK
    this.dataSocket.write(Uint8Array.from([byte, XFER_START]));
    this.sendAck();

    // 3. <--- ACK
    const ack = makeDeferred<void>();
    this.ackSocket.once("data", () => {
      ack.resolve();
    });

    const receiveAck = makeDeferred<void>();

    // RECEIVE BYTE:
    // 4. <--- RESPONSE
    this.dataSocket.once("data", () => {
      // 5. ---> ACK
      this.sendAck();

      receiveAck.resolve();
    });

    await Promise.all([ack.promise, receiveAck.promise]);
  }

  private sendAck() {
    console.debug("ACK");
    this.ackSocket.write(Uint8Array.from([0x0]));
  }

  private createSocket(name: string) {
    const socket = new Socket({ writable: true });

    socket.on("error", (e) =>
      console.error(new Error(`Socket error for ${name}: ${e.message}`))
    );

    socket.on("connect", () =>
      console.info(`${name}: connect`, socket.localPort)
    );

    socket.on("close", () => console.info(`${name}: close`));

    socket.on("data", (data) =>
      console.debug(`${name}: <----`, Array.from(data).map(toHex))
    );

    return socket;
  }
}

/** Simple FIFO queue to handle multi MIDI messages backing up */
class FifoQueue<T> {
  private readonly elements: T[] = [];

  next() {
    return this.elements.shift();
  }

  hasNext() {
    return this.elements.length > 0;
  }

  add(item: T) {
    this.elements.push(item);
  }

  size() {
    return this.elements.length;
  }
}
