import {blogDocumentTypes} from './blogTypes'
import {resourceTypes} from './resourceTypes'
import {legalDocumentTypes} from './legalDocumentTypes'
import {packageSpecificationTypesWithOffers} from './packageSpecificationTypes'
import {useCaseDocumentTypes} from './useCaseTypes'

export const schemaTypes = [
  ...blogDocumentTypes,
  ...packageSpecificationTypesWithOffers,
  ...resourceTypes,
  ...legalDocumentTypes,
  ...useCaseDocumentTypes,
]
