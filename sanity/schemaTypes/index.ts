import {resourceTypes} from './resourceTypes'
import {legalDocumentTypes} from './legalDocumentTypes'
import {packageSpecificationTypes} from './packageSpecificationTypes'

export const schemaTypes = [
  ...packageSpecificationTypes,
  ...resourceTypes,
  ...legalDocumentTypes,
]
