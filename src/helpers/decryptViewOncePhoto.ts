import { Client, Message, decryptMedia } from "@open-wa/wa-automate";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import mime from "mime-types";
import path from "path";
import { logWithColor } from "../utils/logger";
import { sendImageMessage } from "../utils/sender";

const storeImageInDist = (filename: string, image: Buffer) => {
  const ROOTDIR = path.join(__dirname, "../..");
  const DIRPATH = path.join(ROOTDIR, "dist/view-once-images");

  if (!existsSync(DIRPATH)) {
    mkdirSync(DIRPATH, { recursive: true });
  }

  const FILEPATH = path.join(DIRPATH, filename);
  writeFileSync(FILEPATH, image);
  logWithColor.green(`Successfully stored the image at ${FILEPATH}`);

  return FILEPATH;
};

const decryptViewOncePhoto = async (
  client: Client,
  message: Message,
  sendBack?: boolean
) => {
  const quotedMessage = message.quotedMsg;
  const mimeType = quotedMessage?.mimetype;

  if (!quotedMessage || !mimeType) {
    await client.reply(
      message.chatId,
      "_Tafadhali reply ujumbe wa picha/video ya View Once._",
      message.id
    );
    return;
  }

  const senderName = (
    quotedMessage.sender?.pushname ||
    quotedMessage.sender?.name ||
    "user"
  ).replace(/[^a-zA-Z0-9_-]/g, "_");

  const ext = mime.extension(mimeType) || "jpg";
  const filename = `${Date.now()}_from_${senderName}.${ext}`;

  try {
    const decryptedImage = await decryptMedia(quotedMessage);
    const base64 = `data:${mimeType};base64,${decryptedImage.toString("base64")}`;

    const FILEPATH = storeImageInDist(filename, decryptedImage);

    if (sendBack) {
      await sendImageMessage(client, message.chatId, FILEPATH, filename);
    }

    return base64;
  } catch (error: any) {
    logWithColor.red(error?.message || String(error));
    await client.reply(
      message.chatId,
      `_Imeshindwa kufungua View Once: ${error?.message || "Hitilafu ya decryption"}_`,
      message.id
    );
  }
};

export default decryptViewOncePhoto;
