// Panel 5. Buttons carry data-action / data-seq; ONE click listener handles all rows
// (event delegation), so no window.* globals and no inline onclick.

export function createAuditTable(tbody, { onVerify, onRewrite }) {
  tbody?.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const seq = Number(btn.dataset.seq);
    if (btn.dataset.action === "verify") onVerify(seq);
    else if (btn.dataset.action === "rewrite") onRewrite(seq);
  });

  return {
    render(entries) {
      if (!tbody) return;
      tbody.innerHTML = "";

      if (entries.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #64748b; padding: 12px;">No documents signed yet.</td></tr>`;
        return;
      }

      for (const item of entries) {
        const tr = document.createElement("tr");
        tr.className = "border-b border-slate-700 text-xs font-mono hover:bg-slate-800/50";
        tr.innerHTML = `
          <td style="color: #94a3b8;">#${item.sequence}</td>
          <td style="color: #34d399;">${item.docDigest.slice(0, 10)}...</td>
          <td style="color: #818cf8;">${item.signature.slice(0, 10)}...</td>
          <td style="color: #94a3b8;">${item.chainProof.chainHash.slice(0, 10)}...</td>
          <td>
            <button data-action="verify" data-seq="${item.sequence}" style="padding: 2px 6px; font-size: 10px;">Verify</button>
            <button data-action="rewrite" data-seq="${item.sequence}" class="danger" style="margin-left: 2px; padding: 2px 6px; font-size: 10px;">Rewrite</button>
          </td>`;
        tbody.appendChild(tr);
      }
    },
  };
}
