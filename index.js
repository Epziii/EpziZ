import {
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  makeWASocket,
  Browsers,
} from "@whiskeysockets/baileys";
import { configDotenv } from "dotenv";
configDotenv({
  quiet: true,
  path: "./config.env",
});
import pino from "pino";
import { print } from "./lib/log.js";
import { initSession, validateCreds } from "./lib/session.js";
import { handleGroupUpdate, handleMessage } from "./lib/handlers.js";
import store from "./lib/store.js";
import { exec } from "child_process";
import { pullLatestUpdates } from "./lib/update.js";
import { explicitLog } from "./lib/log.js";
import messagem from "./lib/message.js";
import config from "./config.js";
import qrcode from "qrcode-terminal";

if (process.env.AUTO_UPDATE_BOT !== "true") {
  print("info", "Auto-update is disabled.");
} else {
  await pullLatestUpdates().catch(() => print("error", "Error checking for updates"));
}
setInterval(
  async () => {
    await pullLatestUpdates().catch(() => print("error", "Error checking for updates"));
  },
  1000 * 60 * 60 * 24,
);
let hasSent = false;
let sock;
let isRestarting = false;

const startBot = async () => {
  try {
    if (process.env.SESSION_ID) {
      await initSession(process.env.SESSION_ID);
      await validateCreds();
    }
  } catch (error) {
    print("error", "Error initializing session: " + error.message);
    exec("npm stop");
    process.exit(0);
  }
  const { state, saveCreds } = await useMultiFileAuthState("session");
  const isRegistered = Boolean(state.creds?.registered);
  const useQR = process.env.PAIR_METHOD === "qr";
  const logger = pino({ level: "fatal" });
  sock = makeWASocket({
    auth: state,
    creds: state.creds,
    keys: makeCacheableSignalKeyStore(state.keys, logger.child({ level: "fatal" })),
    logger: logger.child({ level: "fatal" }),
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    getMessage: async (key) => {
      const msgId = key.id;
      explicitLog("Getting message from DB");
      const message = await store.getMessage(msgId);
      return message || "";
    },
    shouldSyncHistoryMessage: () => false,
    printQRInTerminal: false,
    browser: Browsers.android("EpziZ"),
    markOnlineOnConnect: process.env.ALWAYS_ONLINE === "true" || false,
  });

  if (!isRegistered && !useQR) {
    const rawNumber = process.env.PHONE_NUMBER || config.ownerNumber || "";
    const phoneNumber = rawNumber.replace(/[^0-9]/g, "");
    if (phoneNumber) {
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(phoneNumber);
          console.log("\n\x1b[32m╔══════════════════════════════════════════════════════╗\x1b[0m");
          console.log(`\x1b[1m\x1b[33m║  👉 YOUR WHATSAPP PAIRING CODE: \x1b[36m${code}\x1b[33m            ║\x1b[0m`);
          console.log("\x1b[32m╚══════════════════════════════════════════════════════╝\x1b[0m");
          console.log("1. Open WhatsApp on your phone");
          console.log("2. Tap Linked Devices > Link a Device");
          console.log("3. Tap 'Link with phone number instead'");
          console.log(`4. Enter the 8-digit code: ${code}\n`);
        } catch (err) {
          print("error", "Error requesting pairing code: " + err.message);
        }
      }, 3000);
    }
  }

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr && (useQR || !config.ownerNumber)) {
      console.log("\nScan this QR code to link EpziZ:\n");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "open") {
      const user = sock.user.id.split(":")[0] + "@s.whatsapp.net";
      if (!hasSent) {
        const text = await messagem();
        await sock.sendMessage(user, { text: text });
        hasSent = true;
      }
      print("connection", "Connected to whatsapp");
    } else if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect && !isRestarting) {
        isRestarting = true;
        print("connection", "Reconnecting...");
        setTimeout(() => {
          isRestarting = false;
          startBot();
        }, 5000);
      }
    }
  });

  sock.ev.on("messages.upsert", async (message) => {
    try {
      await handleMessage(sock, message);
    } catch (error) {
      console.error("Error in message handler:", error);
    }
  });

  sock.ev.on("group-participants.update", async (update) => {
    try {
      await handleGroupUpdate(sock, update);
    } catch (error) {
      print("error", "Error in group participants update handler: " + error.message);
    }
  });

  sock.ev.on("contacts.update", async (update) => {
    try {
      for (const contact of update) {
        store.saveContact(contact);
      }
    } catch (error) {
      print("error", "Error in contacts update handler: " + error.message);
    }
  });
  sock.ev.on("contacts.upsert", async (update) => {
    try {
      for (const contact of update) {
        store.saveContact(contact);
      }
    } catch (error) {
      print("error", "Error in contacts upsert handler: " + error.message);
    }
  });

  sock.ev.on("messaging-history.set", async (update) => {
    const { messages, contacts } = update;
    try {
      if (!messages || !contacts) {
        print("error", "Received messaging history set without messages or contacts");
        return;
      }
      explicitLog(`Received messaging history set with ${messages.length} messages and ${contacts.length} contacts`);
      for (const message of messages) {
        await store.saveMessage(message);
      }
      for (const contact of contacts) {
        store.saveContact(contact);
      }
    } catch (error) {
      print("error", "Error in messaging history set handler: " + error.message);
    }
  });

  return sock;
};

startBot();
