const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const travelDocumentHeaderStyles = `
  .travel-company-wrap { align-items: flex-start; display: flex; gap: 12px; min-width: 0; }
  .travel-company-logo {
    flex: 0 0 auto;
    height: 58px;
    max-height: 58px;
    max-width: 90px;
    object-fit: contain;
    object-position: left top;
    width: auto;
  }
  .travel-company-details { min-width: 0; }
`;

const renderTravelCompanyHeader = (header) => {
  if (!header) return "";

  return `<div class="travel-company-wrap">${
    header.logoUrl
      ? `<img class="travel-company-logo" src="${escapeHtml(header.logoUrl)}" alt="Travel agency logo" />`
      : ""
  }<div class="travel-company-details"><p class="company">${escapeHtml(
    header.companyName,
  )}</p><p class="muted">${escapeHtml(header.address)}</p><p class="muted">${escapeHtml(
    header.phone,
  )}</p><p class="muted">${escapeHtml(header.taxNumber)}</p></div></div>`;
};

module.exports = {
  renderTravelCompanyHeader,
  travelDocumentHeaderStyles,
};
