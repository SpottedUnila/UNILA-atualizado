const ROOT_FOLDER_NAME = 'Vida Unileira - Matérias Ativas';
const MAX_FILE_BYTES = 10 * 1024 * 1024;
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
    return json_({ ok: false, error: String(error && error.message || error) });
  }
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
