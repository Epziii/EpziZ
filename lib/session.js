import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs-extra";
import { print } from "./log.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Validate session creds
 */

const validateCreds = async () => {
  try {
    const sessionDir = path.join(__dirname, "..", "session");
    const credsPath = path.join(sessionDir, "creds.json");
    if (!fs.existsSync(credsPath)) {
      throw new Error("Session not found");
    }
    const creds = await fs.readJSON(credsPath);
    if (!creds.noiseKey || !creds.signedIdentityKey || !creds.signedPreKey || !creds.me?.id) {
      throw new Error("Invalid session");
    }
    if (!creds.registered) {
      throw new Error("Session not registered");
    }
    print("success", "SESSION VALIDATED");
  } catch (error) {
    print("error", `Error validating session: ${error.message}`);
    throw new Error(error.message);
  }
};

/**
 * Save credentials
 * @param {string} sessionID
 */

const initSession = async (sessionID) => {
  try {
    const GITHUB_USERNAME = process.env.GITHUB_USERNAME || "Epziii";
    const sessionDir = path.join(__dirname, "..", "session");
    const credsPath = path.join(sessionDir, "creds.json");
    if (fs.existsSync(credsPath)) {
      try {
        const existingCreds = await fs.readJSON(credsPath);
        if (existingCreds && existingCreds.registered && existingCreds.me?.id) {
          return;
        }
      } catch {}
    }
    if (!sessionID || sessionID === "") {
      throw new Error("Enter a valid session");
    }

    let data;

    // Check if sessionID is raw base64 or JSON
    if (sessionID.startsWith("{") && sessionID.endsWith("}")) {
      data = sessionID;
    } else {
      try {
        const decoded = Buffer.from(sessionID, "base64").toString("utf-8");
        if (decoded.startsWith("{") && decoded.includes("noiseKey")) {
          data = decoded;
        }
      } catch {}
    }

    // Otherwise, fetch from GitHub Gist
    if (!data) {
      const usernames = [process.env.GITHUB_USERNAME, "Epziii", "DemmyJay-99"].filter(Boolean);
      let response;
      for (const username of usernames) {
        try {
          const gistURL = `https://gist.githubusercontent.com/${username}/${sessionID}/raw/creds.json`;
          response = await axios.get(gistURL);
          if (response?.status === 200) break;
        } catch {}
      }

      if (!response || response.status !== 200) {
        throw new Error("Invalid session or unable to retrieve gist");
      }
      data = typeof response.data === "string" ? response.data : JSON.stringify(response.data);
    }

    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    fs.writeFileSync(credsPath, data);
    print("success", "Session validated");
  } catch (error) {
    print("error", `Error validating session: ${error.message}`);
    throw error;
  }
};

export { initSession, validateCreds };
