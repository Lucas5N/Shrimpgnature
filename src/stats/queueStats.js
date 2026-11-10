// Queueing statistics. computeQueueStatistics is a PURE function.

/** Sliding window of the last N (wait, service) samples. */
export function createTelemetryWindow(size = 100) {
  const waits = []; // Wq, seconds
  const services = []; // S, seconds

  return {
    record(tArrival, tQueueExit, serviceTimeSeconds) {
      waits.push((tQueueExit - tArrival) / 1000);
      services.push(serviceTimeSeconds);
      if (waits.length > size) {
        waits.shift();
        services.shift();
      }
    },
    snapshot(lambda) {
      return computeQueueStatistics(waits, services, lambda);
    },
  };
}

/**
 * @param waits    observed waiting times Wq (s)
 * @param services observed service times S (s)
 * @param lambda   arrival rate (req/s). NOTE: this is the CONFIGURED rate,
 *                 not a measured one.
 * @returns stats object, or null if fewer than 5 samples.
 */
export function computeQueueStatistics(waits, services, lambda) {
  const n = services.length;
  if (n < 5) return null;

  const meanS = services.reduce((a, v) => a + v, 0) / n;
  const mu = 1 / meanS;
  const varianceS = services.reduce((a, v) => a + (v - meanS) ** 2, 0) / (n - 1);
  const meanWq = waits.reduce((a, v) => a + v, 0) / waits.length;
  const rho = lambda / mu;

  let mm1PredictedWq = Infinity;
  let mg1PredictedWq = Infinity;
  if (rho < 1.0) {
    mm1PredictedWq = rho / (mu * (1 - rho)); // M/M/1
    mg1PredictedWq = (lambda * (varianceS + meanS ** 2)) / (2 * (1 - rho)); // Pollaczek-Khinchine
  }

  return { lambda, mu, rho, meanS, varianceS, meanWq, mm1PredictedWq, mg1PredictedWq };
}
