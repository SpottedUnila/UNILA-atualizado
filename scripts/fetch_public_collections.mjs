#!/usr/bin/env node
import { initializeApp } from "firebase/app";
import {
  collection,
  getDocs,
  getFirestore,
  terminate,
} from "firebase/firestore";

const collections = ["news", "conhecaUnila"];
const firebaseConfig = {
  apiKey: "AIzaSyDCm8jh-gz3T8OkOH2J6ls66t5QizcKwu8",
  authDomain: "app-unila.firebaseapp.com",
  projectId: "app-unila",
  appId: "1:574505875323:web:fb885f0a2ae32b272fafde",
};
const retryableCodes = new Set([
  "aborted",
  "deadline-exceeded",
  "resource-exhausted",
  "unavailable",
]);

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function readCollection(db, name) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const snapshot = await getDocs(collection(db, name));
      const records = snapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      }));
      if (records.length === 0) {
        throw new Error(`A coleção pública ${name} retornou vazia; as prévias atuais serão preservadas.`);
      }
      console.error(`${name}: ${records.length} registros lidos pelo SDK Firebase.`);
      return records;
    } catch (error) {
      lastError = error;
      if (!retryableCodes.has(error?.code) || attempt === 4) break;
      await pause(1000 * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

try {
  const recordsByCollection = {};
  for (const name of collections) {
    recordsByCollection[name] = await readCollection(db, name);
  }
  process.stdout.write(JSON.stringify(recordsByCollection));
} catch (error) {
  console.error(`Não foi possível carregar todas as coleções públicas: ${error?.message || error}`);
  process.exitCode = 1;
} finally {
  await terminate(db);
}
