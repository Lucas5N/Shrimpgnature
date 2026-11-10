// Worker entry point: only message plumbing.
import { createAuthority } from "./authority.js";

const authority = createAuthority();

self.onmessage = async (event) => {
  const { type, data } = event.data;
  if (type !== "SIGN_REQUEST") return;

  try {
    const payload = await authority.sign(data);
    self.postMessage({ type: "SIGN_SUCCESS", payload });
  } catch (err) {
    self.postMessage({
      type: "SIGN_ERROR",
      payload: { id: data.id, error: err.message },
    });
  }
};

authority
  .init()
  .then((publicKeys) =>
    self.postMessage({ type: "INIT_SUCCESS", payload: { publicKeys } }),
  )
  .catch((err) =>
    self.postMessage({ type: "INIT_ERROR", payload: { error: err.message } }),
  );
