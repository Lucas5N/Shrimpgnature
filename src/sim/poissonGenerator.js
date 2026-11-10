// Synthetic Poisson traffic: exponential inter-arrival times with rate lambda.
import { sha256Bytes } from "../lib/encoding.js";

export function poissonDelayMs(lambda, rand = Math.random) {
  return (-Math.log(1 - rand()) / lambda) * 1000;
}

export function createPoissonGenerator({ submit, onStateChange = () => {}, log = () => {} }) {
  let active = false;

  function stop() {
    if (!active) return;
    active = false;
    onStateChange(false);
  }

  function start({ lambda, total, algorithm = "ECDSA" }) {
    active = true;
    onStateChange(true);
    let count = 0;
    log(`🚀 Poisson generator started (λ=${lambda} req/s, target=${total})`);

    function scheduleNext() {
      if (!active) return;
      if (count >= total) {
        stop();
        log(`🏁 Finished generating ${total} Poisson requests.`);
        return;
      }
      setTimeout(async () => {
        if (!active) return;
        count++;
        const digest = await sha256Bytes(`Poisson doc #${count} at ${performance.now()}`);
        submit(digest, algorithm);
        scheduleNext();
      }, poissonDelayMs(lambda));
    }

    scheduleNext();
  }

  return { start, stop, isActive: () => active };
}
