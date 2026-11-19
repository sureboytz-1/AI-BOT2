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

let latestQrDataUrl: string | null = null;
let isConnected = false;

ev.on("qr.**", (qrcode: string) => {
  latestQrDataUrl = qrcode;
  isConnected = false;
  logWithColor.green("QR Code mpya iko tayari kwenye kivinjari!");
});

const PORT = Number(process.env.PORT) || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    if (isConnected) {
      res.end("<h2>SUREBOY WhatsApp Bot Imeunganishwa na Iko Hewani!</h2>");
    } else if (latestQrDataUrl) {
      res.end(`
        <html>
          <head><meta http-equiv="refresh" content="8"></head>
          <body style="font-family:sans-serif;text-align:center;padding:30px;">
            <h2>Scan QR Code Hii Kwenye WhatsApp Yako</h2>
            <img src="${latestQrDataUrl}" style="width:300px;height:300px;" />
            <p>Ukurasa unajirefresh kila sekunde 8...</p>
          </body>
        </html>
      `);
    } else {
      res.end(`
        <html>
          <head><meta http-equiv="refresh" content="5"></head>
          <body style="font-family:sans-serif;text-align:center;padding:30px;">
            <h2>Inawasha Chrome / WhatsApp Session...</h2>
            <p>Ukurasa utajirefresh wenyewe kila sekunde 5 hadi QR Code itokee...</p>
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
  latestQrDataUrl = null;
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

  createWAClient({
    useChrome: true,
    executablePath: process.env.CHROME_PATH || "/usr/bin/chromium",
    headless: true,
    qrTimeout: 0,
    authTimeout: 0,
    timeout: 0,
    autoRefresh: true,
    qrRefreshS: 20,
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
