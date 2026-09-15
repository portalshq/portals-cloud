import {resourceTypes} from './resourceTypes'
import {legalDocumentTypes} from './legalDocumentTypes'
import {packageSpecificationTypesWithOffers} from './packageSpecificationTypes'
import {useCaseDocumentTypes} from './useCaseTypes'

export const schemaTypes = [
  ...packageSpecificationTypesWithOffers,
  ...resourceTypes,
  ...legalDocumentTypes,
  ...useCaseDocumentTypes,
]
