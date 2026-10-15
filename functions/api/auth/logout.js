import {redirect} from '../../../admin-lib/session.js';
export function onRequestGet() {
  return redirect('/', ['photo_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax']);
}
