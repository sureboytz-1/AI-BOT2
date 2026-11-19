import {
  Client,
  Message,
  create as createWAClient,
  ev,
} from "@open-wa/wa-automate";
import http from "http";
import decryptViewOncePhoto from "./helpers/decryptViewOncePhoto";
import isCommand from "./utils/isCommand";
import { logWithColor } from "./utils/logger";
import { commands } from "./utils/userCommands";

let latestQrDataUrl: string | null = null;
let isConnected = false;

// Sikiliza QR code kutoka @open-wa/wa-automate ili ionekane kwenye kivinjari
ev.on("qr.**", (qrcode: string) => {
  latestQrDataUrl = qrcode;
  isConnected = false;
  logWithColor.green("QR Code mpya iko tayari kwenye kivinjari!");
});

// Web Server ndogo ili Render isiizime bot na uweze kuscan QR Code
const PORT = Number(process.env.PORT) || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    if (isConnected) {
      res.end("<h2>SUREBOY WhatsApp Bot Imeunganishwa na Iko Hewani!</h2>");
    } else if (latestQrDataUrl) {
      res.end(`
        <html>
          <head><meta http-equiv="refresh" content="10"></head>
          <body style="font-family:sans-serif;text-align:center;padding:30px;">
            <h2>Scan QR Code Hii Kwenye WhatsApp Yako</h2>
            <img src="${latestQrDataUrl}" style="width:300px;height:300px;" />
            <p>Ukurasa unajirefresh kila sekunde 10...</p>
          </body>
        </html>
      `);
    } else {
      res.end("<h2>Inawasha Chrome / WhatsApp Session... Subiri sekunde 20 kisha refresh.</h2>");
    }
  })
  .listen(PORT, () => {
    logWithColor.green(`Web server listening on port ${PORT}`);
  });

const bootstrap = (client: Client) => {
  isConnected = true;
  latestQrDataUrl = null;
  logWithColor.green("WhatsApp Bot imeunganishwa kikamilifu!");

  client.onAnyMessage(async (message: Message) => {
    if (!message.body) return;
    const bodyTrimmed = message.body.trim().toLowerCase();

    // Amri za kufungua View Once (.vv, .vvo, #dvo)
    if ([".vv", ".vvo", "#dvo", ".dvo"].includes(bodyTrimmed)) {
      logWithColor.green(`Executing View Once command: ${bodyTrimmed}`);
      await decryptViewOncePhoto(client, message, true);
      return;
    }

    // Amri za asili za bot (!...)
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
  createWAClient({
    useChrome: true,
    executablePath: process.env.CHROME_PATH || "/usr/bin/chromium",
    headless: true,
    qrTimeout: 0,
    authTimeout: 0,
    timeout: 0,
    bypassCSP: true,
    disableSpins: true,
    killProcessOnBrowserClose: true,
    chromiumArgs: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
    ],
  })
    .then((client) => bootstrap(client))
    .catch((err) => {
      logWithColor.red(String(err));
      setTimeout(start, 5000);
    });
};

start();
