import { readData, writeData } from "../lib/index.js";
import path from "path";
import { fileURLToPath } from "url";
import config from "../config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTO_VV_FILE = path.join(__dirname, "../data/autovv.json");

export const isAutoVvEnabled = async () => {
  try {
    const data = await readData(AUTO_VV_FILE);
    if (typeof data.enabled === "boolean") {
      return data.enabled;
    }
    return true; // Default to true (always auto-detect)
  } catch {
    return true;
  }
};

export const setAutoVv = async (enabled) => {
  await writeData({ enabled }, AUTO_VV_FILE);
};

export const handleAutoViewOnce = async (sock, msg) => {
  try {
    if (msg.key?.fromMe) return;
    const enabled = await isAutoVvEnabled();
    if (!enabled) return;

    let m = msg.message;
    if (m?.ephemeralMessage?.message) {
      m = m.ephemeralMessage.message;
    }

    let actualMessage = null;
    let isViewOnce = false;

    if (m?.viewOnceMessage?.message) {
      actualMessage = m.viewOnceMessage.message;
      isViewOnce = true;
    } else if (m?.viewOnceMessageV2?.message) {
      actualMessage = m.viewOnceMessageV2.message;
      isViewOnce = true;
    } else if (m?.viewOnceMessageV2Extension?.message) {
      actualMessage = m.viewOnceMessageV2Extension.message;
      isViewOnce = true;
    } else {
      const keys = m ? Object.keys(m) : [];
      for (const k of keys) {
        if (m[k]?.viewOnce) {
          actualMessage = m;
          isViewOnce = true;
          break;
        }
      }
    }

    if (!isViewOnce || !actualMessage) return;

    const mediaType = Object.keys(actualMessage)[0];
    const media = actualMessage[mediaType];
    if (!media) return;

    const type = mediaType.replace("Message", "").toLowerCase();
    const { downloadContentFromMessage } = await import("@whiskeysockets/baileys");
    const stream = await downloadContentFromMessage(media, type);

    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }

    const chatID = msg.key.remoteJid;
    const senderID = msg.key.participant || msg.key.remoteJid;
    const pushname = msg.pushName || "Unknown";
    const chatIDisGroup = chatID.endsWith("@g.us");
    const senderNumber = senderID.split("@")[0].split(":")[0];
    const ownerNumber = config.ownerNumber || sock.user?.id?.split(":")[0];
    const targetJid = `${ownerNumber}@s.whatsapp.net`;

    const info =
      `*👁️ View-Once Auto-Detected!*\n` +
      `*From:* ${pushname} (+${senderNumber})\n` +
      (chatIDisGroup ? `*Group:* ${chatID}\n` : `*Chat:* Private DM\n`) +
      (media.caption ? `*Caption:* ${media.caption}\n` : "");

    const sendObject = {};
    if (type === "image") {
      sendObject.image = buffer;
      sendObject.caption = info;
    } else if (type === "video") {
      sendObject.video = buffer;
      sendObject.caption = info;
    } else if (type === "audio") {
      sendObject.audio = buffer;
      sendObject.mimetype = media.mimetype || "audio/ogg; codecs=opus";
      sendObject.ptt = media.ptt || false;
      await sock.sendMessage(targetJid, { text: info });
    } else {
      sendObject.document = buffer;
      sendObject.fileName = "view_once_media";
      sendObject.caption = info;
    }

    await sock.sendMessage(targetJid, sendObject);
    console.log(`[Auto-VV] Automatically forwarded view-once media from +${senderNumber} to ${targetJid}`);
  } catch (err) {
    console.error("[Auto-VV] Error handling auto view-once:", err);
  }
};

export default {
  name: "vv",
  description: "Reveal view-once media or toggle auto-detection",
  category: "Media",
  usage: ".vv (reply to view-once), .vv me, .vv on, .vv off, .vv status",
  execute: async (sock, msg, args, epziz = {}) => {
    try {
      const { chatID, quotedMessage, botID } = epziz;

      if (args[0] === "on") {
        await setAutoVv(true);
        return await sock.sendMessage(chatID, {
          text: "✅ Auto View-Once detection is now *ENABLED*. All view-once media will be automatically sent to your number.",
        });
      }

      if (args[0] === "off") {
        await setAutoVv(false);
        return await sock.sendMessage(chatID, {
          text: "❌ Auto View-Once detection is now *DISABLED*.",
        });
      }

      if (args[0] === "status") {
        const enabled = await isAutoVvEnabled();
        return await sock.sendMessage(chatID, {
          text: `Auto View-Once status: *${enabled ? "ENABLED ✅" : "DISABLED ❌"}*`,
        });
      }

      if (!quotedMessage) {
        return sock.sendMessage(chatID, {
          text: "Reply to a view-once message with *.vv*, or type *.vv on* / *.vv off* to control automatic detection.",
        });
      }

      let actualMessage = quotedMessage;

      if (quotedMessage?.viewOnceMessage?.message) {
        actualMessage = quotedMessage.viewOnceMessage.message;
      } else if (quotedMessage?.viewOnceMessageV2?.message) {
        actualMessage = quotedMessage.viewOnceMessageV2.message;
      } else if (quotedMessage?.viewOnceMessageV2Extension?.message) {
        actualMessage = quotedMessage.viewOnceMessageV2Extension.message;
      }

      const mediaType = Object.keys(actualMessage)[0];
      const media = actualMessage[mediaType];

      if (!media?.viewOnce) {
        return sock.sendMessage(chatID, {
          text: "Quoted message is not a view-once message.",
        });
      }

      const { downloadContentFromMessage } = await import("@whiskeysockets/baileys");
      const type = mediaType.replace("Message", "").toLowerCase();
      const stream = await downloadContentFromMessage(media, type);

      let buffer = Buffer.from([]);
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }

      const sendObject = {};

      if (type === "image") {
        sendObject.image = buffer;
        sendObject.caption = media.caption || "";
      } else if (type === "video") {
        sendObject.video = buffer;
        sendObject.caption = media.caption || "";
      } else if (type === "audio") {
        sendObject.audio = buffer;
        sendObject.mimetype = media.mimetype || "audio/ogg; codecs=opus";
        sendObject.ptt = media.ptt || false;
      } else {
        sendObject.document = buffer;
        sendObject.fileName = "file";
      }

      if (args[0] === "me") {
        return await sock.sendMessage(botID, sendObject);
      }
      await sock.sendMessage(chatID, sendObject);
    } catch (err) {
      console.error("vv error:", err);
      sock.sendMessage(chatID, {
        text: "❌ Failed to reveal view-once.",
      });
    }
  },
};
