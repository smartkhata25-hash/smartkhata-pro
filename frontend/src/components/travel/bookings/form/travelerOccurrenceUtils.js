const getId = (value) => (typeof value === 'object' ? value?._id || value?.id : value) || '';

export const buildTravelerOccurrences = (travelerIds = []) => {
  const counts = new Map();

  return travelerIds.map((value, absoluteIndex) => {
    const travelerId = getId(value);
    const occurrence = counts.get(String(travelerId)) || 0;
    counts.set(String(travelerId), occurrence + 1);

    return {
      travelerId,
      occurrence,
      absoluteIndex,
      key: `${travelerId}:${occurrence}`,
    };
  });
};

export const getTravelerAddDecision = (travelerIds = [], travelerId) => ({
  duplicate: travelerIds.some((value) => String(getId(value)) === String(getId(travelerId))),
  travelerId: getId(travelerId),
});

export const alignTravelerDetailRows = (travelerIds = [], rows = [], createRow = () => ({})) => {
  const queues = new Map();
  const unassigned = [];

  rows.forEach((row) => {
    const travelerId = String(getId(row?.travelerId));
    if (!travelerId) {
      unassigned.push(row);
      return;
    }
    const queue = queues.get(travelerId) || [];
    queue.push(row);
    queues.set(travelerId, queue);
  });

  return travelerIds.map((value) => {
    const travelerId = getId(value);
    const queue = queues.get(String(travelerId)) || [];
    const existing = queue.shift() || unassigned.shift();
    queues.set(String(travelerId), queue);
    return existing ? { ...existing, travelerId } : { ...createRow(travelerId), travelerId };
  });
};

export const appendTravelerOccurrence = (item = {}, travelerId, createTicketRow, createVisaRow) => {
  const nextTravelerIds = [...(item.travelerIds || []), getId(travelerId)];
  const next = { ...item, travelerIds: nextTravelerIds };

  if (item.itemType === 'air_ticket') {
    next.ticketDetails = {
      ...(item.ticketDetails || {}),
      passengerTickets: alignTravelerDetailRows(
        nextTravelerIds,
        item.ticketDetails?.passengerTickets || [],
        createTicketRow
      ),
    };
  }

  if (item.itemType === 'visit_visa') {
    next.visaDetails = {
      ...(item.visaDetails || {}),
      travelerVisas: alignTravelerDetailRows(
        nextTravelerIds,
        item.visaDetails?.travelerVisas || [],
        createVisaRow
      ),
    };
  }

  return next;
};

export const removeTravelerOccurrence = (item = {}, absoluteIndex) => {
  const travelerIds = [...(item.travelerIds || [])];
  if (absoluteIndex < 0 || absoluteIndex >= travelerIds.length) return item;

  const alignedTickets = alignTravelerDetailRows(
    travelerIds,
    item.ticketDetails?.passengerTickets || []
  );
  const alignedVisas = alignTravelerDetailRows(
    travelerIds,
    item.visaDetails?.travelerVisas || []
  );
  travelerIds.splice(absoluteIndex, 1);
  alignedTickets.splice(absoluteIndex, 1);
  alignedVisas.splice(absoluteIndex, 1);

  return {
    ...item,
    travelerIds,
    ...(item.itemType === 'air_ticket'
      ? { ticketDetails: { ...(item.ticketDetails || {}), passengerTickets: alignedTickets } }
      : {}),
    ...(item.itemType === 'visit_visa'
      ? { visaDetails: { ...(item.visaDetails || {}), travelerVisas: alignedVisas } }
      : {}),
  };
};

export const updateTravelerDetailOccurrence = (
  travelerIds,
  rows,
  absoluteIndex,
  updates,
  createRow = () => ({})
) => {
  const aligned = alignTravelerDetailRows(travelerIds, rows, createRow);
  if (!aligned[absoluteIndex]) return aligned;
  aligned[absoluteIndex] = { ...aligned[absoluteIndex], ...updates };
  return aligned;
};
