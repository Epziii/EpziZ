import { readData, writeData } from "../lib/index.js";
import path from "path";
import { fileURLToPath } from "url";
import config from "../config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTO_VV_FILE = path.join(__dirname, "../data/autovv.json");

const processedViewOnce = new Set();

export const isAutoVvEnabled = async () => {
  try {
    const data = await readData(AUTO_VV_FILE);
    if (typeof data.enabled === "boolean") {
      return data.enabled;
    }
    return true; // Enabled by default
  } catch {
    return true;
  }
};

export const setAutoVv = async (enabled) => {
  await writeData({ enabled }, AUTO_VV_FILE);
};

export const extractViewOnceMedia = (msg) => {
  if (!msg?.message) return null;
  let m = msg.message;

  if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
  if (m.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message;
  if (m.associatedChildMessage?.message) m = m.associatedChildMessage.message;

  let content = null;

  if (m.viewOnceMessage?.message) {
    content = m.viewOnceMessage.message;
  } else if (m.viewOnceMessageV2?.message) {
    content = m.viewOnceMessageV2.message;
  } else if (m.viewOnceMessageV2Extension?.message) {
    content = m.viewOnceMessageV2Extension.message;
  } else {
    for (const k of ["imageMessage", "videoMessage", "audioMessage", "documentMessage"]) {
      if (m[k]?.viewOnce) {
        content = m;
        break;
      }
    }
  }

  if (!content) return null;

  for (const k of ["imageMessage", "videoMessage", "audioMessage", "documentMessage"]) {
    if (content[k]) {
      const type = k.replace("Message", "").toLowerCase();
      return { media: content[k], type };
    }
  }

  return null;
};

export const handleAutoViewOnce = async (sock, msg) => {
  try {
    const msgId = msg?.key?.id;
    if (!msgId) return;

    if (processedViewOnce.has(msgId)) return;

    const enabled = await isAutoVvEnabled();
    if (!enabled) return;

    const viewOnceData = extractViewOnceMedia(msg);
    if (!viewOnceData) return;

    // Track to prevent duplicate forwarding
    processedViewOnce.add(msgId);
    if (processedViewOnce.size > 500) {
      const first = processedViewOnce.values().next().value;
      processedViewOnce.delete(first);
    }

    const { media, type } = viewOnceData;
    console.log(`[Auto-VV] 👁️ Detected View-Once (${type}) in message ${msgId}. Downloading...`);

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

    // Priority target is botLid (same as .vv me), followed by userJid and ownerJid
    const botLid = sock.user?.lid ? (sock.user.lid.split(":")[0] + "@lid") : null;
    const userJid = sock.user?.id ? (sock.user.id.split(":")[0] + "@s.whatsapp.net") : null;
    const ownerJid = config.ownerNumber ? `${config.ownerNumber.replace(/[^0-9]/g, "")}@s.whatsapp.net` : null;

    const info =
      `*👁️ OnceView Auto-Detected!*` +
      `\n*From:* ${pushname} (+${senderNumber})` +
      (chatIDisGroup ? `\n*Group:* ${chatID}` : `\n*Chat:* Private DM`) +
      (media.caption ? `\n*Caption:* ${media.caption}` : "");

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
    } else {
      sendObject.document = buffer;
      sendObject.fileName = media.fileName || "view_once_media";
      sendObject.caption = info;
    }

    const targets = [botLid, userJid, ownerJid].filter(Boolean);
    const uniqueTargets = [...new Set(targets)];

    let sent = false;
    for (const target of uniqueTargets) {
      try {
        if (type === "audio") {
          await sock.sendMessage(target, { text: info });
        }
        await sock.sendMessage(target, sendObject);
        console.log(`[Auto-VV] ✅ Successfully forwarded view-once to ${target}`);
        sent = true;
        break;
      } catch (sendErr) {
        console.error(`[Auto-VV] Failed sending to ${target}: ${sendErr.message}`);
      }
    }

    if (!sent) {
      console.error("[Auto-VV] ❌ Could not deliver view-once to any target JID.");
    }
  } catch (err) {
    console.error("[Auto-VV] ❌ Error in auto view-once handler:", err);
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
          text: "✅ Auto View-Once detection is now *ENABLED*. All view-once media will be automatically sent to your private chat.",
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

      const viewOnceData = extractViewOnceMedia({ message: quotedMessage });

      if (!viewOnceData) {
        return sock.sendMessage(chatID, {
          text: "Quoted message is not a view-once message.",
        });
      }

      const { media, type } = viewOnceData;
      const { downloadContentFromMessage } = await import("@whiskeysockets/baileys");
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
        sendObject.fileName = media.fileName || "file";
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
