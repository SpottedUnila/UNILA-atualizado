const ROOT_FOLDER_NAME = 'Vida Unileira - Matérias Ativas';
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_DELETE_BATCH = 50;
const FIREBASE_WEB_API_KEY = 'AIzaSyDCm8jh-gz3T8OkOH2J6ls66t5QizcKwu8';
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]);

function doGet() {
  return json_({ ok: true, service: 'Vida Unileira Drive Upload', message: 'Online' });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('Corpo da requisição ausente.');
    const payload = JSON.parse(e.postData.contents);

    if (payload.action === 'delete') return deleteDriveFiles_(payload);

    const name = sanitizeName_(payload.name);
    const mimeType = String(payload.mimeType || '').toLowerCase();
    const uid = String(payload.uid || '').trim();
    const subjectId = String(payload.subjectId || '').trim();
    const base64 = String(payload.base64 || '').replace(/^data:[^;]+;base64,/, '');
    if (!name || !uid || !subjectId || !base64) throw new Error('Dados obrigatórios ausentes.');
    if (!ALLOWED_MIME_TYPES.has(mimeType)) throw new Error('Tipo de arquivo não permitido.');

    const bytes = Utilities.base64Decode(base64);
    if (bytes.length > MAX_FILE_BYTES) throw new Error('O arquivo deve ter no máximo 10 MB.');

    const root = getOrCreateFolder_(ROOT_FOLDER_NAME);
    const userFolder = getOrCreateFolder_(root, 'uid-' + sanitizeName_(uid).slice(0, 80));
    const subjectFolder = getOrCreateFolder_(userFolder, 'materia-' + sanitizeName_(subjectId).slice(0, 80));
    const blob = Utilities.newBlob(bytes, mimeType, name);
    const file = subjectFolder.createFile(blob);
    file.setDescription(String(payload.description || '').slice(0, 500));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return json_({
      ok: true,
      id: file.getId(),
      name: file.getName(),
      size: bytes.length,
      mimeType: mimeType,
      url: 'https://drive.google.com/file/d/' + file.getId() + '/view',
      downloadUrl: 'https://drive.google.com/uc?export=download&id=' + file.getId(),
      insertedAt: Date.now()
    });
  } catch (error) {
    const result = { ok: false, error: String(error && error.message || error) };
    if (error && error.code) result.code = error.code;
    return json_(result);
  }
}

function deleteDriveFiles_(payload) {
  const uid = verifyFirebaseIdToken_(String(payload.idToken || '').trim());
  const rawIds = Array.isArray(payload.fileIds) ? payload.fileIds : [payload.fileId];
  const fileIds = Array.from(new Set(rawIds.map(id => String(id || '').trim()).filter(Boolean)));
  if (!fileIds.length) throw codedError_('MISSING_FILE_ID', 'Nenhum arquivo foi informado.');
  if (fileIds.length > MAX_DELETE_BATCH) throw codedError_('BATCH_TOO_LARGE', 'Exclua no máximo 50 arquivos por solicitação.');

  const files = [];
  fileIds.forEach(id => {
    let file;
    try {
      file = DriveApp.getFileById(id);
    } catch (error) {
      throw codedError_('FILE_NOT_ACCESSIBLE', 'Não foi possível localizar o arquivo na conta de destino do Drive.');
    }
    if (!file.isTrashed() && !fileBelongsToUid_(file, uid)) {
      throw codedError_('FILE_NOT_OWNED', 'Este arquivo não pertence à pasta deste usuário na conta de destino do Drive.');
    }
    files.push(file);
  });

  let movedToTrash = 0;
  files.forEach(file => {
    if (!file.isTrashed()) {
      file.setTrashed(true);
      movedToTrash++;
    }
  });
  return json_({ ok: true, movedToTrash: movedToTrash, count: files.length });
}

function verifyFirebaseIdToken_(idToken) {
  if (!idToken) throw codedError_('AUTH_REQUIRED', 'A sessão do usuário expirou. Entre novamente no app.');
  const response = UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(FIREBASE_WEB_API_KEY),
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ idToken: idToken }),
      muteHttpExceptions: true
    }
  );
  if (response.getResponseCode() !== 200) {
    throw codedError_('AUTH_INVALID', 'Não foi possível validar a sessão Firebase. Entre novamente no app.');
  }
  let data;
  try { data = JSON.parse(response.getContentText()); }
  catch (error) { throw codedError_('AUTH_INVALID', 'A validação da sessão Firebase falhou.'); }
  const user = data && data.users && data.users[0];
  if (!user || !user.localId) throw codedError_('AUTH_INVALID', 'A sessão Firebase é inválida ou expirou.');
  return String(user.localId);
}

function fileBelongsToUid_(file, uid) {
  const expectedUserFolder = 'uid-' + sanitizeName_(uid).slice(0, 80);
  const subjectFolders = file.getParents();
  while (subjectFolders.hasNext()) {
    const subjectFolder = subjectFolders.next();
    if (subjectFolder.getName().indexOf('materia-') !== 0) continue;
    const userFolders = subjectFolder.getParents();
    while (userFolders.hasNext()) {
      const userFolder = userFolders.next();
      if (userFolder.getName() !== expectedUserFolder) continue;
      const roots = userFolder.getParents();
      while (roots.hasNext()) {
        if (roots.next().getName() === ROOT_FOLDER_NAME) return true;
      }
    }
  }
  return false;
}

function codedError_(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function getOrCreateFolder_(parentOrName, maybeName) {
  if (typeof parentOrName === 'string') {
    const folders = DriveApp.getFoldersByName(parentOrName);
    return folders.hasNext() ? folders.next() : DriveApp.createFolder(parentOrName);
  }
  const name = String(maybeName || '');
  const folders = parentOrName.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parentOrName.createFolder(name);
}

function sanitizeName_(value) {
  return String(value || '').replace(/[\\/:*?"<>|#%{}\[\]]/g, '_').replace(/\s+/g, ' ').trim();
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
