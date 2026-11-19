import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
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

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_session");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    auth: state,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
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
    for (const msg of messages) {
      if (!msg?.message) continue;

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        "";
      const cmd = text.trim().toLowerCase();

      if ([".vv", ".vvo", "#dvo", ".dvo"].includes(cmd)) {
        try {
          console.log("Amri ya View Once imepokelewa:", cmd);
          const quoted =
            msg.message.extendedTextMessage?.contextInfo?.quotedMessage;

          if (!quoted) {
            console.log("Hakuna ujumbe ulio-repliwa (quoted).");
            continue;
          }

          // Tafuta ujumbe wa View Once kwenye miundo yote ya WhatsApp
          const innerMsg =
            quoted.viewOnceMessageV2?.message ||
            quoted.viewOnceMessageV2Extension?.message ||
            quoted.viewOnceMessage?.message ||
            quoted;

          const mediaType = innerMsg.imageMessage
            ? "image"
            : innerMsg.videoMessage
            ? "video"
            : innerMsg.audioMessage
            ? "audio"
            : null;

          if (!mediaType) {
            console.log("Ujumbe ulio-repliwa hauna picha/video/audio:", Object.keys(innerMsg));
            continue;
          }

          // Ondoa flag ya viewOnce ili Baileys ipakuwe media vizuri
          const cleanMedia: any = { ...innerMsg };
          if (cleanMedia.imageMessage) cleanMedia.imageMessage = { ...cleanMedia.imageMessage, viewOnce: false };
          if (cleanMedia.videoMessage) cleanMedia.videoMessage = { ...cleanMedia.videoMessage, viewOnce: false };
          if (cleanMedia.audioMessage) cleanMedia.audioMessage = { ...cleanMedia.audioMessage, viewOnce: false };

          const buffer = await downloadMediaMessage(
            { key: msg.key, message: cleanMedia } as any,
            "buffer",
            {},
            { logger: pino({ level: "silent" }), reuploadRequest: sock.updateMediaMessage }
          );

          const chatJid = msg.key.remoteJid!;

          if (mediaType === "image") {
            await sock.sendMessage(
              chatJid,
              { image: buffer as Buffer, caption: "View Once Imefunguliwa" },
              { quoted: msg }
            );
          } else if (mediaType === "video") {
            await sock.sendMessage(
              chatJid,
              { video: buffer as Buffer, caption: "View Once Imefunguliwa" },
              { quoted: msg }
            );
          } else if (mediaType === "audio") {
            await sock.sendMessage(
              chatJid,
              { audio: buffer as Buffer, mimetype: "audio/mp4", ptt: true },
              { quoted: msg }
            );
          }
          console.log("View Once imetumwa kikamilifu!");
        } catch (err) {
          console.error("Hitilafu wakati wa kufungua View Once:", err);
        }
      }
    }
  });
}

startBot();
