// FIFO queue + single-server state machine (IDLE / PROCESSING).
// Knows nothing about workers or DOM: you inject `dispatch`.

export function createFifoServer({ dispatch, onDepthChange = () => {} }) {
  const queue = [];
  let state = "IDLE";

  function next() {
    if (state === "PROCESSING" || queue.length === 0) return;
    const request = queue.shift();
    state = "PROCESSING";
    request.tQueueExit = performance.now(); // end of waiting time
    onDepthChange(queue.length);
    dispatch(request);
  }

  /** Add a job. Stamps arrival time, starts service if the server is idle. */
  function enqueue(request) {
    request.tArrival = performance.now();
    queue.push(request);
    onDepthChange(queue.length);
    next();
  }

  /** Call when the server has finished (success OR error). */
  function complete() {
    state = "IDLE";
    next();
  }

  return { enqueue, complete, depth: () => queue.length };
}
