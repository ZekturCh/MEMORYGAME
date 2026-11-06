import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  endAt, get, orderByKey, query, ref, runTransaction, serverTimestamp, set, startAt, update
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";

async function authorize(db, room) {
  const auth = getAuth(db.app);
  await auth.authStateReady();
  const user = auth.currentUser || (await signInAnonymously(auth)).user;
  const permission = ref(db, `firma-wall-operators/${user.uid}`);
  const role = (await get(permission)).val();
  if (role?.room === room) return true;
  if (role) throw new Error("Este navegador está autorizado para otra sala.");

  const code = prompt(`Código de activación del operador para «${room}»`)?.trim();
  if (!code) return false;
  if (!/^[a-f0-9]{32}$/.test(code)) throw new Error("El código de activación no es válido.");
  try {
    await set(ref(db, `firma-wall-invites/${code}/uid`), user.uid);
    await set(permission, { room, invite: code });
  } catch {
    throw new Error("Firebase rechazó la activación. Revisa que el código esté vigente y corresponda a esta sala.");
  }
  return true;
}

export async function confirmRoomPurge({ db, room, effectsPrefix, resetRef, serverNow, status }) {
  status.textContent = "";
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(room) || room === "clarividencia") {
    throw new Error("El borrado está disponible para salas de Firma e Inspira autorizadas.");
  }
  if (!await authorize(db, room)) return false;
  if (!confirm(`¿Borrar todas las firmas, textos, turnos y efectos de «${room}» de Firebase? Esta acción es permanente.`)) return false;

  const id = crypto.randomUUID();
  const lock = await runTransaction(resetRef, (previous) => {
    if (previous?.until > serverNow()) return;
    return { id, until: Math.floor(serverNow()) + 60_000, cutoff: previous?.cutoff || 0 };
  }, { applyLocally: false });
  if (!lock.committed) throw new Error("Ya hay un borrado en curso en esta sala.");

  status.textContent = "Borrando los datos de la sala…";
  const wall = ref(db, "led-wall");
  try {
    const effects = await get(query(wall, orderByKey(), startAt(effectsPrefix), endAt(`${effectsPrefix}\uf8ff`)));
    const changes = {
      [`${room}/items`]: null,
      [`~firma-start~${room}/items`]: null,
      [`${room}/clear`]: serverTimestamp(),
      [`${room}/reset`]: { id, until: 0, cutoff: serverTimestamp() }
    };
    effects.forEach((child) => {
      if (/^[-\w]{20}$/.test(child.key.slice(effectsPrefix.length))) {
        changes[`${child.key}/items`] = null;
      }
    });
    await update(wall, changes);
    status.textContent = `Datos de «${room}» borrados de Firebase.`;
    return true;
  } catch {
    await runTransaction(resetRef, (current) => current?.id === id && current.until > 0
      ? { ...current, until: 0 } : undefined, { applyLocally: false }).catch(() => {});
    throw new Error("Firebase no confirmó el borrado. Vuelve a intentarlo.");
  }
}
