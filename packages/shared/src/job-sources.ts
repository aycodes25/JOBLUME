export const JOB_SOURCES = ['linkedin', 'indeed', 'jobberman', 'myjobmag', 'remotive', 'remoteok', 'weworkremotely', 'himalayas', 'arbeitnow', 'workingnomads', 'jsearch'] as const;
export type JobSource = (typeof JOB_SOURCES)[number];

/** Sources whose jobs only arrive through JSearch or a pasted link. Applying to them is always manual. */
export const LINK_SOURCES = ['linkedin', 'indeed'] as const;
export type LinkSource = (typeof LINK_SOURCES)[number];

export const JOB_FETCH_STATUSES = ['queued', 'done', 'failed'] as const;
export type JobFetchStatus = (typeof JOB_FETCH_STATUSES)[number];

export const JOB_FETCH_REASONS = ['blocked', 'login_required', 'not_found', 'unparseable'] as const;
export type JobFetchReason = (typeof JOB_FETCH_REASONS)[number];
