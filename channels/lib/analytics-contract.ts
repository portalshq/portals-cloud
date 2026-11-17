import { createExperienceRegistry, experienceEvents } from '@portalshq/analytics/experience-events'

export { experienceEvents }
export function channelRegistry() { return createExperienceRegistry() }
