import {
  Client,
  Message,
  create as createWAClient,
  ev,
} from "@open-wa/wa-automate";
import { rmSync } from "fs";
import http from "http";
import decryptViewOncePhoto from "./helpers/decryptViewOncePhoto";
import isCommand from "./utils/isCommand";
import { logWithColor } from "./utils/logger";
import { commands } from "./utils/userCommands";

let pairingCode: string | null = null;
let isConnected = false;

// Sikiliza Pairing Code kutoka @open-wa/wa-automate
ev.on("pairingCode.**", (code: string) => {
  pairingCode = code;
  isConnected = false;
  logWithColor.green(`PAIRING CODE YAKO NI: ${code}`);
});

const PORT = Number(process.env.PORT) || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    if (isConnected) {
      res.end("<h2>SUREBOY WhatsApp Bot Imeunganishwa na Iko Hewani!</h2>");
    } else if (pairingCode) {
      res.end(`
        <html>
          <head><meta http-equiv="refresh" content="15"></head>
          <body style="font-family:sans-serif;text-align:center;padding:40px;">
            <h2>Ingiza Pairing Code Hii Kwenye WhatsApp Yako</h2>
            <div style="font-size:36px;font-weight:bold;letter-spacing:6px;background:#f0f0f0;padding:20px;border-radius:10px;display:inline-block;margin:20px 0;">
              ${pairingCode}
            </div>
            <p>Nenda WhatsApp &gt; Linked Devices &gt; Link a Device &gt; <b>Link with phone number instead</b></p>
          </body>
        </html>
      `);
    } else {
      res.end(`
        <html>
          <head><meta http-equiv="refresh" content="5"></head>
          <body style="font-family:sans-serif;text-align:center;padding:40px;">
            <h2>Inaandaa Pairing Code...</h2>
            <p>Subiri sekunde chache, ukurasa unajirefresh wenyewe...</p>
          </body>
        </html>
      `);
    }
  })
  .listen(PORT, () => {
    logWithColor.green(`Web server listening on port ${PORT}`);
  });

const bootstrap = (client: Client) => {
  isConnected = true;
  pairingCode = null;
  logWithColor.green("WhatsApp Bot imeunganishwa kikamilifu!");

  client.onAnyMessage(async (message: Message) => {
    if (!message.body) return;
    const bodyTrimmed = message.body.trim().toLowerCase();

    if ([".vv", ".vvo", "#dvo", ".dvo"].includes(bodyTrimmed)) {
      logWithColor.green(`Executing View Once command: ${bodyTrimmed}`);
      await decryptViewOncePhoto(client, message, true);
      return;
    }

    if (message.fromMe) {
      const splitMessage = message.body.split(" ");
      const commandName = splitMessage[0];
      if (isCommand(commandName)) {
        logWithColor.green(`Executing command ${commandName}`);
        commands[commandName as keyof typeof commands].function(
          client,
          message
        );
      }
    }
  });
};

const start = () => {
  try {
    rmSync("./_IGNORE_session", { recursive: true, force: true });
  } catch {}

  const phoneNumber = (process.env.PHONE_NUMBER || "").replace(/[^0-9]/g, "");

  createWAClient({
    useChrome: true,
    executablePath: process.env.CHROME_PATH || "/usr/bin/chromium",
    headless: true,
    usePairingCode: Boolean(phoneNumber),
    pairingCodePhoneNumber: phoneNumber || undefined,
    qrTimeout: 0,
    authTimeout: 0,
    timeout: 0,
    cacheEnabled: false,
    bypassCSP: true,
    disableSpins: true,
    killProcessOnBrowserClose: true,
    puppeteerOptions: {
      protocolTimeout: 120000,
    },
  })
    .then((client) => bootstrap(client))
    .catch((err) => {
      logWithColor.red(String(err));
      setTimeout(start, 5000);
    });
};

start();
