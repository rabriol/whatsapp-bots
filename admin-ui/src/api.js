async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  getAnnouncements: () => request('/announcements'),
  createAnnouncement: (data) => request('/announcements', { method: 'POST', body: JSON.stringify(data) }),
  updateAnnouncement: (id, data) => request(`/announcements/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAnnouncement: (id) => request(`/announcements/${id}`, { method: 'DELETE' }),

  getBirthdays: () => request('/birthdays'),
  createBirthday: (data) => request('/birthdays', { method: 'POST', body: JSON.stringify(data) }),
  updateBirthday: (rowNumber, data) => request(`/birthdays/${rowNumber}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBirthday: (rowNumber) => request(`/birthdays/${rowNumber}`, { method: 'DELETE' }),

  getBirthdaySchedule: () => request('/birthday-schedule'),
  updateBirthdaySchedule: (data) => request('/birthday-schedule', { method: 'PUT', body: JSON.stringify(data) }),

  getEventsPreview: () => request('/events/preview'),
  getAllEvents: () => request('/events/all'),
  createEvent: (data) => request('/events', { method: 'POST', body: JSON.stringify(data) }),
  updateEvent: (rowNumber, data) => request(`/events/${rowNumber}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateEventStatus: (rowNumber, status) => request(`/events/${rowNumber}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  getEventsWindow: () => request('/events/window'),
  updateEventsWindow: (windowDays) => request('/events/window', { method: 'PUT', body: JSON.stringify({ windowDays }) }),

  getSendSchedule: () => request('/events/send-schedule'),
  updateSendSchedule: (data) => request('/events/send-schedule', { method: 'PUT', body: JSON.stringify(data) }),
};
