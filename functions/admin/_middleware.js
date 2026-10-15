// Authentication for /admin/* is enforced once by functions/_middleware.js.
// Keep this file as a documented compatibility shim for Pages routing.
export async function onRequest(context) { return context.next(); }
