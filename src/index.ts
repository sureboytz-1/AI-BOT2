import makeWASocket, {
  DisconnectReason,
  downloadContentFromMessage,
  fetchLatestBaileysVersion,
  MediaType,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import http from "http";
import pino from "pino";

let pairingCode: string | null = null;
let isConnected = false;

const PORT = Number(process.env.PORT) || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    const phoneEnv = (process.env.PHONE_NUMBER || "").replace(/[^0-9]/g, "");

    if (isConnected) {
      res.end("<h2>SUREBOY WhatsApp Bot Imeunganishwa na Iko Hewani!</h2>");
    } else if (!phoneEnv) {
      res.end("<h2>Weka PHONE_NUMBER (mfano: 255712345678) kwenye Render Environment!</h2>");
    } else if (pairingCode) {
      res.end(`
        <html>
          <head><meta http-equiv="refresh" content="15"></head>
          <body style="font-family:sans-serif;text-align:center;padding:40px;">
            <h2>Ingiza Pairing Code Hii Kwenye WhatsApp Yako</h2>
            <div style="font-size:38px;font-weight:bold;letter-spacing:6px;background:#f0f0f0;padding:20px 30px;border-radius:10px;display:inline-block;margin:20px 0;">
              ${pairingCode}
            </div>
            <p>Namba: <b>+${phoneEnv}</b></p>
            <p>WhatsApp &gt; Linked Devices &gt; Link a Device &gt; <b>Link with phone number instead</b></p>
          </body>
        </html>
      `);
    } else {
      res.end(`
        <html>
          <head><meta http-equiv="refresh" content="3"></head>
          <body style="font-family:sans-serif;text-align:center;padding:40px;">
            <h2>Inaandaa Pairing Code...</h2>
            <p>Subiri sekunde 5...</p>
          </body>
        </html>
      `);
    }
  })
  .listen(PORT, () => console.log(`Web server listening on port ${PORT}`));

function unwrapMessage(m: any): any {
  if (!m) return null;
  if (m.ephemeralMessage?.message) return unwrapMessage(m.ephemeralMessage.message);
  if (m.viewOnceMessage?.message) return unwrapMessage(m.viewOnceMessage.message);
  if (m.viewOnceMessageV2?.message) return unwrapMessage(m.viewOnceMessageV2.message);
  if (m.viewOnceMessageV2Extension?.message) return unwrapMessage(m.viewOnceMessageV2Extension.message);
  if (m.documentWithCaptionMessage?.message) return unwrapMessage(m.documentWithCaptionMessage.message);
  return m;
}

async function streamToBuffer(stream: AsyncIterable<Buffer>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_session");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    auth: state,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  if (!sock.authState.creds.registered) {
    const phoneNumber = (process.env.PHONE_NUMBER || "").replace(/[^0-9]/g, "");
    if (phoneNumber) {
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(phoneNumber);
          pairingCode = code?.match(/.{1,4}/g)?.join("-") || code;
          console.log(`>>> PAIRING CODE YAKO NI: ${pairingCode} <<<`);
        } catch (err) {
          console.error("Pairing code error:", err);
        }
      }, 3000);
    }
  }

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "open") {
      isConnected = true;
      pairingCode = null;
      console.log("WhatsApp Bot imeunganishwa kikamilifu!");
    } else if (connection === "close") {
      isConnected = false;
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      if (statusCode !== DisconnectReason.loggedOut) {
        setTimeout(startBot, 3000);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const rawMsg of messages) {
      if (!rawMsg?.message) continue;

      const msgContent = unwrapMessage(rawMsg.message);
      const text =
        msgContent?.conversation ||
        msgContent?.extendedTextMessage?.text ||
        "";
      const cmd = text.trim().toLowerCase();

      if ([".vv", ".vvo", "#dvo", ".dvo"].includes(cmd)) {
        try {
          console.log("Amri ya View Once imepokelewa:", cmd);
          const contextInfo = msgContent?.extendedTextMessage?.contextInfo;
          const quotedRaw = contextInfo?.quotedMessage;

          if (!quotedRaw) {
            console.log("Hakuna ujumbe ulio-repliwa.");
            continue;
          }

          const innerMsg = unwrapMessage(quotedRaw);
          let mediaType: MediaType | null = null;
          let mediaObj: any = null;

          if (innerMsg?.imageMessage) {
            mediaType = "image";
            mediaObj = innerMsg.imageMessage;
          } else if (innerMsg?.videoMessage) {
            mediaType = "video";
            mediaObj = innerMsg.videoMessage;
          } else if (innerMsg?.audioMessage) {
            mediaType = "audio";
            mediaObj = innerMsg.audioMessage;
          }

          if (!mediaType || !mediaObj) {
            console.log("Ujumbe ulio-repliwa hauna media:", Object.keys(innerMsg || {}));
            continue;
          }

          const stream = await downloadContentFromMessage(mediaObj, mediaType);
          const buffer = await streamToBuffer(stream);

          const myJid = sock.user?.id?.split(":")[0] + "@s.whatsapp.net";
          const targetJid = myJid || rawMsg.key.remoteJid!;

          if (mediaType === "image") {
            await sock.sendMessage(targetJid, {
              image: buffer,
              caption: "View Once Imefunguliwa (SUREBOY Bot)",
            });
          } else if (mediaType === "video") {
            await sock.sendMessage(targetJid, {
              video: buffer,
              caption: "View Once Imefunguliwa (SUREBOY Bot)",
            });
          } else if (mediaType === "audio") {
            await sock.sendMessage(targetJid, {
              audio: buffer,
              mimetype: "audio/mp4",
              ptt: true,
            });
          }

          console.log("View Once imefunguliwa na kutumwa kikamilifu!");
        } catch (err) {
          console.error("Hitilafu wakati wa kufungua View Once:", err);
        }
      }
    }
  });
}

startBot();
