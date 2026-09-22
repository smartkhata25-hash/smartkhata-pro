const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const ledgerBusinessHeaderStyles = `
  .business-header {
    align-items: center;
    border-bottom: 1px solid #d1d5db;
    display: flex;
    gap: 12px;
    margin-bottom: 10px;
    padding-bottom: 9px;
  }
  .business-header.has-logo { align-items: flex-start; }
  .business-logo {
    flex: 0 0 auto;
    height: 54px;
    object-fit: contain;
    object-position: left top;
    width: 82px;
  }
  .business-details { flex: 1; min-width: 0; text-align: center; }
  .business-name { font-size: 20px; font-weight: 800; margin: 0; }
  .business-contact { font-size: 10px; line-height: 1.45; margin: 2px 0 0; }
`;

const renderLedgerBusinessHeader = (header) => {
  if (!header) return "";

  const logo = header.logoUrl
    ? `<img class="business-logo" src="${escapeHtml(header.logoUrl)}" alt="" onerror="this.remove()" />`
    : "";
  const contact = [header.phone, header.address]
    .filter(Boolean)
    .map((value) => `<div>${escapeHtml(value)}</div>`)
    .join("");

  if (!logo && !header.companyName && !contact) return "";

  return `<header class="business-header${logo ? " has-logo" : ""}">${logo}<div class="business-details">${
    header.companyName
      ? `<p class="business-name">${escapeHtml(header.companyName)}</p>`
      : ""
  }${contact ? `<div class="business-contact">${contact}</div>` : ""}</div></header>`;
};

module.exports = {
  ledgerBusinessHeaderStyles,
  renderLedgerBusinessHeader,
};
