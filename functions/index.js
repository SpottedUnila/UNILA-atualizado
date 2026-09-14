const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const bcrypt = require("bcryptjs");

admin.initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 10 });
const db = admin.firestore();
const auth = admin.auth();
const USERS_COLLECTION = "users";
const MIN_KEYWORD_LENGTH = 4;
const MIN_PASSWORD_LENGTH = 6;

function normalizeNick(value) {
  return String(value || "").trim().normalize("NFKC").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
}
function nickClaimDocId(value) { return "__nick__" + encodeURIComponent(normalizeNick(value)); }
function userClaimDocId(uid) { return "__uid__" + String(uid || ""); }
function requireText(value, name, min) {
  const text = String(value || "").trim();
  if (text.length < min) throw new HttpsError("invalid-argument", `${name} inválido.`);
  return text;
}
function genericRecoveryError() {
  return new HttpsError("invalid-argument", "Não foi possível validar os dados de recuperação.");
}

exports.setRecoveryKeyword = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Faça login para cadastrar a palavra-chave.");
  const nick = requireText(request.data && request.data.nick, "Nick", 1);
  const keyword = requireText(request.data && request.data.keyword, "Palavra-chave", MIN_KEYWORD_LENGTH);
  const claimRef = db.collection(USERS_COLLECTION).doc(userClaimDocId(request.auth.uid));
  const claim = await claimRef.get();
  if (!claim.exists || claim.data().uid !== request.auth.uid || normalizeNick(claim.data().nick) !== normalizeNick(nick)) {
    throw new HttpsError("permission-denied", "O nick não pertence à sessão atual.");
  }
  const keywordHash = await bcrypt.hash(keyword, 12);
  const stamp = admin.firestore.FieldValue.serverTimestamp();
  await Promise.all([
    claimRef.set({ recoveryKeywordHash: keywordHash, recoveryKeywordUpdatedAt: stamp }, { merge: true }),
    db.collection(USERS_COLLECTION).doc(nickClaimDocId(nick)).set({ recoveryKeywordHash: keywordHash, recoveryKeywordUpdatedAt: stamp }, { merge: true }),
    db.collection(USERS_COLLECTION).doc(nick).set({ recoveryKeywordHash: keywordHash, recoveryKeywordUpdatedAt: stamp }, { merge: true })
  ]);
  return { ok: true };
});

exports.deleteNickAccount = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Faça login para excluir a conta.");
  const nick = requireText(request.data && request.data.nick, "Nick", 1);
  const uid = request.auth.uid;
  const uidRef = db.collection(USERS_COLLECTION).doc(userClaimDocId(uid));
  const uidDoc = await uidRef.get();
  if (!uidDoc.exists || uidDoc.data().uid !== uid || normalizeNick(uidDoc.data().nick) !== normalizeNick(nick)) {
    throw new HttpsError("permission-denied", "O nick não pertence à sessão atual.");
  }

  const refs = new Map();
  async function collect(collection, field, value) {
    const snapshot = await db.collection(collection).where(field, "==", value).get();
    snapshot.forEach((doc) => refs.set(`${collection}/${doc.id}`, doc.ref));
  }
  await Promise.all([
    collect("chat", "uid", uid), collect("chat", "userId", uid), collect("chat", "authorUid", uid),
    collect("chat", "realNick", nick), collect("chat", "nick", nick),
    collect("desapega", "uid", uid), collect("desapega", "userId", uid), collect("desapega", "ownerUid", uid),
    collect("desapega", "realNick", nick), collect("desapega", "nick", nick)
  ]);
  [
    db.collection(USERS_COLLECTION).doc(nick),
    db.collection(USERS_COLLECTION).doc(nickClaimDocId(nick)),
    uidRef,
    db.collection("notes").doc(uid),
    db.collection("academic_goals").doc(uid)
  ].forEach((ref) => refs.set(ref.path, ref));

  const writer = db.bulkWriter();
  for (const ref of refs.values()) writer.delete(ref);
  await writer.close();
  await auth.deleteUser(uid);
  return { ok: true, uid };
});

exports.deleteNickAccount = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Faça login para excluir a conta.");
  const nick = requireText(request.data && request.data.nick, "Nick", 1);
  const uid = request.auth.uid;
  const uidRef = db.collection(USERS_COLLECTION).doc(userClaimDocId(uid));
  const uidDoc = await uidRef.get();
  if (!uidDoc.exists || uidDoc.data().uid !== uid || normalizeNick(uidDoc.data().nick) !== normalizeNick(nick)) {
    throw new HttpsError("permission-denied", "O nick não pertence à sessão atual.");
  }

  const refs = new Map();
  async function collect(collection, field, value) {
    const snapshot = await db.collection(collection).where(field, "==", value).get();
    snapshot.forEach((doc) => refs.set(`${collection}/${doc.id}`, doc.ref));
  }
  await Promise.all([
    collect("chat", "uid", uid), collect("chat", "userId", uid), collect("chat", "authorUid", uid),
    collect("chat", "realNick", nick), collect("chat", "nick", nick),
    collect("desapega", "uid", uid), collect("desapega", "userId", uid), collect("desapega", "ownerUid", uid),
    collect("desapega", "realNick", nick), collect("desapega", "nick", nick)
  ]);
  [
    db.collection(USERS_COLLECTION).doc(nick),
    db.collection(USERS_COLLECTION).doc(nickClaimDocId(nick)),
    uidRef,
    db.collection("notes").doc(uid),
    db.collection("academic_goals").doc(uid)
  ].forEach((ref) => refs.set(ref.path, ref));

  const writer = db.bulkWriter();
  for (const ref of refs.values()) writer.delete(ref);
  await writer.close();
  await auth.deleteUser(uid);
  return { ok: true, uid };
});

exports.recoverNickPassword = onCall(async (request) => {
  const nick = requireText(request.data && request.data.nick, "Nick", 1);
  const keyword = requireText(request.data && request.data.keyword, "Palavra-chave", MIN_KEYWORD_LENGTH);
  const newPassword = String(request.data && request.data.newPassword || "");
  if (newPassword.length < MIN_PASSWORD_LENGTH) throw new HttpsError("invalid-argument", "Senha inválida.");

  const canonical = await db.collection(USERS_COLLECTION).doc(nickClaimDocId(nick)).get();
  const legacy = canonical.exists ? null : await db.collection(USERS_COLLECTION).doc(nick).get();
  const claim = canonical.exists ? canonical : legacy;
  if (!claim || !claim.exists) throw genericRecoveryError();
  const data = claim.data() || {};
  if (!data.uid || !data.recoveryKeywordHash) throw genericRecoveryError();
  const valid = await bcrypt.compare(keyword, data.recoveryKeywordHash);
  if (!valid) throw genericRecoveryError();
  await auth.updateUser(data.uid, { password: newPassword });
  return { ok: true };
});
